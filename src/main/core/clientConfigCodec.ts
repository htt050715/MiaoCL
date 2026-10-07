import zlib from 'node:zlib'
import { parseDocument, stringify } from 'yaml'
import { readTypedNbt, writeTypedNbt, type NbtTag, type NbtType } from './typedNbt'
import type { ConfigDocument, ConfigNode } from '../../shared/clientConfigs'
import { parseModObject, encodeModObject, propertiesNode, encodeProperties, checkModValue } from './modConfigCodec'

const TYPES = ['end','byte','short','int','long','float','double','byte-array','string','list','compound','int-array','long-array']
export function nbtNode(tag: NbtTag): ConfigNode {
  const type = TYPES[tag.type]
  if (tag.type === 10) return { type, children: Object.entries(tag.value).map(([key, value]) => ({ key, node: nbtNode(value as NbtTag) })) }
  if ([7,9,11,12].includes(tag.type)) return { type, elementType: tag.elementType, children: Array.from(tag.value as any[]).map((value, i) => ({ key: String(i), node: tag.type === 9 ? nbtNode(value) : { type: tag.type === 12 ? 'long' : tag.type === 7 ? 'byte' : 'int', value: tag.type === 12 ? String(value) : tag.type === 7 && value > 127 ? value - 256 : value } })) }
  return { type, value: tag.type === 4 ? String(tag.value) : tag.value }
}
export function nodeNbt(node: ConfigNode, depth = 0): NbtTag {
  if (depth > 64) throw Error('配置结构超过 64 层')
  const type = TYPES.indexOf(node.type) as NbtType
  if (type < 1) throw Error('未知 NBT 类型：' + node.type)
  const children = node.children ?? []
  if (type === 10) {
    const value = Object.create(null)
    for (const child of children) { if (Object.hasOwn(value, child.key)) throw Error('重复字段：' + child.key); value[child.key] = nodeNbt(child.node, depth + 1) }
    return { type, value }
  }
  if (type === 9) return { type, elementType: node.elementType as NbtType, value: children.map(c => nodeNbt(c.node, depth + 1)) }
  if ([7,11,12].includes(type)) {
    const values = children.map(c => nodeNbt(c.node, depth + 1).value)
    if (children.some(c => c.node.type !== (type === 12 ? 'long' : type === 7 ? 'byte' : 'int'))) throw Error('数组元素类型不匹配')
    return { type, value: type === 7 ? Buffer.from(values) : values }
  }
  if (type === 8) { if (typeof node.value !== 'string') throw Error('字符串类型不匹配'); return { type, value: node.value } }
  if (type === 4) { if (!/^-?\d+$/.test(String(node.value))) throw Error('长整数格式无效'); const value = BigInt(String(node.value)); if (value < -(1n << 63n) || value >= (1n << 63n)) throw Error('长整数越界'); return { type, value } }
  const value = Number(node.value)
  if (!Number.isFinite(value)) throw Error('数值必须有限')
  const ranges: Record<number, number[]> = {1:[-128,127],2:[-32768,32767],3:[-2147483648,2147483647]}
  if (ranges[type] && (!Number.isInteger(value) || value < ranges[type][0] || value > ranges[type][1])) throw Error('整数越界：' + node.type)
  if (type === 5 && !Number.isFinite(Math.fround(value))) throw Error('单精度数值越界')
  return { type, value }
}
export function valueNode(value: any): ConfigNode {
  if (value === null) return { type: 'null', value: null }
  if (Array.isArray(value)) return { type: 'array', children: value.map((v,i) => ({ key: String(i), node: valueNode(v) })) }
  if (typeof value === 'object') return { type: 'object', children: Object.entries(value).map(([key,v]) => ({ key, node: valueNode(v) })) }
  return { type: typeof value, value }
}
export function nodeValue(node: ConfigNode, depth = 0): any {
  if (depth > 64) throw Error('配置结构超过 64 层')
  if (node.type === 'array') return (node.children ?? []).map(c => nodeValue(c.node, depth + 1))
  if (node.type === 'object') {
    const value = Object.create(null)
    for (const c of node.children ?? []) { if (Object.hasOwn(value,c.key)) throw Error('重复字段：' + c.key); value[c.key] = nodeValue(c.node, depth + 1) }
    return value
  }
  if (node.type === 'null') return null
  if (!['string','number','boolean'].includes(node.type) || typeof node.value !== node.type || typeof node.value === 'number' && !Number.isFinite(node.value)) throw Error('字段类型无效：' + node.type)
  return node.value
}
export function decodeConfig(file: string, bytes: Buffer, hash: string): ConfigDocument {
  try{return decodeStructuredConfig(file,bytes,hash)}catch(error){
    if(!/^(config|defaultconfigs)\//.test(file))throw error
    const text=bytes.toString('utf8'),binary=bytes.includes(0)||!Buffer.from(text).equals(bytes)
    return {file,hash,format:binary?'binary':'text',root:{type:binary?'binary':'string',value:binary?bytes.toString('base64'):text},warning:'此文件暂不支持可视化解析，已保留原始内容：'+String(error)}
  }
}
function decodeStructuredConfig(file: string, bytes: Buffer, hash: string): ConfigDocument {
  const doc: ConfigDocument = { file, hash, format: 'text', root: {type:'string',value:''} }
  if (/\.(nbt|dat)$/i.test(file)) {
    const parsed = readTypedNbt(bytes)
    doc.format = 'nbt'; doc.name = parsed.name; doc.compression = bytes[0] === 31 && bytes[1] === 139 ? 'gzip' : bytes[0] === 120 ? 'zlib' : 'none'; doc.root = nbtNode(parsed.root)
  } else if (/\.ya?ml$/i.test(file)) {
    const yaml = parseDocument(bytes.toString('utf8'), { uniqueKeys: true })
    if (yaml.errors.length) throw Error(yaml.errors.map(e => e.message).join('\n'))
    doc.format = 'yaml'; const value=yaml.toJS({maxAliasCount:100});if(/^(config|defaultconfigs)\//.test(file))checkModValue(value);doc.root = valueNode(value)
  } else if (/\.(json5|toml)$/i.test(file)) {
    doc.format=/\.toml$/i.test(file)?'toml':'json5';doc.root=valueNode(parseModObject(doc.format,bytes.toString('utf8')))
    doc.warning='保存修改会重新排版此文件，并移除格式注释；原文件会自动备份。'
  } else if (/\.properties$/i.test(file)) {doc.format='properties';doc.root=propertiesNode(bytes.toString('utf8'))}
  else if (/\.json$/i.test(file)) {
    try{doc.format = 'json'; const value=JSON.parse(bytes.toString('utf8'));if(/^(config|defaultconfigs)\//.test(file))checkModValue(value);doc.root = valueNode(value)}catch(error){
      if(!/^(config|defaultconfigs)\//.test(file))throw error
      doc.format='json5';doc.root=valueNode(parseModObject('json5',bytes.toString('utf8')));doc.warning='此 JSON 文件包含扩展语法；保存修改会移除格式注释，原文件会自动备份。'
    }
  }
  else if (file === 'baritone/settings.txt') {
    doc.format = 'baritone'; const value = Object.create(null)
    for (const line of bytes.toString('utf8').split(/\r?\n/)) { const m = /^(\S+)\s+(.*)$/.exec(line); if (!m || line.startsWith('#')) continue; value[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : /^-?\d+(\.\d+)?$/.test(m[2]) ? Number(m[2]) : m[2] }
    doc.root = valueNode(value)
  } else if (bytes.includes(0)||!Buffer.from(bytes.toString('utf8')).equals(bytes)) { doc.format = 'binary'; doc.root = {type:'binary',value:bytes.toString('base64')} }
  else doc.root.value = bytes.toString('utf8')
  return doc
}
export function encodeConfig(doc: ConfigDocument, original?: Buffer): Buffer {
  if(original&&/^(config|defaultconfigs)\//.test(doc.file)&&JSON.stringify(decodeConfig(doc.file,original,doc.hash).root)===JSON.stringify(doc.root))return original
  if(doc.format==='properties')return encodeProperties(doc.root,original)
  if (doc.format === 'nbt') {
    const raw = writeTypedNbt(nodeNbt(doc.root), doc.name ?? '', false)
    return doc.compression === 'gzip' ? zlib.gzipSync(raw) : doc.compression === 'zlib' ? zlib.deflateSync(raw) : raw
  }
  const value = doc.format === 'text' ? doc.root.value : doc.format === 'binary' ? null : nodeValue(doc.root)
  if(doc.format==='json5'||doc.format==='toml')return encodeModObject(doc,value,original)
  if (doc.format === 'json') return Buffer.from(JSON.stringify(value,null,2) + '\n')
  if (doc.format === 'yaml') {
    if (!original) return Buffer.from(stringify(value))
    const yaml = parseDocument(original.toString('utf8'))
    // Update values through the YAML AST so existing comments survive edits.
    function update(node: ConfigNode, keys: (string|number)[]) {
      if (node.type === 'object') {
        const before = yaml.getIn(keys, true) as any
        if (before?.items) for (const item of [...before.items]) if (!node.children?.some(c => c.key === String(item.key?.value))) yaml.deleteIn([...keys,String(item.key?.value)])
        for (const c of node.children ?? []) update(c.node,[...keys,c.key])
      } else yaml.setIn(keys,nodeValue(node))
    }
    update(doc.root,[]); return Buffer.from(yaml.toString())
  }
  if (doc.format === 'baritone') return Buffer.from(Object.entries(value).map(([k,v]) => { if (!/^\w+$/.test(k) || /[\r\n]/.test(String(v))) throw Error('Baritone 参数格式无效'); return `${k} ${v}` }).join('\n') + '\n')
  if (doc.format === 'binary') return Buffer.from(String(doc.root.value),'base64')
  if (typeof value !== 'string') throw Error('文本参数必须是字符串')
  return Buffer.from(value)
}
/** Apply only the user's changes after the game saves at exit; preserve unrelated game edits. */
export function mergeNodes(base: ConfigNode, edited: ConfigNode, current: ConfigNode, location = ''): ConfigNode {
  const equal = (a: ConfigNode,b: ConfigNode) => JSON.stringify(a) === JSON.stringify(b)
  if (equal(base,edited)) return current
  if (equal(base,current) || equal(edited,current)) return edited
  if (base.type === edited.type && current.type === base.type && ['object','compound'].includes(base.type)) {
    const result = structuredClone(current)
    for (const c of edited.children ?? []) {
      const b = base.children?.find(v => v.key === c.key), now = result.children?.find(v => v.key === c.key)
      if (b && now) now.node = mergeNodes(b.node,c.node,now.node,`${location}/${c.key}`)
      else if (!b && !now) result.children!.push(c)
      else if (!b && now && !equal(c.node,now.node) || b && !now && !equal(b.node,c.node)) throw Error('配置冲突：' + location + '/' + c.key)
    }
    for (const b of base.children ?? []) if (!edited.children?.some(c => c.key === b.key)) {
      const now = result.children?.find(c => c.key === b.key)
      if (now && !equal(b.node,now.node)) throw Error('删除字段发生冲突：' + location + '/' + b.key)
      result.children = result.children?.filter(c => c.key !== b.key)
    }
    return result
  }
  throw Error('游戏内修改与暂存参数冲突：' + location)
}
