import translations from '../assets/slimefun-zh_cn.json'
import enumValues from '../assets/slimefun-enums.json'
import type { ConfigNode } from '@shared/clientConfigs'

const entries = translations as Record<string, string>
const modulePrefix = 'widget.click-gui.module-name.'
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const moduleNames = new Map<string, string>()
for (const [key, value] of Object.entries(entries)) {
  if (key.startsWith(modulePrefix)) moduleNames.set(normalized(key.slice(modulePrefix.length).split('.').at(-1) ?? ''), value)
}

// The YAML group names are sometimes shorter than the source module names.
const groupAliases: Record<string, string> = {
  attack: 'Attack', 'att-bot': 'Attack', 'bow-att': 'BowEnhance', projectile: 'ProjectileEnhance',
  'mine-bot': 'MineBot', 'mine-oneblock': 'PacketMine', 'mine-arua': 'MineArua',
  'auto-inv': 'AutoSteal', 'render-optimize': 'Optimize', 'in-game-hud': 'Hud',
  'packet-debugger': 'PacketDebug', 'survival-mine-utils': 'BlockFarm', 'survival-interact-utils': 'AutoBreed',
  'move-safety': 'NoFall', 'move-speed': 'MovExtra', 'combat-utils': 'CombatExtra',
  'combat-info': 'CombatLog', totem: 'AutoTotem', 'spear-module': 'SpearEnhance',
  'lag-utils': 'Blink', 'interaction-tweaks': 'InteractExtra', 'interact-scaffold': 'Scaffold',
  'tp-interact': 'TpInteract', 'place-utils': 'AutoSurround', 'block-rotate': 'BlockRotate',
  'click-gui': 'ClickGui', 'chat-helper': 'ChatExtra', 'chat-screen-tools': 'ChatTools',
  'client-side-command': 'ClientSideCommand', 'chat-combine': 'ChatCombine', 'player-chat': 'PlayerChat',
  'chat-spam-fix': 'ChatSpamFix', 'freecam': 'Freecam', 'auto-logout': 'AutoLogout',
  'disablers': 'Disabler', 'iq-boost': 'IQBoost'
}

export function slimefunLabel(path: readonly string[], fallback = path.at(-1) ?? ''): string {
  const exact = entries[path.join('.')]
  if (exact) return exact
  const index = entries[`config.index.${path.join('.')}`]
  if (index) return index
  const toggle = entries[`module-toggle.${path.join('.')}`]
  if (toggle) return toggle
  if (path.length === 1) {
    const name = groupAliases[path[0]] ?? path[0]
    return moduleNames.get(normalized(name)) ?? fallback
  }
  return fallback
}

export function slimefunDescription(path: readonly string[]): string | undefined {
  return entries[`${path.join('.')}.tooltips`]
}

export function slimefunChoice(value: string, enumType?: string): string {
  const encoded = /^enum:([^:]+):(.+)$/.exec(value)
  const type = encoded?.[1] ?? enumType
  return type ? entries[`configenum.${type.replaceAll('_', '-')}.${(encoded?.[2] ?? value).toLowerCase()}`] ?? value : value
}

// Values come from the upstream Java enums, never from a translated label.
export function slimefunOptions(value: unknown, enumType?: string): string[] | undefined {
  const encoded = typeof value === 'string' ? /^enum:([^:]+):(.+)$/.exec(value) : null
  const type = encoded?.[1] ?? enumType
  const values = type ? (enumValues as Record<string, string[]>)[type] : undefined
  if (!values) return
  const choices = values.map(v => encoded ? `enum:${type}:${v}` : v)
  return typeof value === 'string' && !choices.includes(value) ? [value, ...choices] : choices
}

// Codec field names verified against NBTTypes and PositionPredict.PredictArgument.
const codecFields: Record<string, Record<string, string>> = {
  predictargument: { ticks: '预测前瞻量', history: '历史采样长度', mode: '预测模式' },
  tracingoption: { box: '渲染边框', line: '渲染追踪线' },
  optionalprimitive: { present: '启用此参数', value: '参数值' },
  stringformat: { arguments: '可用变量', color_str: '启用颜色代码', format: '文本格式' },
  entryset: { data: '条目列表', key_type: '注册表类型' },
  pos3: { x: 'X 坐标', y: 'Y 坐标', z: 'Z 坐标' }
}
const widgetPrefixes: Record<string, string> = { predictargument: 'predict-argument', tracingoption: 'tracing-option', stringformat: 'string-format' }
export function slimefunCodecLabel(codec: string, path: readonly string[], fallback: string): string {
  return path.length === 1 ? codecFields[codec]?.[path[0]] ?? entries[`widget.nbt-parsable.${widgetPrefixes[codec] ?? codec}.${path[0]}`] ?? fallback : fallback
}
export function slimefunCodecDescription(codec: string, path: readonly string[]): string | undefined {
  return path.length === 1 ? entries[`widget.nbt-parsable.${widgetPrefixes[codec] ?? codec}.${path[0]}.tooltips`] : undefined
}
export function slimefunCodecEnum(codec: string | undefined, path: readonly string[]): string | undefined {
  return codec === 'predictargument' && path.length === 1 && path[0] === 'mode' ? 'predict_mode' : undefined
}

export function slimefunSearchText(path: readonly string[]): string {
  return `${path.join('.')} ${slimefunLabel(path)} ${slimefunDescription(path) ?? ''}`
}

export function slimefunNodeSearchText(node: ConfigNode, path: readonly string[]): string {
  return [slimefunSearchText(path), String(node.value ?? ''), ...(node.children ?? []).map(c => slimefunNodeSearchText(c.node, [...path, c.key]))].join(' ')
}
