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
    if (!hooked) {
      hooked = true
      // quit fires only after all cancellable close/unsaved-change handlers.
      app.once('quit', () => {
        if (!prepared) return
        const helper = path.join(__dirname, 'AvatarFileIcon.exe').replace('app.asar', 'app.asar.unpacked')
        try {
          const child = spawn(helper, ['--apply', prepared.target, prepared.png, app.getVersion(), prepared.report], {
            detached: true, windowsHide: true, stdio: 'ignore'
          })
          child.on('error', error => log.warn('头像文件图标更新未启动', error))
          child.unref()
        } catch (error) { log.warn('头像文件图标更新未启动', error) }
      })
    }
  } catch (error) { log.warn('头像文件图标暂不可更新', error) }
}
