import fs from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'

export type MeteorTranslations = Record<string, string>
const cache = new Map<string, { fingerprint: string; result: Promise<MeteorTranslations> }>()
const relevant = /^(?:Module|Setting|SettingGroup|Category|Enum|Gui)\.Meteor\.|^(?:module|setting|category|setting-group|enum)\.(?:meteor-client|meteor-rejects|meteor-miku|jefff)[.]/

/** Read the same installed Chinese resources as Meteor I18n. No resources are copied into the game. */
export async function readMeteorTranslations(directory: string): Promise<MeteorTranslations> {
  const files: string[] = []
  const mods = path.join(directory, 'mods'), packs = path.join(directory, 'resourcepacks')
  try { files.push(...(await fs.readdir(mods)).filter(n => n.endsWith('.jar')).sort().map(n => path.join(mods, n))) } catch {}
  let options = ''
  try { options = await fs.readFile(path.join(directory, 'options.txt'), 'utf8') } catch {}
  try {
    const names = JSON.parse(/^resourcePacks:(.*)$/m.exec(options)?.[1] ?? '[]')
    if (Array.isArray(names)) for (const name of names) {
      if (typeof name !== 'string' || !name.startsWith('file/')) continue
      const file = path.resolve(packs, name.slice(5)), relative = path.relative(packs, file)
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) files.push(file)
    }
  } catch {}
  const inventory = await Promise.all(files.map(async file => {
    try { const stat = await fs.stat(file); return { file, size: stat.size, mtime: stat.mtimeMs, folder: stat.isDirectory() } } catch { return undefined }
  }))
  const present = inventory.filter((f): f is NonNullable<typeof f> => !!f)
  // Directory packs have a nested resource whose mtime can change independently.
  const folderStats = await Promise.all(present.filter(f => f.folder).map(async f => {
    try { const s = await fs.stat(path.join(f.file, 'assets/yalu/lang/zh_cn.json')); return s.mtimeMs } catch { return 0 }
  }))
  const fingerprint = JSON.stringify([present, folderStats, options])
  if (cache.get(directory)?.fingerprint === fingerprint) return cache.get(directory)!.result
  const result = (async () => {
    const translations = Object.create(null) as MeteorTranslations
    const merge = (bytes: Buffer) => {
      if (bytes.length > 8 * 1024 * 1024) return
      try { const data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); for (const [key, value] of Object.entries(data)) if (relevant.test(key) && typeof value === 'string' && value.length <= 12000) translations[key] = value } catch {}
    }
    for (const entry of present) {
      try {
        if (entry.folder) { merge(await fs.readFile(path.join(entry.file, 'assets/yalu/lang/zh_cn.json'))); continue }
        if (entry.size > 256 * 1024 * 1024) continue
        const bytes = await fs.readFile(entry.file)
        if (!bytes.includes(Buffer.from('/lang/zh_cn.json'))) continue
        const zip = new AdmZip(bytes)
        for (const resource of zip.getEntries()) if (/^assets\/[^/]+\/lang\/zh_cn\.json$/.test(resource.entryName) && resource.header.size <= 8 * 1024 * 1024) merge(resource.getData())
      } catch { /* An unrelated corrupt MOD must not prevent configuration editing. */ }
    }
    return translations
  })()
  if (cache.size >= 8 && !cache.has(directory)) cache.delete(cache.keys().next().value!)
  cache.set(directory, { fingerprint, result })
  return result
}
