export type ConfigScope = 'slimefunhelper' | 'meteor' | 'all' | 'mods'
export type ConfigSaveMode = 'restart' | 'next-launch' | 'hot'
export interface ConfigNode {
  type: string
  value?: string | number | boolean | null
  children?: { key: string; node: ConfigNode }[]
  elementType?: number
  title?: string
  description?: string
  options?: string[]
  min?: number
  max?: number
  kind?: string
  sliderMin?: number
  sliderMax?: number
  noSlider?: boolean
  enumType?: string
  enumNames?: Record<string, string>
}
export interface ConfigDocument {
  warning?: string
  file: string
  hash: string
  format: 'nbt' | 'yaml' | 'json' | 'json5' | 'toml' | 'properties' | 'baritone' | 'text' | 'binary'
  compression?: 'gzip' | 'zlib' | 'none'
  name?: string
  root: ConfigNode
}
export interface ConfigFile { file: string; size: number; modified: number; scope: ConfigScope }
export interface ConfigRuntime {
  running: boolean
  owned: boolean
  connected: boolean
  capabilities: string[]
  modules: { name: string; title: string; addon: string; category: string; active?: boolean }[]
  slimeModules?: {name:string;title:string;file:string;path:string[];active:boolean}[]
  reason?: string
}
export interface ConfigCatalog {
  mods?: { id: string; name: string; version: string; files: string[]; disabled?: boolean; icon?: string; association?: string }[]
  modTranslations?: Record<string, string>
  warnings?: string[]
  meteorTranslations?: Record<string, string>
  directory: string
  files: ConfigFile[]
  profiles: string[]
  pending: boolean
  runtime: ConfigRuntime
}
export interface ConfigCommitResult { ok: boolean; message: string; backup?: string }
