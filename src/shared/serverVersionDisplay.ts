import type { InstalledVersion, ServerEntry } from './types'

/** Resolve display metadata from the linked instance without changing the saved server record. */
export function serverVersionDisplay(server: ServerEntry, target?: InstalledVersion): ServerEntry {
  if (!server.versionId) return server
  if (target) {
    return {
      ...server,
      minecraftVersion: target.mcVersion === '0.0.0' ? '未知' : target.mcVersion,
      loader: target.loader,
      loaderVersion: target.loaderVersion
    }
  }
  return server.minecraftVersion === '0.0.0'
    ? { ...server, minecraftVersion: '未知' }
    : server
}
