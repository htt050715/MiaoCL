import { app, nativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { logScope } from './launcherLog'

const log = logScope('account-icon')
let prepared: { target: string; png: string; report: string } | undefined
let currentAvatar = ''
let hooked = false
let workerRunning = false

function startWorker(): void {
  if (!prepared || workerRunning) return
  const job = prepared
  const helper = path.join(__dirname, 'AvatarFileIcon.exe').replace('app.asar', 'app.asar.unpacked')
  try {
    workerRunning = true
    const child = spawn(helper, ['--apply', job.target, job.png, app.getVersion(), job.report], {
      detached: true, windowsHide: true, stdio: 'ignore'
    })
    child.on('error', error => { workerRunning = false; log.warn('头像文件图标更新未启动', error) })
    child.on('exit', () => { workerRunning = false })
    child.unref()
  } catch (error) { workerRunning = false; log.warn('头像文件图标更新未启动', error) }
}

/** The loaded portable wrapper is locked. Apply its last chosen avatar only
 * after Electron exits; the helper waits for the wrapper without killing it. */
export function prepareAvatarFileIcon(avatar: string): void {
  if (process.platform !== 'win32' || !app.isPackaged || avatar === currentAvatar) return
  const portable = process.env.PORTABLE_EXECUTABLE_FILE
  if (!portable || !path.isAbsolute(portable) || path.extname(portable).toLowerCase() !== '.exe') return
  try {
    const target = fs.realpathSync(portable)
    if (!fs.statSync(target).isFile()) return
    const image = nativeImage.createFromDataURL(avatar)
    if (image.isEmpty()) return
    const directory = path.join(app.getPath('userData'), 'account-icons')
    fs.mkdirSync(directory, { recursive: true })
    const key = crypto.createHash('sha256').update(target.toLowerCase()).digest('hex').slice(0, 24)
    const png = path.join(directory, key + '.png'), temp = png + '.tmp'
    fs.writeFileSync(temp, image.toPNG())
    fs.renameSync(temp, png)
    prepared = { target, png, report: path.join(directory, key + '.result') }
    currentAvatar = avatar
    // Start waiting immediately. The helper retries while the portable wrapper
    // still owns the EXE, then updates it as soon as Windows releases the lock.
    startWorker()
    if (!hooked) {
      hooked = true
      // quit fires only after all cancellable close/unsaved-change handlers.
      app.once('quit', () => {
        startWorker()
      })
    }
  } catch (error) { log.warn('头像文件图标暂不可更新', error) }
}
