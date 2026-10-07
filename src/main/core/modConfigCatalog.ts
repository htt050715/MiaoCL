import fs from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
import {scanModDirectory} from './modScan'
import {groupModConfigs,type ConfigModIdentity} from '../../shared/modConfigs'
import type {ConfigCatalog} from '../../shared/clientConfigs'

const cache=new Map<string,{key:string;mods:ConfigModIdentity[];translations:Record<string,string>;warnings:string[]}>()
export async function populateModConfigCatalog(catalog:ConfigCatalog):Promise<ConfigCatalog>{
  const dir=path.join(catalog.directory,'mods'),stat=await fs.lstat(dir).catch(error=>{if(error.code==='ENOENT')return null;throw error})
  if(stat?.isSymbolicLink())throw Error('模组目录不能是符号链接')
  const entries=stat?(await fs.readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&/\.jar(?:\.disabled)?$/i.test(e.name)):[]
  const names=entries.map(e=>e.name).sort(),states=await Promise.all(names.map(async name=>{const st=await fs.stat(path.join(dir,name));return[name,st.size,st.mtimeMs]})),key=JSON.stringify(states)
  let saved=cache.get(dir)
  if(saved?.key!==key){
    const info=names.length?await scanModDirectory(dir,false,names,'icons'):[],translations:Record<string,string>=Object.create(null),warnings:string[]=[]
    const mods=info.filter(i=>i.id&&!i.error).map(i=>({id:i.id,name:i.name||i.id,version:i.version,disabled:/\.disabled$/i.test(i.fileName),icon:i.iconDataUrl}))
    for(const entry of info.filter(i=>i.id&&!i.error&&!/\.disabled$/i.test(i.fileName))){
      try{
        const zip=new AdmZip(await fs.readFile(path.join(dir,entry.fileName)))
        for(const item of zip.getEntries().filter(e=>/^assets\/[^/]+\/lang\/zh_cn\.json$/i.test(e.entryName))){
          if(item.header.size>4*1024*1024)continue
          const data=JSON.parse(item.getData().toString('utf8'));for(const [name,value]of Object.entries(data))if(typeof value==='string')translations[name]=value
        }
      }catch{warnings.push('无法读取 '+entry.name+' 的汉化资源，保留原配置名称')}
    }
    saved={key,mods,translations,warnings};cache.set(dir,saved);if(cache.size>8)cache.delete(cache.keys().next().value!)
  }
  return {...catalog,mods:groupModConfigs(catalog.files.map(f=>f.file),saved.mods),modTranslations:saved.translations,warnings:saved.warnings}
}
