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
  return leaf
}
export function modSettingDescription(translations:Record<string,string>,id:string,path:string[]):string {
  const key=path.join('.'),leaf=path.at(-1)??id
  for(const candidate of [`text.autoconfig.${id}.option.${key}.@Tooltip`,`${id}.config.${key}.tooltip`,`${id}.config.${leaf}.tooltip`,`${id}.config.${key}.description`])if(translations[candidate])return translations[candidate]
  return ''
}
export function configGroups(root:ConfigNode):{key:string;path:string[];node:ConfigNode}[]{
  if(root.type!=='object'&&root.type!=='compound')return[{key:'常规',path:[],node:root}]
  const scalar=(root.children??[]).filter(c=>!c.node.children||!['object','compound'].includes(c.node.type))
  return [...(scalar.length?[{key:'常规',path:[],node:{type:root.type,children:scalar}}]:[]),...(root.children??[]).filter(c=>c.node.children&&['object','compound'].includes(c.node.type)).map(c=>({key:c.key,path:[c.key],node:c.node}))]
}
