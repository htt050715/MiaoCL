// Extract declarative configuration facts; never execute client code or change a game.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const roots=process.argv.slice(2)
if(!roots.length)throw Error('Usage: node scripts/import-meteor-schema.cjs <Meteor source root> [addon source roots]')
const files=[]
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())scan(f);else if(f.endsWith('.java'))files.push(f)}}
for(const root of roots)scan(path.resolve(root,'src/main/java'))
const sources=files.map(file=>({file,source:fs.readFileSync(file,'utf8')})),enums=new Map()
function enumFacts(source){const result={};for(const m of source.matchAll(/\benum\s+(\w+)(?:\s+implements[^{}]+)?\s*\{/g)){
 let depth=0,start=m.index+m[0].length,quote='',escape=false,chunks=[]
 for(let i=start;i<source.length;i++){const c=source[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue}if(c==='"'||c==="'"){quote=c;continue}if('({['.includes(c))depth++;else if(')}]'.includes(c)){if(depth===0){chunks.push(source.slice(start,i));break}depth--}if(depth===0&&(c===','||c===';')){chunks.push(source.slice(start,i));start=i+1;if(c===';')break}}
 const values=chunks.map(c=>c.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|@\w+(?:\.\w+)*(?:\([^)]*\))?/g,'').trim()).map(c=>{const name=/^(\w+)/.exec(c)?.[1];const display=/^\w+\s*\(\s*"([^"]+)"/.exec(c)?.[1];return name?{name,value:display??name}:null}).filter(Boolean)
 if(values.length)result[m[1]]=values
}return result}
for(const {source}of sources)for(const[k,v]of Object.entries(enumFacts(source))){if(!enums.has(k))enums.set(k,v);else enums.set(k,null)}
const modules={}
for(const {file,source}of sources){
 const module=/super\(\s*([\w.]+)\s*,\s*"([^"]+)"/.exec(source);if(!module||!(/extends\s+(?:\w*Module|Module)\b/.test(source)))continue
 const name=module[2],category=module[1].split('.').at(-1),groups={}
 for(const m of source.matchAll(/SettingGroup\s+(\w+)\s*=\s*settings\.(getDefaultGroup\(\)|createGroup\("([^"]+)"\))/g))groups[m[1]]=m[3]??'General'
 const settings=[],builders=[...source.matchAll(/(\w+)\.add\(\s*new\s+(\w+Setting)\.Builder(?:<([^>]+)>)?\(\)/g)],localEnums=enumFacts(source)
 for(let i=0;i<builders.length;i++){
  const b=builders[i];let end=b.index,depth=0,quote='',escape=false
  for(let j=source.indexOf('(',b.index);j<source.length;j++){const c=source[j];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue}if(c==='"'||c==="'"){quote=c;continue}if(c==='(')depth++;if(c===')'&&--depth===0){end=j+1;break}}
  const segment=source.slice(b.index,end),settingName=/\.name\("([^"]+)"\)/.exec(segment)?.[1]
  if(!settingName)continue
  const item={name:settingName,group:groups[b[1]]??b[1],kind:b[2]}
  const numeric=k=>{const match=new RegExp('\\.'+k+'\\(\\s*(-?\\d+(?:\\.\\d+)?)[dDfF]?\\s*\\)').exec(segment);return match?Number(match[1]):undefined}
  if(['IntSetting','DoubleSetting'].includes(b[2])){
   item.sliderMin=numeric('sliderMin')??0;item.sliderMax=numeric('sliderMax')??10
   for(const key of ['min','max']){const v=numeric(key);if(v!==undefined)item[key]=v}
   for(const key of ['range','sliderRange']){const m=new RegExp('\\.'+key+'\\(\\s*(-?\\d+(?:\\.\\d+)?)[dDfF]?\\s*,\\s*(-?\\d+(?:\\.\\d+)?)[dDfF]?\\s*\\)').exec(segment);if(m){item[key==='range'?'min':'sliderMin']=Number(m[1]);item[key==='range'?'max':'sliderMax']=Number(m[2])}}
   if(/\.noSlider\(\)/.test(segment))item.noSlider=true
  }
  if(b[2]==='EnumSetting'){
   const type=b[3]?.split('.').at(-1);let values=localEnums[type]??enums.get(type)
   if(values){item.enumType=type;item.options=values.map(v=>v.value);item.enumNames=Object.fromEntries(values.map(v=>[v.value,v.name]))}
  }
  settings.push(item)
 }
 modules[name]={category,settings}
}
const output={sources:roots.map((root,i)=>({name:path.basename(root),fingerprint:crypto.createHash('sha256').update(sources.filter(s=>s.file.startsWith(path.resolve(root)+path.sep)).map(s=>s.source).join('\n')).digest('hex')})),modules}
fs.writeFileSync('src/shared/meteorSchema.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({modules:Object.keys(modules).length,settings:Object.values(modules).reduce((n,m)=>n+m.settings.length,0),flight:modules.flight}))
