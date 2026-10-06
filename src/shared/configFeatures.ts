import type { ConfigNode } from './clientConfigs'
export const configChild = (node: ConfigNode | undefined, key: string) => node?.children?.find(c => c.key === key)?.node
export const configEnabled = (node: ConfigNode) => node.type === 'boolean' && node.value === true || node.type === 'byte' && node.value === 1
export interface ConfigFeature { name: string; node: ConfigNode; active?: ConfigNode; enabled: number }
export function configFeatures(root: ConfigNode, meteor: boolean): ConfigFeature[] {
  const entries = meteor ? configChild(root, 'modules')?.children : root.children
  return (entries ?? []).filter(c => c.node.children).map(c => {
    const name = meteor ? String(configChild(c.node, 'name')?.value ?? c.key) : c.key
    const active = meteor ? configChild(c.node, 'active') : undefined
    function count(node: ConfigNode): number { return configEnabled(node) ? 1 : (node.children ?? []).reduce((n,c) => n + count(c.node), 0) }
    return { name, node: c.node, active, enabled: active ? Number(configEnabled(active)) : count(c.node) }
  })
}
