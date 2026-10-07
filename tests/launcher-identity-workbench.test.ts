import test from 'node:test'
import assert from 'node:assert/strict'
import { displayAccount, skinHeadBitmap } from '../src/shared/launcherIdentity'
import { cleanDesign, designIdentity, designPath, resolveComponentDesign } from '../src/shared/visualDesign'
import type { Account } from '../src/shared/types'
const alice: Account = { id: 'a', username: 'Alice', uuid: 'a', type: 'microsoft' }
const bob: Account = { id: 'b', username: 'Bob', uuid: 'b', type: 'yggdrasil' }
test('display identity follows current, pins independently, and recovers when pinned account is removed', () => {
  assert.equal(displayAccount([], null), null)
  assert.equal(displayAccount([alice,bob], alice), alice)
  assert.equal(displayAccount([alice,bob], bob,'a'), alice)
  assert.equal(displayAccount([bob], bob,'a'), bob)
  assert.equal(displayAccount([], null,'a'), null)
})
test('head compositor includes hat alpha and nearest pixel scaling for standard and HD legacy skins', () => {
  for (const width of [64,128]) for (const height of [width,width/2]) {
    const bitmap = new Uint8Array(width*height*4), u=width/64
    for(let y=8*u;y<16*u;y++)for(let x=8*u;x<16*u;x++)bitmap.set([10,20,30,255],(y*width+x)*4)
    bitmap.set([110,120,130,128],(8*u*width+40*u)*4)
    const result=skinHeadBitmap(bitmap,width,height)
    assert.deepEqual([...result.slice(0,4)],[60,70,80,255])
    assert.deepEqual([...result.slice(31*4,32*4)],[10,20,30,255])
    assert.deepEqual([...result.slice(-4)],[10,20,30,255])
  }
  assert.throws(()=>skinHeadBitmap(new Uint8Array(4),1,1))
})
test('dynamic design targets survive filtering and reject another module or file customization', () => {
  const path=(file:string,module:string,param:string)=>designPath([{ui:'page'},{ui:'panel',identity:designIdentity(file)},{ui:'settings',identity:designIdentity(module,'General')},{ui:'row',identity:designIdentity(param)},{ui:'slider'}]).join('/')+'~0'
  const first=path('modules.nbt','flight','speed'),other=path('modules.nbt','speed','speed'),slime=path('combat.yml','flight','speed')
  const stored=cleanDesign({version:1,pages:{'client-configs/meteor':{components:{[first]:{width:220,opacity:.8,blur:24,fontSize:16}}}}})
  assert.equal(resolveComponentDesign(stored.pages['client-configs/meteor'].components,first)?.width,220)
  assert.equal(resolveComponentDesign(stored.pages['client-configs/meteor'].components,other),undefined)
  assert.equal(resolveComponentDesign(stored.pages['client-configs/meteor'].components,slime),undefined)
  assert.equal(designIdentity('配置/参数','组'),designIdentity('配置/参数','组'))
  assert.notEqual(designIdentity('a/b','c'),designIdentity('a','b/c'))
})
