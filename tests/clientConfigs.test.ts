import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import AdmZip from 'adm-zip'
import {ClientConfigManager,managedPath,type ConfigHooks} from '../src/main/core/clientConfigs'
import {decodeConfig,encodeConfig,nodeNbt} from '../src/main/core/clientConfigCodec'
import {readTypedNbt,writeTypedNbt,tag} from '../src/main/core/typedNbt'
import type {ConfigDocument,ConfigRuntime} from '../src/shared/clientConfigs'
function fixture(t:any) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'MiaoCL 参数 中文 ')); t.after(()=>fs.rmSync(directory,{recursive:true,force:true}))
  fs.mkdirSync(path.join(directory,'slimefunhelper/runtime'),{recursive:true});fs.mkdirSync(path.join(directory,'meteor-client'),{recursive:true})
  fs.writeFileSync(path.join(directory,'slimefunhelper/runtime/combat.yml'),'# keep comment\ncombat:\n  enabled: false # flag\n  speed: 2\n')
  fs.writeFileSync(path.join(directory,'meteor-client/friends.nbt'),writeTypedNbt(tag(10,{friends:tag(9,[tag(10,{name:tag(8,'测试好友')})],10)}),'',false))
  const runtime:ConfigRuntime={running:false,owned:true,connected:false,capabilities:[],modules:[]}
  const hooks:ConfigHooks={directory:()=>directory,runtime:async()=>({...runtime}),hot:async()=>{throw Error('test bridge failed')},restart:async(_id,save)=>{runtime.running=false;await save();runtime.running=true}}
  const manager=new ClientConfigManager(hooks)
  const edit=(value:number)=>{const doc=manager.read('test','slimefunhelper/runtime/combat.yml');doc.root.children![0].node.children!.find(c=>c.key==='speed')!.node.value=value;return doc}
  return {directory,runtime,hooks,manager,edit}
}
test('NBT roundtrip retains widths, modified UTF, empty typed lists, arrays and signed long extremes',()=>{
  const root=tag(10,{byte:tag(1,-128),short:tag(2,32767),int:tag(3,-2147483648),long:tag(4,-9223372036854775808n),float:tag(5,Math.fround(0.1)),double:tag(6,1.23456789012345),bytes:tag(7,Buffer.from([0,128,255])),string:tag(8,'中文\0😀'),empty:tag(9,[],8),ints:tag(11,[-1,2147483647]),longs:tag(12,[-1n,9223372036854775807n]),nested:tag(9,[tag(10,{name:tag(8,'test')})],10)})
  for(const compression of ['none','gzip','zlib']){
    const raw=writeTypedNbt(root,'根😀',false),bytes=compression==='gzip'?zlib.gzipSync(raw):compression==='zlib'?zlib.deflateSync(raw):raw
    const doc=decodeConfig('meteor-client/test.nbt',bytes,'hash'),ipcDoc=JSON.parse(JSON.stringify(doc)) as ConfigDocument
    assert.equal(ipcDoc.compression,compression);assert.deepEqual(readTypedNbt(encodeConfig(ipcDoc)),readTypedNbt(bytes))
  }
})
test('NBT editors reject integer overflow and mixed homogeneous lists',()=>{
  assert.throws(()=>nodeNbt({type:'byte',value:128}),/越界/)
  assert.throws(()=>nodeNbt({type:'long',value:'9223372036854775808'}),/越界/)
  assert.throws(()=>encodeConfig({file:'x.nbt',hash:'',format:'nbt',root:{type:'compound',children:[{key:'x',node:{type:'list',elementType:8,children:[{key:'0',node:{type:'int',value:4}}]}}]}}),/同类型/)
})
test('Deferred edits never touch the running game and merge unrelated exit-time edits',async t=>{
  const f=fixture(t);f.runtime.running=true
  const live=path.join(f.directory,'slimefunhelper/runtime/combat.yml'),before=fs.readFileSync(live)
  await f.manager.commit('test',[f.edit(7)],'next-launch');assert.deepEqual(fs.readFileSync(live),before)
  fs.writeFileSync(live,'# game saved\ncombat:\n  enabled: true\n  speed: 2\n')
  f.runtime.running=false;await f.manager.beforeLaunch('test')
  const doc=f.manager.read('test','slimefunhelper/runtime/combat.yml')
  assert.equal(doc.root.children![0].node.children!.find(c=>c.key==='enabled')!.node.value,true)
  assert.equal(doc.root.children![0].node.children!.find(c=>c.key==='speed')!.node.value,7)
  assert.equal((await f.manager.catalog('test')).pending,false)
})
test('Conflicting game changes block launch and retain the pending draft',async t=>{
  const f=fixture(t);await f.manager.commit('test',[f.edit(7)],'next-launch')
  const live=path.join(f.directory,'slimefunhelper/runtime/combat.yml');fs.writeFileSync(live,'combat:\n  enabled: false\n  speed: 9\n')
  await assert.rejects(f.manager.beforeLaunch('test'),/冲突/);assert.match(fs.readFileSync(live,'utf8'),/speed: 9/)
  assert.equal((await f.manager.catalog('test')).pending,true)
})
test('Editing a pending draft twice preserves its original baseline; cancellation only removes pending files',async t=>{
  const f=fixture(t),live=path.join(f.directory,'slimefunhelper/runtime/combat.yml'),before=fs.readFileSync(live)
  await f.manager.commit('test',[f.edit(3)],'next-launch');await f.manager.commit('test',[f.edit(5)],'next-launch')
  f.manager.clearPending('test');assert.deepEqual(fs.readFileSync(live),before)
})
test('Stale drafts reject save; live bridge rejection does not mutate disk',async t=>{
  const f=fixture(t),draft=f.edit(8),live=path.join(f.directory,'slimefunhelper/runtime/combat.yml')
  fs.appendFileSync(live,'# changed externally\n');await assert.rejects(f.manager.commit('test',[draft],'restart'),/其他程序修改/)
  f.runtime.running=true;f.runtime.connected=true;const before=fs.readFileSync(live)
  await assert.rejects(f.manager.commit('test',[f.edit(6)],'hot'),/bridge failed/);assert.deepEqual(fs.readFileSync(live),before)
})
test('Restart applies only after the selected JVM exits, then relaunches its context',async t=>{
  const f=fixture(t);f.runtime.running=true;let savedAfterExit=false
  f.hooks.restart=async(_id,save)=>{assert.equal(f.runtime.running,true);f.runtime.running=false;await save();savedAfterExit=/speed: 7/.test(fs.readFileSync(path.join(f.directory,'slimefunhelper/runtime/combat.yml'),'utf8'));f.runtime.running=true}
  const result=await f.manager.commit('test',[f.edit(7)],'restart');assert.equal(result.ok,true);assert(savedAfterExit);assert(f.runtime.running);assert(result.backup)
})
test('Complete profile restores configuration content and backs up removed files',async t=>{
  const f=fixture(t);f.manager.saveProfile('test','all','初始配置')
  await f.manager.commit('test',[f.edit(6)],'restart');fs.writeFileSync(path.join(f.directory,'meteor-client/new.json'),'{}')
  const result=await f.manager.switchProfile('test','初始配置','hot')
  assert.match(fs.readFileSync(path.join(f.directory,'slimefunhelper/runtime/combat.yml'),'utf8'),/speed: 2/)
  assert(!fs.existsSync(path.join(f.directory,'meteor-client/new.json')));assert(fs.existsSync(path.join(result.backup!,'meteor-client/new.json')))
  const zip=new AdmZip(path.join(f.directory,'.miaocl-configs/profiles/初始配置.zip'));assert.deepEqual(zip.readFile('meteor-client/friends.nbt'),fs.readFileSync(path.join(f.directory,'meteor-client/friends.nbt')))
})
test('SlimefunHelper native snapshot activation overlays matching runtime fields',async t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.directory,'slimefunhelper/config'))
  fs.writeFileSync(path.join(f.directory,'slimefunhelper/config/测试.nbt'),writeTypedNbt(tag(10,{'slimefunhelper:combat_settings':tag(10,{combat:tag(10,{enabled:tag(1,1),speed:tag(3,4),unknown:tag(8,'preserve')})})}),'',false))
  await f.manager.activateSlimefunSnapshot('test','slimefunhelper/config/测试.nbt','hot')
  const text=fs.readFileSync(path.join(f.directory,'slimefunhelper/runtime/combat.yml'),'utf8');assert.match(text,/enabled: true/);assert.match(text,/speed: 4/);assert.match(text,/# keep comment/);assert(!text.includes('unknown'))
})
test('Path traversal, unlisted ZIP members and symbolic links cannot write outside an instance',async t=>{
  const f=fixture(t);assert.throws(()=>managedPath(f.directory,'meteor-client/../../secret'),/路径无效/)
  assert.throws(()=>managedPath(f.directory,'meteor-client/C:secret'),/路径无效/)
  const source=path.join(f.directory,'bad.zip'),zip=new AdmZip();zip.addFile('miaocl-config.json',Buffer.from(JSON.stringify({version:1,scope:'all',files:[]})));zip.addFile('meteor-client/unlisted.json',Buffer.from('{}'));zip.writeZip(source)
  await assert.rejects(f.manager.importBundle('test',source,'next-launch'),/未列入/)
  const external=fs.mkdtempSync(path.join(os.tmpdir(),'miaocl-link-'));t.after(()=>fs.rmSync(external,{recursive:true,force:true}));fs.symlinkSync(external,path.join(f.directory,'slimefunhelper/link'),'junction')
  assert.throws(()=>managedPath(f.directory,'slimefunhelper/link/test.nbt'),/链接/)
})
test('Real instance config codecs preserve all parsed NBT values without writing live files',t=>{
  const dir='D:/mc/.minecraft/versions/1.21.11无OBS 正常端'
  if (!fs.existsSync(dir)) return t.skip('Sample instance unavailable')
  const names:string[]=[]
  function walk(root:string){for(const item of fs.readdirSync(path.join(dir,root),{withFileTypes:true})){const file=root+'/'+item.name;if(item.isDirectory()){if(!item.name.startsWith('.')&&item.name!=='backups')walk(file)}else if(/\.(nbt|yml|yaml|json)$/i.test(file))names.push(file)}}
  walk('slimefunhelper');walk('meteor-client')
  let checked=0
  for(const file of names){const bytes=fs.readFileSync(path.join(dir,file)),doc=decodeConfig(file,bytes,'hash');if(doc.format==='nbt')assert.deepEqual(readTypedNbt(encodeConfig(JSON.parse(JSON.stringify(doc)))),readTypedNbt(bytes),file);else assert.deepEqual(decodeConfig(file,encodeConfig(doc,bytes),'hash').root,doc.root,file);checked++}
  assert(checked>20);t.diagnostic(`Read-only roundtrip checked ${checked} actual config files; no values logged`)
})
