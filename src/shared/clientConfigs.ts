export type ConfigScope = 'slimefunhelper' | 'meteor' | 'all'
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
}
export interface ConfigDocument {
  warning?: string
  file: string
  hash: string
  format: 'nbt' | 'yaml' | 'json' | 'baritone' | 'text' | 'binary'
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
  directory: string
  files: ConfigFile[]
  profiles: string[]
  pending: boolean
  runtime: ConfigRuntime
}
export interface ConfigCommitResult { ok: boolean; message: string; backup?: string }
