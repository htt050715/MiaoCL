import schema from '@shared/meteorSchema.json'
import type { ConfigNode } from '@shared/clientConfigs'
export type Translations = Record<string, string>
export interface MeteorSettingSchema { name: string; group: string; kind: string; min?: number; max?: number; sliderMin?: number; sliderMax?: number; noSlider?: boolean; options?: string[]; enumType?: string; enumNames?: Record<string,string> }
type ModuleSchema = { category: string; settings: MeteorSettingSchema[] }
const modules = schema.modules as Record<string, ModuleSchema>
const categories: Record<string,string> = { Combat:'战斗',Player:'玩家',Movement:'移动',Render:'渲染',World:'世界',Misc:'杂项',Rejects:'Rejects 附加模块',Miku:'Miku 附加模块' }
const groups: Record<string,string> = { General:'常规',Bind:'按键绑定','Anti Kick':'防踢出',Targeting:'目标选择',Timing:'攻击时机',Render:'渲染',Color:'颜色',Colors:'颜色',Sound:'声音',Behaviour:'行为',Behavior:'行为',Advanced:'高级',Chat:'聊天' }
const text = (translations: Translations, keys: string[], fallback: string) => keys.map(key=>translations[key]).find(Boolean) ?? fallback
export const meteorSchema = (name: string) => modules[name]
export function meteorModuleLabel(t: Translations, name: string, fallback=name) {
  return text(t,[`Module.Meteor.${name}`,`module.meteor-client.${name}`,`module.meteor-rejects.${name}`],fallback)
}
export function meteorCategoryLabel(t: Translations, name: string) { return text(t,[`Category.Meteor.${name}`],categories[name]??name) }
export function meteorGroupLabel(t: Translations, name: string) { return text(t,[`SettingGroup.Meteor.${name}`,`Gui.Meteor.${name}`],groups[name]??name) }
export function meteorSettingLabel(t: Translations,module: string,name: string,fallback=name) {
  return text(t,[`setting.meteor-client.${module}.${name}`,`setting.meteor-rejects.${module}.${name}`,`Setting.Meteor.${name}`],fallback)
}
export function meteorSettingDescription(t: Translations,module: string,name: string,fallback='') {
  return text(t,[`setting.meteor-client.${module}.${name}.description`,`setting.meteor-rejects.${module}.${name}.description`,`Setting.Meteor.${name}.Description`],fallback)
}
export function meteorChoice(t: Translations,value: string,type?: string,names?: Record<string,string>) {
  return text(t,[...(type?[`Enum.Meteor.${type}.${names?.[value]??value}`]:[]),`Gui.Meteor.${value}`],value)
}
export function meteorSettingMetadata(module: string,group: string,name: string,t: Translations,node: ConfigNode): MeteorSettingSchema|undefined {
  const choices=modules[module]?.settings.filter(s=>s.name===name)??[]
  return choices.find(s=>s.group===group||meteorGroupLabel(t,s.group)===group)??(choices.length===1?choices[0]:undefined)
}
