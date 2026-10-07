import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import { decodeConfig, encodeConfig, mergeNodes } from './clientConfigCodec'
import type { ConfigCatalog, ConfigDocument, ConfigFile, ConfigRuntime, ConfigSaveMode, ConfigScope, ConfigCommitResult } from '../../shared/clientConfigs'
import type { ConfigNode } from '../../shared/clientConfigs'

export interface ConfigMutation { file: string; base: string | null; content: string | null }
export interface ConfigHooks {
  directory(version: string): string
  runtime(version: string): Promise<ConfigRuntime>
  hot(version: string, mutations: ConfigMutation[], snapshot?: string): Promise<void>
  restart(version: string, save: () => Promise<void>): Promise<void>
}
const MAX_FILE = 128 * 1024 * 1024, MAX_BUNDLE = 512 * 1024 * 1024
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const data = (content: string | null) => content === null ? null : Buffer.from(content,'base64')
const scopeOf = (file: string): ConfigScope => file.startsWith('slimefunhelper/') ? 'slimefunhelper' : file.startsWith('meteor-client/') || file === 'baritone/settings.txt' ? 'meteor' : 'mods'
const roots = (scope: ConfigScope) => scope === 'mods' ? ['config','defaultconfigs','slimefunhelper','meteor-client'] : scope === 'slimefunhelper' ? ['slimefunhelper'] : scope === 'meteor' ? ['meteor-client'] : ['slimefunhelper','meteor-client']
const inScope = (file: string, scope: ConfigScope) => scope === 'mods' || scope === 'all' && scopeOf(file) !== 'mods' || scopeOf(file) === scope
export function managedPath(directory: string, relative: string): string {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes('\0') || relative.includes(':') || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..' || /[<>"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p))) throw Error('配置路径无效')
  if (!['slimefunhelper/','meteor-client/','config/','defaultconfigs/'].some(root=>relative.startsWith(root)) && relative !== 'baritone/settings.txt') throw Error('文件不属于受管理的配置目录')
  const root = fs.realpathSync(directory)
  const target = path.resolve(root,...relative.split('/'))
  let probe = target
  while (probe !== root) { if (fs.existsSync(probe) && fs.lstatSync(probe).isSymbolicLink()) throw Error('不允许通过链接修改配置'); probe = path.dirname(probe) }
  return target
}
function atomicWrite(file: string, bytes: Buffer) {
  fs.mkdirSync(path.dirname(file),{recursive:true})
  const temp = file + '.miaocl-' + randomUUID() + '.tmp'
  try { fs.writeFileSync(temp,bytes); fs.renameSync(temp,file) } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}
function readBytes(file: string): Buffer | null {
  if (!fs.existsSync(file)) return null
  if (fs.statSync(file).size > MAX_FILE) throw Error('配置文件超过 128 MB')
  return fs.readFileSync(file)
}
function profileName(name: string) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name) || name === '.' || name === '..') throw Error('配置名称无效')
  return name
}
export class ClientConfigManager {
  private locks = new Set<string>()
  constructor(private hooks: ConfigHooks) {}
  private dir(version: string) { return this.hooks.directory(version) }
  private state(version: string) {
    const directory = this.dir(version), store = path.join(directory,'.miaocl-configs')
    if (fs.existsSync(store) && fs.lstatSync(store).isSymbolicLink()) throw Error('配置存储目录不能是符号链接')
    return store
  }
  private pendingFile(version: string) { return path.join(this.state(version),'pending.json') }
  private pending(version: string): ConfigMutation[] {
    const file = this.pendingFile(version)
    if (!fs.existsSync(file)) return []
    return this.validate(version, JSON.parse(fs.readFileSync(file,'utf8')).files)
  }
  private effective(version: string, relative: string) {
    const pending = this.pending(version).find(f => f.file === relative)
    return pending ? data(pending.content) : readBytes(managedPath(this.dir(version),relative))
  }
  private inventory(version: string, scope: ConfigScope = 'all'): ConfigFile[] {
    const directory = this.dir(version), files: ConfigFile[] = []
    function walk(relative: string) {
      const full = managedPath(directory,relative)
      if (!fs.existsSync(full)) return
      const stat = fs.lstatSync(full)
      if (stat.isDirectory()) {
        for (const name of fs.readdirSync(full)) {
          // Backups are retained on disk; configuration bundles exclude backup/temp copies.
          if (/\.(bak|tmp|disabled|backup)(\.|$)/i.test(name) || name === 'backups' || name.startsWith('.')) continue
          walk(relative + '/' + name)
        }
      } else if (stat.isFile()) files.push({file:relative,size:stat.size,modified:stat.mtimeMs,scope:scopeOf(relative)})
    }
    for (const root of roots(scope)) {
      const folder = path.join(directory,root)
      if (fs.existsSync(folder)) {
        if(fs.lstatSync(folder).isSymbolicLink())throw Error('配置目录不能是符号链接：'+root)
        for (const name of fs.readdirSync(folder)) if (!name.startsWith('.') && name !== 'backups' && !/\.(bak|tmp|backup|disabled)(\.|$)/i.test(name)) walk(root + '/' + name)
      }
    }
    if (scope !== 'slimefunhelper') walk('baritone/settings.txt')
    return files.sort((a,b) => a.file.localeCompare(b.file))
  }
  async catalog(version: string, scope: ConfigScope = 'all'): Promise<ConfigCatalog> {
    const profiles = path.join(this.state(version),'profiles')
    const files = this.inventory(version,scope)
    for (const change of this.pending(version)) if (inScope(change.file,scope) && change.content !== null && !files.some(f => f.file === change.file)) files.push({file:change.file,size:data(change.content)!.length,modified:0,scope:scopeOf(change.file)})
    return {directory:this.dir(version),files,profiles:fs.existsSync(profiles) ? fs.readdirSync(profiles).filter(n => n.endsWith('.zip')).map(n => n.slice(0,-4)) : [],pending:this.pending(version).length > 0,runtime:await this.hooks.runtime(version)}
  }
  read(version: string, file: string): ConfigDocument {
    managedPath(this.dir(version),file)
    const bytes = this.effective(version,file)
    if (!bytes) throw Error('配置文件不存在')
    return decodeConfig(file,bytes,hash(bytes))
  }
  hasPending(version: string): boolean { return this.pending(version).length > 0 }
  private changes(version: string, docs: ConfigDocument[]): ConfigMutation[] {
    if (!Array.isArray(docs) || docs.length > 10000) throw Error('配置数量无效')
    const pending = this.pending(version)
    return docs.map(doc => {
      const current = this.effective(version,doc.file)
      if (!current || hash(current) !== doc.hash) throw Error('配置已被其他程序修改，请刷新后重新编辑：' + doc.file)
      const original = decodeConfig(doc.file,current,doc.hash)
      if (doc.format !== original.format || doc.compression !== original.compression || doc.name !== original.name) throw Error('不允许改变配置文件格式')
      const content = encodeConfig(doc,current)
      if (content.length > MAX_FILE) throw Error('配置文件过大')
      const old = pending.find(p => p.file === doc.file)
      return {file:doc.file,base:old ? old.base : current.toString('base64'),content:content.toString('base64')}
    })
  }
  private validate(version: string, files: ConfigMutation[]): ConfigMutation[] {
    if (!Array.isArray(files) || files.length > 10000) throw Error('配置包数量无效')
    const seen = new Set<string>(); let total = 0
    for (const file of files) {
      managedPath(this.dir(version),file.file)
      if (seen.has(file.file)) throw Error('配置包包含重复路径'); seen.add(file.file)
      for (const value of [file.content,file.base]) {
        if (value !== null && (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))) throw Error('配置内容编码无效')
        if (value !== null && data(value)!.length > MAX_FILE) throw Error('配置文件过大')
      }
      total += data(file.content)?.length ?? 0
      if (total > MAX_BUNDLE) throw Error('配置包超过 512 MB')
      // General MOD files are backed up byte-for-byte, including opaque formats.
      if (scopeOf(file.file)!=='mods' && file.content!==null && /\.(nbt|dat|json|ya?ml)$/i.test(file.file))decodeConfig(file.file,data(file.content)!,'')
    }
    return files
  }
  private rebase(version: string, files: ConfigMutation[]): ConfigMutation[] {
    return files.map(change => {
      const current = readBytes(managedPath(this.dir(version),change.file)), base = data(change.base), content = data(change.content)
      if (current?.equals(base ?? Buffer.alloc(0)) || !current && !base) return change
      if (!base || !current || !content) throw Error('配置文件已变化：' + change.file)
      const b = decodeConfig(change.file,base,''), e = decodeConfig(change.file,content,''), c = decodeConfig(change.file,current,'')
      c.root = mergeNodes(b.root,e.root,c.root,change.file)
      return {file:change.file,base:current.toString('base64'),content:encodeConfig(c,current).toString('base64')}
    })
  }
  private write(version: string, files: ConfigMutation[]): string {
    const directory = this.dir(version), backup = path.join(this.state(version),'backups',Date.now() + '-' + randomUUID())
    fs.mkdirSync(backup,{recursive:true})
    const originals = files.map(f => ({file:f.file,bytes:readBytes(managedPath(directory,f.file))}))
    atomicWrite(path.join(backup,'manifest.json'),Buffer.from(JSON.stringify(originals.map(f => ({file:f.file,existed:f.bytes !== null})),null,2)))
    for (const old of originals) if (old.bytes) atomicWrite(path.join(backup,...old.file.split('/')),old.bytes)
    try {
      for (const file of files) { const target = managedPath(directory,file.file); if (file.content === null) { if (fs.existsSync(target)) fs.unlinkSync(target) } else atomicWrite(target,data(file.content)!) }
    } catch (error) {
      for (const old of originals) { const target = managedPath(directory,old.file); if (old.bytes) atomicWrite(target,old.bytes); else if (fs.existsSync(target)) fs.unlinkSync(target) }
      throw error
    }
    return backup
  }
  private async locked<T>(version: string, fn: () => Promise<T>): Promise<T> {
    const key = this.dir(version)
    if (this.locks.has(key)) throw Error('此实例正在应用配置，请稍候')
    this.locks.add(key)
    try { return await fn() } finally { this.locks.delete(key) }
  }
  async commit(version: string, docs: ConfigDocument[], mode: ConfigSaveMode): Promise<ConfigCommitResult> {
    return this.locked(version,async () => this.apply(version,this.changes(version,docs),mode))
  }
  private async apply(version: string, changes: ConfigMutation[], mode: ConfigSaveMode): Promise<ConfigCommitResult> {
    if (!['restart','next-launch','hot'].includes(mode)) throw Error('保存方式无效')
    const combined = new Map(this.pending(version).map(f => [f.file,f])); changes.forEach(f => combined.set(f.file,f))
    const files = this.validate(version,[...combined.values()]), runtime = await this.hooks.runtime(version)
    if (mode === 'next-launch') {
      atomicWrite(this.pendingFile(version),Buffer.from(JSON.stringify({version:1,files})))
      return {ok:true,message:'已暂存，下次启动前应用；当前游戏参数保持不变'}
    }
    if (mode === 'restart' && runtime.running) {
      if (!runtime.owned) throw Error('此客户端由其他启动器启动，请退出游戏后保存，或选择下次启动生效')
      let backup: string | undefined
      await this.hooks.restart(version,async () => {
        if ((await this.hooks.runtime(version)).running) throw Error('尚有使用该配置目录的客户端在运行，未写入配置')
        backup = this.write(version,this.rebase(version,files)); this.clearPending(version)
      })
      return {ok:true,message:'配置已保存，客户端已重新启动',backup}
    }
    if (runtime.running && mode === 'hot') {
      if(files.some(f=>scopeOf(f.file)==='mods'))throw Error('普通模组未声明配置热重载接口，请选择下次启动生效或退出游戏后保存')
      if (!runtime.connected) throw Error('客户端未连接新版桥接服务，无法确认热重载')
      await this.hooks.hot(version,this.rebase(version,files))
      this.clearPending(version)
      return {ok:true,message:'客户端已确认配置加载'}
    }
    const backup = this.write(version,this.rebase(version,files)); this.clearPending(version)
    return {ok:true,message:'配置已保存',backup}
  }
  clearPending(version: string) { const file = this.pendingFile(version); if (fs.existsSync(file)) fs.unlinkSync(file) }
  async beforeLaunch(version: string) {
    return this.locked(version,async () => {
      const pending = this.pending(version)
      if (!pending.length) return
      if ((await this.hooks.runtime(version)).running) throw Error('当前配置有待生效修改，请先退出使用该目录的客户端')
      this.write(version,this.rebase(version,pending)); this.clearPending(version)
    })
  }
  exportBundle(version: string, scope: ConfigScope, destination: string) {
    if (!['all','meteor','slimefunhelper','mods'].includes(scope)) throw Error('配置范围无效')
    const zip = new AdmZip(); let total = 0
    const names = new Set(this.inventory(version,scope).map(f => f.file))
    for (const p of this.pending(version)) if (inScope(p.file,scope)) names.add(p.file)
    const manifest: {file:string;hash:string}[] = []
    for (const name of names) { const bytes = this.effective(version,name); if (!bytes) continue; total += bytes.length; if (total > MAX_BUNDLE) throw Error('配置包超过 512 MB'); manifest.push({file:name,hash:hash(bytes)}); zip.addFile(name,bytes) }
    zip.addFile('miaocl-config.json',Buffer.from(JSON.stringify({version:1,scope,files:manifest},null,2)))
    atomicWrite(destination,zip.toBuffer())
  }
  saveProfile(version: string, scope: ConfigScope, name: string) {
    const destination = path.join(this.state(version),'profiles',profileName(name) + '.zip')
    if (fs.existsSync(destination)) throw Error('同名配置已存在，请使用新名称')
    this.exportBundle(version,scope,destination)
  }
  private bundle(version: string, source: string, expectedScope?: ConfigScope): ConfigMutation[] {
    if (fs.statSync(source).size > MAX_BUNDLE) throw Error('配置包过大')
    const zip = new AdmZip(source), entry = zip.getEntry('miaocl-config.json')
    if (!entry || entry.header.size > 4 * 1024 * 1024) throw Error('缺少有效的 MiaoCL 配置清单')
    const manifest = JSON.parse(entry.getData().toString('utf8'))
    if (manifest.version !== 1 || !['all','meteor','slimefunhelper','mods'].includes(manifest.scope) || !Array.isArray(manifest.files) || manifest.files.length > 10000) throw Error('配置包清单无效')
    if(expectedScope && manifest.scope!==expectedScope)throw Error('请选择与当前页面范围匹配的配置包')
    const seen = new Set<string>(); let total = 0
    for (const entry of zip.getEntries()) {
      if (seen.has(entry.entryName)) throw Error('ZIP 路径重复'); seen.add(entry.entryName)
      if (entry.entryName !== 'miaocl-config.json') managedPath(this.dir(version),entry.entryName)
      total += entry.header.size
      if (entry.header.size > MAX_FILE || total > MAX_BUNDLE) throw Error('配置包解压大小超限')
    }
    const files: ConfigMutation[] = manifest.files.map((item: any) => {
      managedPath(this.dir(version),item.file)
      if (!inScope(item.file,manifest.scope)) throw Error('配置包包含范围外文件')
      const entry = zip.getEntry(item.file); if (!entry) throw Error('配置包缺少文件：' + item.file)
      const bytes = entry.getData(); if (hash(bytes) !== item.hash) throw Error('配置包校验失败：' + item.file)
      return {file:item.file,base:readBytes(managedPath(this.dir(version),item.file))?.toString('base64') ?? null,content:bytes.toString('base64')}
    })
    if (seen.size !== files.length + 1) throw Error('配置包有未列入清单的文件')
    // Full profiles also remove files absent from the selected profile, with backups.
    // General MOD bundles merge included files; installing another MOD must not
    // make its configuration disappear when importing an older bundle.
    if(manifest.scope!=='mods')for (const current of this.inventory(version,manifest.scope)) if (!files.some(f => f.file === current.file)) files.push({file:current.file,base:readBytes(managedPath(this.dir(version),current.file))!.toString('base64'),content:null})
    return this.validate(version,files)
  }
  async importBundle(version: string, source: string, mode: ConfigSaveMode, expectedScope?: ConfigScope) { return this.locked(version,async () => this.apply(version,this.bundle(version,source,expectedScope),mode)) }
  async switchProfile(version: string, name: string, mode: ConfigSaveMode) { return this.importBundle(version,path.join(this.state(version),'profiles',profileName(name) + '.zip'),mode) }
  async activateSlimefunSnapshot(version: string, file: string, mode: ConfigSaveMode) {
    if (!/^slimefunhelper\/config\/[^/]+\.nbt$/i.test(file)) throw Error('请选择 SlimefunHelper 的 NBT 参数快照')
    const snapshot = this.read(version,file)
    const docs: ConfigDocument[] = []
    function overlay(current: ConfigNode, saved: ConfigNode): ConfigNode {
      const result = structuredClone(current)
      if (current.type === 'object' && saved.type === 'compound') {
        for (const child of result.children ?? []) { const value = saved.children?.find(s => s.key === child.key); if (value) child.node = overlay(child.node,value.node) }
        return result
      }
      if (current.type === 'array' && saved.type === 'list') {
        result.children = (saved.children ?? []).map((c,i) => ({key:String(i),node:fromNbt(c.node,current.children?.[i]?.node??current.children?.[0]?.node)}))
        return result
      }
      if (current.type === 'boolean' && saved.type === 'byte') { if (![0,1].includes(Number(saved.value))) throw Error('快照布尔字段无效'); result.value = saved.value === 1; return result }
      if (current.type === 'number' && ['byte','short','int','float','double'].includes(saved.type) || current.type === 'string' && saved.type === 'string') { result.value = saved.value; return result }
      throw Error('快照字段类型与当前 SlimefunHelper 不兼容：' + current.type + '/' + saved.type)
    }
    function fromNbt(node: ConfigNode, expected?: ConfigNode): ConfigNode {
      if (expected) return overlay(expected,node)
      if (node.type === 'compound') return {type:'object',children:node.children?.map(c=>({key:c.key,node:fromNbt(c.node)}))}
      if (node.type === 'list') return {type:'array',children:node.children?.map(c=>({key:c.key,node:fromNbt(c.node)}))}
      if (node.type === 'string') return {type:'string',value:node.value}
      if (['byte','short','int','float','double'].includes(node.type)) return {type:'number',value:node.value}
      throw Error('快照包含当前 YAML 无法无损转换的类型：' + node.type)
    }
    for (const config of snapshot.root.children ?? []) {
      const match = /^slimefunhelper:([a-z]+)_settings$/.exec(config.key)
      if (!match) throw Error('快照包含未知配置域：' + config.key)
      const name = match[1] === 'toggle' ? 'toggles' : match[1] === 'model' ? 'models' : match[1] === 'extra' ? 'test' : match[1]
      const file = `slimefunhelper/runtime/${name}.yml`
      if (!(config.node.children?.length)) continue
      const doc = this.read(version,file); doc.root = overlay(doc.root,config.node); docs.push(doc)
    }
    if (!docs.length) throw Error('此快照没有可应用的参数')
    return this.commit(version,docs,mode)
  }
}
