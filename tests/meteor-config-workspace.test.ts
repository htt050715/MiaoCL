import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Zip from 'adm-zip'
import {readMeteorTranslations} from '../src/main/core/meteorTranslations'
import {meteorModuleLabel,meteorSettingLabel,meteorChoice,meteorSettingMetadata,meteorSchema} from '../src/renderer/src/utils/meteorLabels'

test('Installed I18n and active resource packs share Chinese labels, cache refreshes changed resources',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'miaocl-meteor-lang-'))
  await fs.mkdir(path.join(dir,'mods'));await fs.mkdir(path.join(dir,'resourcepacks'))
  const jar=new Zip();jar.addFile('assets/yalu/lang/zh_cn.json',Buffer.from(JSON.stringify({'Module.Meteor.flight':'飞行','Setting.Meteor.speed':'速度','Enum.Meteor.Mode.Velocity':'速度模式'})));jar.writeZip(path.join(dir,'mods','i18n.jar'))
  const disabled=new Zip();disabled.addFile('assets/yalu/lang/zh_cn.json',Buffer.from('{"Module.Meteor.flight":"禁用资源包"}'));disabled.writeZip(path.join(dir,'resourcepacks','disabled.zip'))
  let t=await readMeteorTranslations(dir)
  assert.equal(meteorModuleLabel(t,'flight'),'飞行');assert.equal(meteorSettingLabel(t,'flight','speed'),'速度');assert.equal(meteorChoice(t,'Velocity','Mode'),'速度模式')
  const active=new Zip();active.addFile('assets/yalu/lang/zh_cn.json',Buffer.from('{"Module.Meteor.flight":"资源包飞行"}'));active.writeZip(path.join(dir,'resourcepacks','active.zip'))
  await fs.writeFile(path.join(dir,'options.txt'),'resourcePacks:["file/active.zip"]\n')
  t=await readMeteorTranslations(dir);assert.equal(meteorModuleLabel(t,'flight'),'资源包飞行')
  assert.equal(meteorChoice(t,'UnknownValue','UnknownEnum'),'UnknownValue')
})
test('Offline schema separates identically named settings by their ClickGUI groups',()=>{
  const node={type:'string',value:'Abilities'}
  const general=meteorSettingMetadata('flight','General','mode',{},node)!
  const antiKick=meteorSettingMetadata('flight','Anti Kick','mode',{},node)!
  assert.deepEqual(general.options,['Abilities','Velocity']);assert.deepEqual(antiKick.options,['Normal','Packet','None'])
  const speed=meteorSettingMetadata('flight','General','speed',{},node)!
  assert.equal(speed.sliderMin,0);assert.equal(speed.sliderMax,10);assert.equal(speed.min,0)
  assert.equal(meteorSchema('flight')?.category,'Movement')
  assert.equal(meteorSettingMetadata('unknown-addon','General','mode',{},node),undefined)
})
