import JSON5 from 'json5'
import * as TOML from '@iarna/toml'
import type { ConfigDocument, ConfigNode } from '../../shared/clientConfigs'

// Java properties escaping is independent from JSON escaping.
const unescapeProperty=(value:string)=>value.replace(/\\(u[\da-fA-F]{4}|.)/g,(_all,escaped:string)=>escaped.startsWith('u')?String.fromCharCode(parseInt(escaped.slice(1),16)):({t:'\t',r:'\r',n:'\n',f:'\f'} as Record<string,string>)[escaped]??escaped)
const escapeProperty=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t').replace(/([=:# !])/g,'\\$1')
export function parseProperties(source:string): Record<string,string> {
  const result=Object.create(null);let logical=''
  for(const raw of source.split(/\r?\n/)){
    logical+=logical?raw.trimStart():raw
    const slashes=/\\+$/.exec(logical)?.[0].length??0
    if(slashes%2){logical=logical.slice(0,-1);continue}
    const line=logical.trimStart();logical='';if(!line||/^[#!]/.test(line))continue
    let split=line.length
    for(let i=0;i<line.length;i++){if(line[i]==='\\'){i++;continue}if(/[=:\s]/.test(line[i])){split=i;break}}
    const key=unescapeProperty(line.slice(0,split)),rest=line.slice(split).replace(/^\s*[=:]?\s*/,'')
    if(Object.hasOwn(result,key))throw Error('重复 properties 字段：'+key)
    result[key]=unescapeProperty(rest)
  }
  if(logical)throw Error('properties 末尾有未完成的转义')
  return result
}
export function propertiesNode(source:string): ConfigNode {
  return {type:'object',children:Object.entries(parseProperties(source)).map(([key,value])=>({key,node:/^(true|false)$/i.test(value)?{type:'boolean',value:value.toLowerCase()==='true'}:/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value))&&Math.abs(Number(value))<=Number.MAX_SAFE_INTEGER?{type:'number',value:Number(value)}:{type:'string',value}}))}
}
export function encodeProperties(node:ConfigNode,original?:Buffer):Buffer {
  if(node.type!=='object')throw Error('properties 配置必须是键值对象')
  const values=new Map((node.children??[]).map(c=>{if(!['boolean','number','string'].includes(c.node.type)||typeof c.node.value!==c.node.type)throw Error('properties 字段类型无效');return[c.key,String(c.node.value)]}))
  if(values.size!==(node.children??[]).length)throw Error('properties 字段重复')
  if(!original)return Buffer.from([...values].map(([key,value])=>escapeProperty(key)+'='+escapeProperty(value)).join('\n')+'\n')
  const source=original.toString('utf8'),before=parseProperties(source)
  const unchanged=(key:string)=>values.has(key)&&String(before[key])===values.get(key)
  const lines=source.split(/(?<=\n)/),out:string[]=[];let logical='',parts:string[]=[]
  for(const line of lines){parts.push(line);logical+=logical?line.trimStart():line;const body=logical.replace(/\r?\n$/,'');if((/\\+$/.exec(body)?.[0].length??0)%2){logical=body.slice(0,-1);continue}
    const parsed=parseProperties(parts.join('')),key=Object.keys(parsed)[0]
    if(key===undefined)out.push(...parts)
    else if(values.has(key)){out.push(unchanged(key)?parts.join(''):escapeProperty(key)+'='+escapeProperty(values.get(key)!)+(source.includes('\r\n')?'\r\n':'\n'));values.delete(key)}
    parts=[];logical=''
  }
  if(parts.length)throw Error('properties 转义未完成')
  if(values.size&&out.length&&!out[out.length-1].endsWith('\n'))out.push('\n')
  out.push(...[...values].map(([key,value])=>escapeProperty(key)+'='+escapeProperty(value)+'\n'))
  return Buffer.from(out.join(''))
}
export function checkModValue(value:unknown):void {
  function check(v:any,depth:number){if(depth>64)throw Error('配置结构超过 64 层');if(v instanceof Date)throw Error('日期字段暂不支持结构化编辑');if(typeof v==='number'&&(!Number.isFinite(v)||Number.isInteger(v)&&!Number.isSafeInteger(v)))throw Error('特殊数值或大整数暂不支持结构化编辑');if(v&&typeof v==='object')Object.values(v).forEach(c=>check(c,depth+1))}
  check(value,0)
}
export function parseModObject(format:'json5'|'toml',source:string):unknown {
  const value=format==='json5'?JSON5.parse(source):TOML.parse(source)
  checkModValue(value);return value
}
export function encodeModObject(doc:ConfigDocument,value:any,original?:Buffer):Buffer {
  checkModValue(value)
  if(original&&JSON.stringify(parseModObject(doc.format as 'json5'|'toml',original.toString('utf8')))===JSON.stringify(value))return original
  return Buffer.from(doc.format==='json5'?JSON5.stringify(value,null,2)+'\n':TOML.stringify(value))
}
