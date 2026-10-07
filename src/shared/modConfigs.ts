import type {ConfigCatalog,ConfigNode} from './clientConfigs'
export interface ConfigModIdentity {id:string;name:string;version:string;disabled?:boolean;icon?:string}
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'')
export function groupModConfigs(files:string[],installed:ConfigModIdentity[]): NonNullable<ConfigCatalog['mods']> {
  const identities=new Map<string,ConfigModIdentity>();for(const mod of installed)if(!identities.has(mod.id)||identities.get(mod.id)!.disabled)identities.set(mod.id,mod)
  const mods:NonNullable<ConfigCatalog['mods']>=[...identities.values()].map(mod=>({...mod,files:[]})),other=new Map<string,NonNullable<ConfigCatalog['mods']>[number]>()
  for(const file of files){
    const parts=file.split('/'),base=parts[0]==='config'||parts[0]==='defaultconfigs'?parts[1].replace(/\.[^.]+$/,''):parts[0]
    const normalized=normalize(base),candidates=mods.filter(m=>{const ids=[m.id,m.name];if(m.id==='meteor-client')ids.push('meteorclient','baritone');return ids.some(id=>{const n=normalize(id);return n.length>=3&&(normalized===n||normalized.startsWith(n))})})
    const exact=candidates.filter(m=>[m.id,m.name].some(id=>normalize(id)===normalized))
    const winner=exact.length===1?exact[0]:candidates.length===1?candidates[0]:undefined
    if(winner){winner.files.push(file);winner.association='按配置路径识别'}
    else{const key=parts[0]+':'+base,special=({slimefunhelper:'SlimefunHelper','meteor-client':'Meteor',baritone:'Baritone'} as Record<string,string>)[base];if(!other.has(key))other.set(key,{id:special?base:key,name:special??base,version:'',files:[],association:special?'客户端配置':'未确认所属模组'});other.get(key)!.files.push(file)}
  }
  return [...mods,...other.values()].sort((a,b)=>Number(b.files.length>0)-Number(a.files.length>0)||a.name.localeCompare(b.name))
}
export function modSettingLabel(translations:Record<string,string>,id:string,path:string[]):string {
  const key=path.join('.'),leaf=path.at(-1)??id
  for(const candidate of [`${id}.config.${key}`,`${id}.config.${leaf}`,`config.${id}.${key}`,`config.${id}.${leaf}`,`text.autoconfig.${id}.option.${key}`,`text.autoconfig.${id}.option.${leaf}`,`${id}.options.${leaf}`])if(translations[candidate])return translations[candidate]
  return smartFallbackLabel(leaf)
}
export function modSettingDescription(translations:Record<string,string>,id:string,path:string[]):string {
  const key=path.join('.'),leaf=path.at(-1)??id
  for(const candidate of [`text.autoconfig.${id}.option.${key}.@Tooltip`,`${id}.config.${key}.tooltip`,`${id}.config.${leaf}.tooltip`,`${id}.config.${key}.description`])if(translations[candidate])return translations[candidate]
  return ''
}
const commonWords:Record<string,string>={enabled:'启用',enable:'启用',disabled:'禁用',active:'启用',toggle:'开关',mode:'模式',type:'类型',value:'数值',name:'名称',id:'标识',distance:'距离',range:'范围',radius:'半径',speed:'速度',delay:'延迟',duration:'持续时间',timeout:'超时',count:'数量',amount:'数量',size:'大小',height:'高度',width:'宽度',length:'长度',offset:'偏移',x:'X 坐标',y:'Y 坐标',z:'Z 坐标',color:'颜色',alpha:'透明度',opacity:'不透明度',render:'渲染',display:'显示',visible:'可见',sound:'声音',volume:'音量',chat:'聊天',message:'消息',text:'文本',title:'标题',key:'按键',keys:'按键',hotkey:'快捷键',bind:'绑定',binding:'绑定',auto:'自动',random:'随机',debug:'调试',advanced:'高级',general:'常规',player:'玩家',world:'世界',server:'服务器',friend:'好友',friends:'好友',target:'目标',attack:'攻击',defense:'防御',items:'物品',item:'物品',blocks:'方块',block:'方块',module:'模块',modules:'模块',category:'分类',filter:'筛选',list:'列表',threshold:'阈值',limit:'上限',min:'最小值',max:'最大值',tick:'刻',ticks:'刻',predict:'预测',history:'历史',format:'格式',notifications:'通知',notification:'通知',online:'在线',offline:'离线'}
function smartFallbackLabel(value:string):string { const words=value.replace(/([a-z\d])([A-Z])/g,'$1 $2').replace(/[_\-.]+/g,' ').trim().split(/\s+/).filter(Boolean); return words.map(word=>commonWords[word.toLowerCase()]??word).join(' ')||value }
export function modSettingKey(path:string[]):string { return path.join('.') }
export function configGroups(root:ConfigNode):{key:string;path:string[];node:ConfigNode}[]{
  if(root.type!=='object'&&root.type!=='compound')return[{key:'常规',path:[],node:root}]
  const scalar=(root.children??[]).filter(c=>!c.node.children||!['object','compound'].includes(c.node.type))
  return [...(scalar.length?[{key:'常规',path:[],node:{type:root.type,children:scalar}}]:[]),...(root.children??[]).filter(c=>c.node.children&&['object','compound'].includes(c.node.type)).map(c=>({key:c.key,path:[c.key],node:c.node}))]
}
