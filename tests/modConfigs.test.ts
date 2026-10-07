import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import AdmZip from 'adm-zip'
import {ClientConfigManager,managedPath} from '../src/main/core/clientConfigs'
import {decodeConfig,encodeConfig} from '../src/main/core/clientConfigCodec'
import {parseProperties} from '../src/main/core/modConfigCodec'
import {groupModConfigs,modSettingLabel} from '../src/shared/modConfigs'
import type {ConfigRuntime} from '../src/shared/clientConfigs'
function fixture(t:any){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'MiaoCL mod menu '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));for(const folder of ['config','defaultconfigs','slimefunhelper/runtime','meteor-client','baritone','mods','saves'])fs.mkdirSync(path.join(dir,folder),{recursive:true});const runtime:ConfigRuntime={running:false,owned:true,connected:false,capabilities:[],modules:[]};const manager=new ClientConfigManager({directory:()=>dir,runtime:async()=>runtime,hot:async()=>{throw Error('must not call hot')},restart:async(_id,save)=>{runtime.running=false;await save()}});return{dir,manager,runtime}}
test('All MOD bundle includes common and custom roots, preserves opaque bytes and merges without deleting unrelated config',async t=>{
  const f=fixture(t),inputs={'config/test.json':'{"enabled":false}', 'defaultconfigs/test.toml':'enabled = true\n','slimefunhelper/runtime/a.yml':'enabled: true\n','meteor-client/a.json':'{}','baritone/settings.txt':'allowBreak true\n','config/custom.bin':Buffer.from([0,255,1])}
  for(const [file,bytes]of Object.entries(inputs))fs.writeFileSync(path.join(f.dir,file),bytes)
  fs.writeFileSync(path.join(f.dir,'mods/mod.jar'),'not included');fs.writeFileSync(path.join(f.dir,'saves/world'),'not included')
  const zipfile=path.join(f.dir,'all.zip');f.manager.exportBundle('test','mods',zipfile);const zip=new AdmZip(zipfile)
  assert.deepEqual(zip.readFile('config/custom.bin'),inputs['config/custom.bin']);assert(!zip.getEntry('mods/mod.jar'));assert(!zip.getEntry('saves/world'))
  assert.equal((await f.manager.catalog('test','mods')).files.length,6);assert.equal((await f.manager.catalog('test')).files.length,3)
  fs.writeFileSync(path.join(f.dir,'config/test.json'),'{}');fs.writeFileSync(path.join(f.dir,'config/new-mod.json'),'{"keep":true}')
  const result=await f.manager.importBundle('test',zipfile,'restart','mods');assert(result.backup);assert.equal(fs.readFileSync(path.join(f.dir,'config/test.json'),'utf8'),inputs['config/test.json']);assert(fs.existsSync(path.join(f.dir,'config/new-mod.json')))
  await assert.rejects(f.manager.importBundle('test',zipfile,'restart','meteor'),/范围匹配/)
})
test('General MOD configs defer while running and never claim unsupported hot reload',async t=>{
  const f=fixture(t),file=path.join(f.dir,'config/test.json');fs.writeFileSync(file,'{"enabled":false}')
  const doc=f.manager.read('test','config/test.json');doc.root.children![0].node.value=true;f.runtime.running=true;f.runtime.connected=true
  await assert.rejects(f.manager.commit('test',[doc],'hot'),/未声明配置热重载/);assert.equal(fs.readFileSync(file,'utf8'),'{"enabled":false}')
  await f.manager.commit('test',[doc],'next-launch');assert.equal(fs.readFileSync(file,'utf8'),'{"enabled":false}');f.runtime.running=false;await f.manager.beforeLaunch('test');assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).enabled,true)
})
test('JSON5 and TOML visual controls preserve field types; invalid or date-based formats retain raw editing',()=>{
  for(const [file,source]of [['config/test.json5',"// comment\n{enabled:true,speed:2,names:['a','b'],}"],['config/test.toml','# comment\nenabled = true\n[render]\nspeed = 2\n']]){
    const bytes=Buffer.from(source),doc=decodeConfig(file,bytes,'');assert.deepEqual(encodeConfig(doc,bytes),bytes)
    doc.root.children!.find(c=>c.key==='enabled')!.node.value=false
    assert.deepEqual(decodeConfig(file,encodeConfig(doc,bytes),'').root,doc.root)
  }
  assert.equal(decodeConfig('config/odd.toml',Buffer.from('date = 1979-05-27T07:32:00Z'),'').format,'text')
  assert.equal(decodeConfig('config/odd.json',Buffer.from('{broken'),'').format,'text')
  assert.equal(decodeConfig('config/big.json',Buffer.from('{"id":9223372036854775807}'),'').format,'text')
  assert.equal(decodeConfig('config/big.yaml',Buffer.from('id: 9223372036854775807\n'),'').format,'text')
  const bytes=Buffer.from([255,127]);assert.deepEqual(encodeConfig(decodeConfig('config/odd.bin',bytes,'')),bytes)
})
test('Properties edits preserve comments, escaped separators, continuations and unchanged values',()=>{
  const bytes=Buffer.from('# keep\r\nenabled=true\r\ncount=2\r\nescaped\\ key=hello\\\r\n  world\r\nunicode=\\u4e2d\\u6587\r\n')
  const doc=decodeConfig('config/test.properties',bytes,'');assert.deepEqual(encodeConfig(doc,bytes),bytes)
  doc.root.children!.find(c=>c.key==='enabled')!.node.value=false
  const after=encodeConfig(doc,bytes).toString('utf8');assert(after.includes('# keep\r\n'));assert(after.includes('unicode=\\u4e2d\\u6587'))
  assert.deepEqual({...parseProperties(after)},{enabled:'false',count:'2','escaped key':'helloworld',unicode:'中文'})
})
test('Mod grouping is explicit for ambiguous matches, deduplicates installed IDs and resolves AutoConfig translations',()=>{
  const mods=groupModConfigs(['config/sodium-extra.json','config/sodium.json','config/unknown.json'],[{id:'sodium',name:'Sodium',version:'1'},{id:'sodium-extra',name:'Sodium Extra',version:'1'},{id:'sodium',name:'Sodium disabled',version:'1',disabled:true}])
  assert.equal(mods.filter(m=>m.id==='sodium').length,1);assert.deepEqual(mods.find(m=>m.id==='sodium-extra')!.files,['config/sodium-extra.json']);assert.equal(mods.find(m=>m.files.includes('config/unknown.json'))!.association,'未确认所属模组')
  assert.equal(modSettingLabel({'text.autoconfig.demo.option.enabled':'启用'},'demo',['enabled']),'启用')
})
test('Configuration paths reject Windows aliases and links without reaching mods or saves',t=>{const f=fixture(t);for(const file of ['config/../mods/a.jar','config/a.json.','config/CON.json','config/a:stream','saves/serverconfig/a.toml'])assert.throws(()=>managedPath(f.dir,file));fs.symlinkSync(path.join(f.dir,'saves'),path.join(f.dir,'config/link'),'junction');assert.throws(()=>managedPath(f.dir,'config/link/a'),/链接/)})
