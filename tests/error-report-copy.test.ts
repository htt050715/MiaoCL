import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

test('error copying redacts credentials and diagnostic export proposes a MiaoCL ZIP', async () => {
  const stubs: Record<string, string> = {
    electron: `export const app={getVersion:()=>"1.1.34"}; export const clipboard={writeText:text=>fixture.copied=text}; export const dialog={showSaveDialog:async options=>{fixture.options=options;return {canceled:true}}}`,
    './accounts': `export const selectedAccount=()=>({accessToken:'known-secret-access',refreshToken:'known-secret-refresh',clientToken:'known-client-secret',loginIdentifier:'private@example.com'})`,
    './settings': 'export const getSettings=()=>({javaPath:""})',
    './paths': 'export const gameDir=()=>"/games"',
    './versions': 'export const listAllInstalled=()=>[];export const readVersionJson=()=>({})',
    './launch': 'export const getLastLaunch=()=>null',
    './folderPaths': 'export const samePath=(a,b)=>a===b',
    './javaScanUtils': 'export const JAVA_PROBE_VM_ARGS=[]',
    './exitHistory': 'export const exitHistory=()=>({list:()=>[]})',
    './instances': 'export const instanceDirectoryState=()=>({path:"/games",isolated:false})',
    './launcherLog': 'export const launcherLogPath=()=>"/logs/current.log"',
    './diagnosticArchive': 'export const writeDiagnosticArchive=async()=>{}'
  }
  const bundle = await build({
    entryPoints: ['src/main/core/exportLogs.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'isolated-report-services', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => args.importer.endsWith('exportLogs.ts') && stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined)
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
    } }]
  })
  const fixture = { copied: '', options: { defaultPath: '' } }, runtime = { exports: {} as any }
  new Function('require', 'module', 'exports', 'fixture', bundle.outputFiles[0].text)(createRequire(path.resolve('package.json')), runtime, runtime.exports, fixture)
  runtime.exports.copyErrorReport('启动失败\nknown-secret-access known-secret-refresh known-client-secret private@example.com\n--accessToken other-token\nC:\\Users\\PrivateUser\\game')
  assert.match(fixture.copied, /^MiaoCL 1\.1\.34 错误报告/)
  assert.match(fixture.copied, /启动失败/)
  for (const secret of ['known-secret', 'known-client-secret', 'private@example.com', 'other-token', 'PrivateUser']) assert(!fixture.copied.includes(secret))
  const previous = fixture.copied
  assert.throws(() => runtime.exports.copyErrorReport('  '), /暂无/)
  assert.equal(fixture.copied, previous)
  assert.equal(await runtime.exports.exportLaunchLogs(null, '1.21.11'), null)
  assert.match(fixture.options.defaultPath, /^MiaoCL-Diagnostic-1\.21\.11-\d{8}-\d{6}\.zip$/)
})
