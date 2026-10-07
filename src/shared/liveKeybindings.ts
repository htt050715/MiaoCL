import { mcKeyLabel } from './keybindings'

/** Keys are InputUtil translation keys, never platform key codes. */
export interface LiveBinding {
  keys: string[]
  modifiers: number
  release: boolean
  passThrough: boolean
}
export interface LiveKeybinding {
  id: string
  label: string
  category: string
  kind: 'vanilla' | 'meteor' | 'slime'
  binding: LiveBinding
  defaultBinding?: LiveBinding
  module?: string
  setting?: string
  path?: string[]
}
export interface LiveKeysSnapshot {
  session: string
  items: LiveKeybinding[]
  warnings: string[]
  meteorTranslations?: Record<string,string>
}
export function sameBinding(a: LiveBinding, b: LiveBinding): boolean {
  return a.modifiers === b.modifiers && a.release === b.release && a.passThrough === b.passThrough && a.keys.length === b.keys.length && a.keys.every((key,i) => key === b.keys[i])
}
export function liveBindingLabel(binding: LiveBinding): string {
  if (!binding.keys.length) return '未指定'
  const mods = [[2,'Ctrl'],[8,'Win'],[4,'Alt'],[1,'Shift'],[16,'Caps Lock'],[32,'Num Lock']] as const
  return [...mods.filter(([bit]) => binding.modifiers & bit).map(([,label]) => label),...binding.keys.map(mcKeyLabel)].join(' + ')
}
export const emptyBinding = (): LiveBinding => ({keys:[],modifiers:0,release:false,passThrough:false})
