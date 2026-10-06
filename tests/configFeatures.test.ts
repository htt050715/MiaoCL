import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseSlimeValue,writeSlimeValue} from '../src/shared/snbtConfig'
import {configChild,configFeatures} from '../src/shared/configFeatures'
import {valueNode,decodeConfig,encodeConfig} from '../src/main/core/clientConfigCodec'
import {tag,writeTypedNbt} from '../src/main/core/typedNbt'
test('Slimefun codec editing preserves nested values, numeric widths, long precision and text',()=>{
  const original='nbt:predictargument:{history:5,mode:"PREDICTOR_NV",ticks:2.0d,flags:[B;1b,0b],long:9223372036854775807L,text:"中文"}'
  const parsed=parseSlimeValue(original)!;assert(parsed);configChild(parsed.root,'ticks')!.value=4.5
  const next=parseSlimeValue(writeSlimeValue(parsed.prefix,parsed.root))!
  assert.deepEqual(next.root,parsed.root);assert.equal(configChild(next.root,'long')?.value,'9223372036854775807');assert.equal(configChild(next.root,'ticks')?.value,4.5)
  assert.equal(parseSlimeValue('nbt:codec:{broken'),undefined)
})
test('Meteor feature edits persist active state and individual parameters without changing other modules',()=>{
  const module=(name:string,active:number,speed:number)=>tag(10,{name:tag(8,name),active:tag(1,active),settings:tag(10,{speed:tag(6,speed)})})
  const bytes=writeTypedNbt(tag(10,{modules:tag(9,[module('fly',0,2),module('hud',1,3)],10)}),'',false)
  const doc=decodeConfig('meteor-client/modules.nbt',bytes,'');const features=configFeatures(doc.root,true)
  assert.equal(features[1].enabled,1);features[0].active!.value=1;configChild(configChild(features[0].node,'settings'),'speed')!.value=7
  const reloaded=configFeatures(decodeConfig(doc.file,encodeConfig(doc),'').root,true)
  assert.equal(reloaded[0].enabled,1);assert.equal(configChild(configChild(reloaded[0].node,'settings'),'speed')?.value,7)
  assert.deepEqual(reloaded[1],features[1])
})
test('Slimefun enabled parameter summaries distinguish false switches from numeric values',()=>{
  const features=configFeatures(valueNode({combat:{enabled:false,speed:1},render:{esp:true,range:1}}),false)
  assert.equal(features[0].enabled,0);assert.equal(features[1].enabled,1)
})
