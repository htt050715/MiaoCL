import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slimefunLabel, slimefunDescription, slimefunChoice, slimefunOptions, slimefunCodecLabel, slimefunNodeSearchText } from '../src/renderer/src/utils/slimefunLabels'
import { parseSlimeValue, writeSlimeValue } from '../src/shared/snbtConfig'

test('Slimefun scalar and nested paths resolve parameter names, groups and tooltips', () => {
  assert.equal(slimefunLabel(['spear-module','spear-auto-restart']), '长矛工具: 自动重启')
  assert.match(slimefunDescription(['spear-module','spear-auto-restart'])!, /自动重新使用/)
  assert.equal(slimefunLabel(['att-bot','criticals']), '暴击设置')
  assert.notEqual(slimefunLabel(['att-bot','criticals','mode']), 'mode')
  assert.equal(slimefunLabel(['extension','unrecognized']), 'unrecognized')
  assert.match(slimefunNodeSearchText({type:'object',children:[{key:'spear-auto-restart',node:{type:'boolean',value:false}}]},['spear-module']), /长矛工具: 自动重启/)
})

test('Chinese enum labels preserve exact Java constants and unknown installed values', () => {
  assert.equal(slimefunChoice('enum:predict_mode:PREDICTOR_NV'), 'NV预测器')
  const values=slimefunOptions('enum:predict_mode:LOCAL_EXTENSION')!
  assert(values.includes('enum:predict_mode:LOCAL_EXTENSION'))
  assert(values.includes('enum:predict_mode:LINEAR'))
  assert.equal(slimefunChoice('enum:villager_text_position:FEET'), '村民脚下')
  assert.deepEqual(slimefunOptions('FIRST','villager_trade_display_mode'), ['FIRST','ALL'])
  assert.equal(slimefunChoice('arbitrary friend name'), 'arbitrary friend name')
})

test('Chinese codec fields and enum displays do not change serialized SNBT types or values', () => {
  const encoded=parseSlimeValue('nbt:predictargument:{history:5,mode:"PREDICTOR_NV",ticks:2.0d}')!
  const before=JSON.stringify(encoded.root)
  assert.equal(slimefunCodecLabel('predictargument',['history'],'history'), '历史采样长度')
  assert.equal(slimefunChoice('PREDICTOR_NV','predict_mode'), 'NV预测器')
  assert.equal(JSON.stringify(encoded.root),before)
  assert.deepEqual(parseSlimeValue(writeSlimeValue(encoded.prefix,encoded.root)),encoded)
})
