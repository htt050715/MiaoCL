import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as vue from 'vue'

const bundle = build({
  stdin: { contents: `export * from './src/main/core/fabricLoader'; export {getSettings} from './src/main/core/settings'`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', logLevel: 'silent',
  plugins: [{ name: 'loader-fixture', setup(b) {
    b.onResolve({ filter: /^\.\/launch$/ }, () => ({ path: 'launch-fixture', external: true }))
    b.onResolve({ filter: /^\.\/gameDirectoryUse$/ }, () => ({ path: 'external-game-fixture', external: true }))
    b.onResolve({ filter: /^\.\/download$/ }, a => a.importer.endsWith('fabricLoader.ts') ? { path: 'download-fixture', external: true } : undefined)
  } }]
}).then(r => r.outputFiles[0].text)

function official(version: string) {
  return { id: `fabric-loader-${version}-1.21.11`, inheritsFrom: '1.21.11', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
    libraries: [
      { name: `net.fabricmc:fabric-loader:${version}`, url: 'https://maven.fabricmc.net/' },
      { name: `org.ow2.asm:asm:${version === '0.19.3' ? '9.10' : '9.9'}`, url: 'https://maven.fabricmc.net/', sha1: 'a'.repeat(40), size: 100 },
      { name: 'net.fabricmc:intermediary:1.21.11', url: 'https://maven.fabricmc.net/' }
    ], arguments: { game: [], jvm: ['-DFabricMcEmu=Main', `-Dloader.fixture=${version}`] } }
}

async function fixture(inherited = false, shared = false) {
  const created = fs.mkdtempSync(path.join(os.tmpdir(), 'miaocl-loader-test-')), root = fs.realpathSync.native(created)
  const folder = path.join(root, 'game'), id = '测试 Fabric 实例', dir = path.join(folder, 'versions', id), file = path.join(dir, `${id}.json`)
  fs.mkdirSync(dir, { recursive: true })
  const original = { ...official('0.19.3'), id, inheritsFrom: inherited ? '1.21.11' : undefined, clientVersion: '1.21.11',
    _loader: 'fabric', _loaderVersion: '0.19.3', _gameDir: !shared, _javaPath: 'private-java', _resolution: { width: 1234, height: 800 }, customField: { keep: true },
    libraries: [...official('0.19.3').libraries, { name: 'custom:library:1', url: 'https://example.com/' }],
    arguments: { game: ['--custom'], jvm: [...official('0.19.3').arguments.jvm, '-Duser.keep=yes'] }
  }
  fs.writeFileSync(file, JSON.stringify(original))
  if (inherited) {
    const base = path.join(folder, 'versions', '1.21.11'); fs.mkdirSync(base)
    fs.writeFileSync(path.join(base, '1.21.11.json'), JSON.stringify({ id: '1.21.11', mainClass: 'net.minecraft.client.main.Main', libraries: [{ name: 'vanilla:keep:1' }] }))
  }
  const data = path.join(shared ? folder : dir, 'mods'); fs.mkdirSync(data)
  fs.writeFileSync(path.join(data, 'keep.jar'), 'unchanged mod')
  const running = new Set<string>(), requests: string[] = [], tasks: any[] = []
  let external = false, download: () => Promise<void> = async () => {}, response = (v: string) => official(v)
  const exported = { exports: {} as any }, require = createRequire(path.resolve('package.json'))
  new Function('require', 'module', 'exports', 'fetch', await bundle)(
    (name: string) => name === 'electron' ? { app: { getPath: (n: string) => path.join(root, n), getVersion: () => 'test', getName: () => 'MiaoCL', isPackaged: false } }
      : name === 'launch-fixture' ? { getRunningVersionIds: () => running }
      : name === 'external-game-fixture' ? { externalGameUsesDirectory: async () => external }
      : name === 'download-fixture' ? { fetchSignal: () => undefined, downloadAll: async (t: any[]) => { tasks.push(...t); await download() } }
      : require(name), exported, exported.exports,
    async (url: string) => { requests.push(url); if (url.endsWith('/profile/json')) return Response.json(response(decodeURIComponent(url.split('/').at(-3)!))); return Response.json([{ loader: { version: '0.19.3' } }, { loader: { version: '0.18.4' } }]) }
  )
  const api = exported.exports as typeof import('../src/main/core/fabricLoader') & { getSettings: () => any }
  Object.assign(api.getSettings(), { gameDir: folder, activeFolder: folder, folders: [{ path: folder, isDefault: true }], mirror: 'official' })
  return { ...api, root, folder, dir, file, target: { id, folder }, original, running, requests, tasks, data,
    setDownload(fn: typeof download) { download = fn }, setResponse(fn: typeof response) { response = fn }, setExternal(value: boolean) { external = value },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}

for (const inherited of [false, true]) for (const shared of [false, true]) {
  test(`Fabric Loader downgrade/upgrade preserves ${inherited ? 'inherited' : 'flattened'} ${shared ? 'shared' : 'isolated'} instance`, async () => {
    const f = await fixture(inherited, shared)
    try {
      assert.deepEqual(await f.fabricLoaderChoices(f.target), { mcVersion: '1.21.11', currentVersion: '0.19.3', versions: ['0.19.3', '0.18.4'] })
      // A settings change during network work must not redirect the accepted instance/library target.
      f.setDownload(async () => { f.getSettings().activeFolder = path.join(f.root, 'other') })
      const result = await f.changeFabricLoader(f.target, '0.18.4')
      assert.deepEqual(JSON.parse(fs.readFileSync(result.backup, 'utf8')), JSON.parse(JSON.stringify(f.original)))
      let next = JSON.parse(fs.readFileSync(f.file, 'utf8'))
      for (const key of ['id', 'inheritsFrom', 'clientVersion', '_gameDir', '_javaPath', '_resolution', 'customField']) assert.deepEqual(next[key], f.original[key as keyof typeof f.original])
      assert.equal(next._loaderVersion, '0.18.4')
      assert.deepEqual(next.libraries.map((l: any) => l.name), [...official('0.18.4').libraries.map(l => l.name), 'custom:library:1'])
      assert.deepEqual(next.arguments, { game: ['--custom'], jvm: ['-Duser.keep=yes', ...official('0.18.4').arguments.jvm] })
      assert.equal(f.tasks[1].sha1, 'a'.repeat(40)); assert.equal(f.tasks[1].size, 100)
      assert(f.tasks.every(t => t.dest.startsWith(path.join(f.folder, 'libraries'))))
      assert.equal(fs.readFileSync(path.join(f.data, 'keep.jar'), 'utf8'), 'unchanged mod')
      await f.changeFabricLoader(f.target, '0.19.3')
      next = JSON.parse(fs.readFileSync(f.file, 'utf8'))
      assert.equal(next._loaderVersion, '0.19.3'); assert(!JSON.stringify(next.libraries).includes('0.18.4'))
      assert.equal((await f.fabricLoaderChoices(f.target)).currentVersion, '0.19.3')
    } finally { f.cleanup() }
  })
}

test('Loader failure, running sessions, and concurrent edits never replace the original profile', async () => {
  const f = await fixture()
  try {
    const bytes = fs.readFileSync(f.file)
    f.setDownload(async () => { throw Error('download failed') })
    await assert.rejects(f.changeFabricLoader(f.target, '0.18.4'), /download failed/)
    assert(fs.readFileSync(f.file).equals(bytes))
    f.setDownload(async () => { f.running.add(f.target.id) })
    await assert.rejects(f.changeFabricLoader(f.target, '0.18.4'), /运行|准备启动/)
    assert(fs.readFileSync(f.file).equals(bytes)); f.running.clear()
    f.setExternal(true)
    await assert.rejects(f.changeFabricLoader(f.target, '0.18.4'), /另一个启动器/); f.setExternal(false)
    f.setDownload(async () => { fs.writeFileSync(f.file, JSON.stringify({ ...f.original, customField: 'external edit' })) })
    await assert.rejects(f.changeFabricLoader(f.target, '0.18.4'), /配置发生变化/)
    assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).customField, 'external edit')
    assert(!fs.readdirSync(f.dir).some(n => n.endsWith('.bak') || n.endsWith('.tmp')))
  } finally { f.cleanup() }
})

test('Loader input/profile validation blocks invalid paths, unregistered folders and mismatched official metadata', async () => {
  const f = await fixture()
  try {
    await assert.rejects(f.changeFabricLoader(f.target, '../evil'), /版本号无效/)
    await assert.rejects(f.changeFabricLoader({ ...f.target, id: '../evil' }, '0.18.4'), /名称无效/)
    await assert.rejects(f.fabricLoaderChoices({ ...f.target, folder: f.root }), /尚未登记/)
    await assert.rejects(f.changeFabricLoader(f.target, '0.19.3'), /已经使用/)
    f.setResponse(v => ({ ...official(v), inheritsFrom: 'other-mc' }))
    await assert.rejects(f.changeFabricLoader(f.target, '0.18.4'), /不匹配/)
    f.setResponse(v => ({ ...official(v), libraries: [{ name: '../../evil:artifact:1', url: 'https://maven.fabricmc.net/' }, ...official(v).libraries] }))
    await assert.rejects(f.changeFabricLoader(f.target, '0.18.4'), /依赖配置无效/)
    assert.equal(f.tasks.length, 0)
    assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), JSON.parse(JSON.stringify(f.original)))
  } finally { f.cleanup() }
})

test('Loader dialog loads official choices, keeps failures open and retries the chosen instance/version', async () => {
  const result = await build({
    entryPoints: ['src/renderer/src/components/FabricLoaderModal.vue'], bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external',
    plugins: [{ name: 'modal-setup', setup(b) {
      b.onResolve({ filter: /^\.\.\/api$/ }, () => ({ path: 'api-fixture', external: true }))
      b.onResolve({ filter: /^@shared\/types$/ }, () => ({ path: path.resolve('src/shared/types.ts') }))
      b.onLoad({ filter: /\.vue$/ }, a => a.path.endsWith('FabricLoaderModal.vue')
        ? { contents: compileScript(parse(fs.readFileSync(a.path, 'utf8')).descriptor, { id: a.path }).content, loader: 'ts', resolveDir: path.dirname(a.path) }
        : { contents: 'export default {}', loader: 'js' })
    } }]
  })
  const requests: any[] = [], events: string[] = []
  let failedLoad = true, failedChange = true
  const previous = (globalThis as any).window
  ;(globalThis as any).window = { kamucl: { invoke: async (channel: string, ...args: any[]) => {
    requests.push([channel, ...args])
    if (channel === 'loaders:fabricChoices') {
      if (failedLoad) { failedLoad = false; throw Error('offline') }
      return { mcVersion: '1.21.11', currentVersion: '0.19.3', versions: ['0.19.3', '0.18.4'] }
    }
    if (failedChange) { failedChange = false; throw Error('正在运行') }
    return { backup: 'fixture.bak' }
  } } }
  const require = createRequire(path.resolve('package.json')), exported = { exports: {} as any }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    (name: string) => name === 'vue' ? { ...vue, onMounted: () => {}, onUnmounted: () => {} } : name === 'api-fixture' ? { errText: (e: Error) => e.message } : require(name), exported, exported.exports
  )
  const scope = vue.effectScope()
  try {
    const state = scope.run(() => exported.exports.default.setup({ source: { id: 'chosen', folder: 'chosen-folder' } }, { expose: () => {}, emit: (e: string) => events.push(e) }))
    await state.load(); assert.equal(state.error.value, 'offline')
    await state.load(); assert.equal(state.selected.value, '0.19.3'); assert.equal(state.options.value[0].label, '0.19.3（当前）')
    await state.apply(); assert(!requests.some(r => r[0] === 'loaders:fabricChange'))
    state.selected.value = '0.18.4'
    await state.apply(); assert.equal(state.error.value, '正在运行'); assert.equal(state.busy.value, false); assert.deepEqual(events, [])
    await state.apply(); assert.deepEqual(events, ['done', 'close'])
    assert.deepEqual(requests.at(-1), ['loaders:fabricChange', { id: 'chosen', folder: 'chosen-folder' }, '0.18.4'])
  } finally { scope.stop(); (globalThis as any).window = previous }
})
