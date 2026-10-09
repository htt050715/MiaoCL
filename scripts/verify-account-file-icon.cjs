// Exercise real Windows icon replacement on isolated EXE copies. Never touches
// the user's launcher or Minecraft directories.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const assert = require('node:assert/strict'), crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const R = require('resedit')
const { version } = require('../package.json')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'MiaoCL avatar icon-'))
const originalFile = path.resolve(process.argv[2] || `release/MiaoCL-${version}.exe`)
const target = path.join(root, '账号头像测试.exe'), result = path.join(root, 'icon.result')
const helper = path.resolve('out/main/AvatarFileIcon.exe')
fs.copyFileSync(originalFile, target)
const original = fs.readFileSync(target), hash = b => crypto.createHash('sha256').update(b).digest('hex')
function icons(bytes) {
  return R.NtExecutableResource.from(R.NtExecutable.from(bytes)).entries.filter(e => e.type === 3)
}
function apply(png, expectedVersion = version) {
  const run = spawnSync(helper, ['--apply', target, path.resolve(png), expectedVersion, result], { windowsHide: true, timeout: 75000 })
  assert.ifError(run.error)
  return { code: run.status, text: fs.readFileSync(result, 'utf8') }
}
assert.equal(icons(original).length, 7)
assert.deepEqual(apply('src/renderer/src/assets/htt-skin.png'), { code: 0, text: 'updated' })
const updated = fs.readFileSync(target), originals = icons(original), replacements = icons(updated)
assert.equal(updated.length, original.length, 'PE and NSIS layout must remain identical')
assert.notEqual(hash(updated), hash(original))
const untouchedOriginal = Buffer.from(original), untouchedUpdated = Buffer.from(updated)
for (let i = 0; i < originals.length; i++) {
  const before = Buffer.from(originals[i].bin), after = Buffer.from(replacements[i].bin)
  assert.notEqual(hash(before), hash(after), 'Every Explorer icon size must update')
  assert.equal(before.length, after.length)
  assert.deepEqual(after.subarray(0, 40), before.subarray(0, 40), 'DIB layout must not change')
  const offset = original.indexOf(before)
  assert(offset >= 0 && original.indexOf(before, offset + 1) < 0, 'Icon slot must be unambiguous')
  untouchedOriginal.fill(0, offset, offset + before.length)
  untouchedUpdated.fill(0, offset, offset + after.length)
}
assert.deepEqual(untouchedUpdated, untouchedOriginal, 'Only RT_ICON pixel data may change; preserve NSIS payload, version and PE metadata')
assert.deepEqual(apply('src/renderer/src/assets/htt-skin.png'), { code: 0, text: 'unchanged' })
assert.deepEqual(apply('src/renderer/src/assets/splash-face.png'), { code: 0, text: 'updated' })
assert.equal(hash(fs.readFileSync(target)), hash(original), 'Returning to the default avatar restores every byte')
assert.equal(apply('src/renderer/src/assets/htt-skin.png', '0.0.0').code, 1, 'Do not overwrite an updated launcher')
assert.equal(hash(fs.readFileSync(target)), hash(original))
// The modified self-extractor must still cold/warm start and reuse its cache.
apply('src/renderer/src/assets/htt-skin.png')
const startup = spawnSync(process.execPath, ['scripts/verify-portable-startup.cjs', target], { windowsHide: true, encoding: 'utf8', timeout: 180000 })
assert.ifError(startup.error); assert.equal(startup.status, 0, startup.stderr)
const proof = JSON.parse(startup.stdout)
assert(proof.pass)
console.log(JSON.stringify({ pass: true, version, root, iconSizes: originals.length, onlyIconPixelsChanged: true, preservedSelfExtractor: true, defaultRestoredExactly: true, rejectsReplacedVersion: true, startup: proof.results }))
