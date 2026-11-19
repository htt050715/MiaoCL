import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { InstanceTarget } from '../../shared/instanceCenter'
import type { FabricLoaderChoices } from '../../shared/types'
import { centerTarget, assertInstanceIdle } from './instanceCenter'
import { resolveInstanceMetadata } from './instanceMetadata'
import { readVersionJson, libraryTasks, type VersionJson } from './versions'
import { withGameFolder, versionJsonPath } from './paths'
import { listLoaderVersions } from './loaders'
import { downloadAll, fetchSignal } from './download'
import { downloadLimiter } from './downloadLimits'
import { getSettings } from './settings'
import { withFileJob } from './fileJobs'
import { getRunningVersionIds } from './launch'
import { safePath } from './backupStore'

function context(target: InstanceTarget) {
  const c = centerTarget(target)
  return withGameFolder(c.folder, () => {
    const meta = resolveInstanceMetadata(c.json, id => readVersionJson(id))
    if (meta.broken || meta.loader !== 'fabric' || !meta.loaderVersion || meta.mcVersion === '未知') throw new Error('无法识别此实例的 Fabric Loader 与 Minecraft 版本')
    // Inherited loader dependencies cannot be removed by editing only the child profile.
    if (c.json.inheritsFrom && resolveInstanceMetadata(readVersionJson(c.json.inheritsFrom), id => readVersionJson(id)).loader) throw new Error('此实例继承了另一个加载器实例，请先创建独立副本再切换 Loader')
    return { ...c, meta, file: versionJsonPath(target.id) }
  })
}

export async function fabricLoaderChoices(target: InstanceTarget): Promise<FabricLoaderChoices> {
  const c = context(target)
  return { mcVersion: c.meta.mcVersion, currentVersion: c.meta.loaderVersion!, versions: await listLoaderVersions('fabric', c.meta.mcVersion) }
}

async function profile(mc: string, version: string): Promise<VersionJson> {
  const response = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(version)}/profile/json`, { signal: fetchSignal() })
  if (!response.ok) throw new Error(`获取 Fabric Loader ${version} 失败：HTTP ${response.status}`)
  const json = await response.json() as VersionJson
  if (json.inheritsFrom !== mc || !json.mainClass?.startsWith('net.fabricmc.') || !Array.isArray(json.libraries) || !json.libraries.some(l => l.name === `net.fabricmc:fabric-loader:${version}`)) throw new Error('Fabric 官方返回的加载器配置与所选版本不匹配')
  for (const lib of json.libraries) {
    if (!lib.name || !/^[\w.-]+:[\w.-]+:[\w.+-]+$/.test(lib.name) || lib.name.split(':').some(p => p === '.' || p === '..') || lib.url !== 'https://maven.fabricmc.net/' || lib.downloads) throw new Error('Fabric 依赖配置无效')
  }
  for (const kind of ['game', 'jvm'] as const) if (json.arguments?.[kind] && (!Array.isArray(json.arguments[kind]) || json.arguments[kind]!.some(arg => typeof arg !== 'string'))) throw new Error('Fabric 启动参数格式无效')
  return json
}

const coordinate = (name = '') => name.split(':').slice(0, 2).join(':')

export async function changeFabricLoader(target: InstanceTarget, version: string): Promise<{ backup: string }> {
  if (typeof version !== 'string' || !/^[\w.+-]{1,80}$/.test(version)) throw new Error('Fabric Loader 版本号无效')
  const initial = context(target)
  return withGameFolder(initial.folder, () => withFileJob(initial.dir, undefined, () => withFileJob(initial.file, undefined, async () => {
    const c = context(target)
    if (c.dir !== initial.dir) throw new Error('实例目录发生变化，请重新打开版本管理')
    await safePath(path.join(c.folder, 'versions'), target.id + '/' + target.id + '.json')
    await assertInstanceIdle(c.dir)
    if (c.meta.loaderVersion === version) throw new Error('实例已经使用此 Fabric Loader 版本')
    const original = fs.readFileSync(c.file)
    const [oldProfile, nextProfile] = await Promise.all([profile(c.meta.mcVersion, c.meta.loaderVersion!), profile(c.meta.mcVersion, version)])
    const owned = new Set([...oldProfile.libraries!, ...nextProfile.libraries!].map(l => coordinate(l.name)))
    const next: VersionJson = { ...c.json, mainClass: nextProfile.mainClass, _loader: 'fabric', _loaderVersion: version,
      libraries: [...nextProfile.libraries!, ...(c.json.libraries ?? []).filter(l => !owned.has(coordinate(l.name)))],
      arguments: { ...c.json.arguments }
    }
    for (const kind of ['game', 'jvm'] as const) {
      const args = [...(c.json.arguments?.[kind] ?? [])]
      for (const arg of oldProfile.arguments?.[kind] ?? []) {
        const index = args.findIndex(a => JSON.stringify(a) === JSON.stringify(arg))
        if (index >= 0) args.splice(index, 1)
      }
      next.arguments![kind] = [...args, ...(nextProfile.arguments?.[kind] ?? [])]
    }
    const tasks = libraryTasks(nextProfile)
    // Fabric metadata also supplies hashes outside downloads.artifact.
    for (let i = 0; i < tasks.length; i++) {
      const lib = nextProfile.libraries![i] as { sha1?: string; size?: number }
      tasks[i].sha1 = lib.sha1
      tasks[i].size = lib.size
    }
    await downloadAll(tasks, () => {}, downloadLimiter.maxConcurrent, getSettings().mirror)
    await assertInstanceIdle(c.dir)
    await safePath(path.join(c.folder, 'versions'), target.id + '/' + target.id + '.json')
    const current = context(target)
    // No await between the last session/snapshot checks and the atomic replacement.
    if (getRunningVersionIds().has(target.id)) throw new Error('游戏正在运行或准备启动，请退出后重试')
    if (current.dir !== c.dir || JSON.stringify(current.json) !== JSON.stringify(c.json) || !fs.readFileSync(c.file).equals(original)) throw new Error('切换期间实例配置发生变化，请重新打开版本管理')
    const suffix = randomUUID(), backup = `${c.file}.miaocl-loader-${suffix}.bak`, temp = `${c.file}.${suffix}.tmp`
    try {
      fs.writeFileSync(backup, original, { flag: 'wx' })
      fs.writeFileSync(temp, JSON.stringify(next, null, 2), { flag: 'wx' })
      fs.renameSync(temp, c.file)
      return { backup }
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  })))
}
