import translations from '../assets/slimefun-zh_cn.json'

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
  const toggle = entries[`module-toggle.${path.join('.')}`]
  if (toggle) return toggle
  const exact = entries[path.join('.')]
  if (exact) return exact
  if (path.length === 1) {
    const name = groupAliases[path[0]] ?? path[0]
    return moduleNames.get(normalized(name)) ?? fallback
  }
  const leaf = path.at(-1) ?? ''
  return moduleNames.get(normalized(leaf)) ?? fallback
}

export function slimefunSearchText(path: readonly string[]): string {
  return `${path.join('.')} ${slimefunLabel(path)}`
}
