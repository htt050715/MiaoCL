import type {ConfigNode} from './clientConfigs'
/** SlimefunHelper stores codec values as nbt:<codec>:<SNBT> inside YAML strings. */
export function parseSlimeValue(value: string): {prefix:string;root:ConfigNode}|undefined {
  const match=/^(nbt:[^:]+:)([\s\S]+)$/.exec(value);if(!match)return
  const source=match[2];let pos=0
  const space=()=>{while(/\s/.test(source[pos]??'')&&pos<source.length)pos++}
  function quoted():string {const quote=source[pos++];let value='';while(pos<source.length){const c=source[pos++];if(c===quote)return value;if(c==='\\'){const next=source[pos++];if(next!==quote&&next!=='\\')throw Error('escape');value+=next}else value+=c}throw Error('quote')}
  function token():string {space();if(['"',"'"].includes(source[pos]))return quoted();const start=pos;while(pos<source.length&&!/[\s,:\]\}]/.test(source[pos]))pos++;if(pos===start)throw Error('token');return source.slice(start,pos)}
  function parse(depth=0):ConfigNode {if(depth>64)throw Error('depth');space();const c=source[pos];if(c==='{'){pos++;const children:{key:string;node:ConfigNode}[]=[];space();while(source[pos]!=='}'){const key=token();space();if(source[pos++]!==':')throw Error('colon');if(children.some(c=>c.key===key))throw Error('duplicate');children.push({key,node:parse(depth+1)});space();if(source[pos]!==',')break;pos++;space()}if(source[pos++]!=='}')throw Error('compound');return{type:'compound',children}}
    if(c==='['){pos++;space();let type='list';if(/^[BIL];/.test(source.slice(pos))){type=source[pos]==='B'?'byte-array':source[pos]==='I'?'int-array':'long-array';pos+=2}const children:{key:string;node:ConfigNode}[]=[];space();while(source[pos]!==']'){children.push({key:String(children.length),node:parse(depth+1)});space();if(source[pos]!==',')break;pos++}if(source[pos++]!==']')throw Error('list');return{type,children}}
    if(c==='"'||c==="'")return{type:'string',value:quoted()};const raw=token();const numeric=/^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)([bsldf]?)$/i.exec(raw);if(numeric){const suffix=numeric[2].toLowerCase(),type=({b:'byte',s:'short',l:'long',d:'double',f:'float'} as Record<string,string>)[suffix]??(numeric[1].includes('.')?'double':'int');return{type,value:type==='long'?numeric[1]:Number(numeric[1])}}if(raw==='true'||raw==='false')return{type:'byte',value:Number(raw==='true')};return{type:'string',value:raw}}
  try{const root=parse();space();if(pos!==source.length)return;return{prefix:match[1],root}}catch{return}
}
export function writeSlimeValue(prefix:string,node:ConfigNode):string {
  function serialize(n:ConfigNode):string {
    if(n.type==='compound')return'{'+(n.children??[]).map(c=>JSON.stringify(c.key)+':'+serialize(c.node)).join(',')+'}'
    if(['list','byte-array','int-array','long-array'].includes(n.type))return'['+(({ 'byte-array':'B;','int-array':'I;','long-array':'L;' } as Record<string,string>)[n.type]??'')+(n.children??[]).map(c=>serialize(c.node)).join(',')+']'
    if(n.type==='string')return '"'+String(n.value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"'
    if(n.type==='long'){if(!/^-?\d+$/.test(String(n.value))||BigInt(String(n.value))<-(1n<<63n)||BigInt(String(n.value))>=(1n<<63n))throw Error('长整数越界')}
    else {const value=Number(n.value),range=({byte:[-128,127],short:[-32768,32767],int:[-2147483648,2147483647]} as Record<string,number[]>)[n.type];if(!Number.isFinite(value)||range&&(!Number.isInteger(value)||value<range[0]||value>range[1]))throw Error('数值越界')}
    return String(n.value)+(({byte:'b',short:'s',long:'L',float:'f',double:'d'} as Record<string,string>)[n.type]??'')
  }
  return prefix+serialize(node)
}
