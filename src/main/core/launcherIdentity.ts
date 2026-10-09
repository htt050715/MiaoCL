import { app, nativeImage, type BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { listAccounts, selectedAccountPublic } from './accounts'
import { getSettings } from './settings'
import { getProfile } from './skins'
import { displayAccount, skinHeadBitmap, type LauncherIdentity } from '../../shared/launcherIdentity'
import { prepareAvatarFileIcon } from './avatarFileIcon'

let window: BrowserWindow | null = null
let applied = ''
let requestedKey = ''
const pending = new Map<string, Promise<LauncherIdentity>>()
const assets = () => path.join(__dirname, 'identity-assets')
function fallback(): LauncherIdentity {
  return { accountId: null, username: 'HT_T', skin: 'data:image/png;base64,' + fs.readFileSync(path.join(assets(), 'htt-skin.png')).toString('base64'), avatar: nativeImage.createFromPath(path.join(assets(), 'htt-avatar.png')).toDataURL(), variant: 'classic', fallback: true }
}
const chosen = () => displayAccount(listAccounts(), selectedAccountPublic(), getSettings().displayAccountId)
const keyOf = () => { const account = chosen(); return account ? JSON.stringify([account.id, account.uuid, account.type, account.username, account.providerId, account.apiRoot]) : 'HT_T' }
function apply(identity: LauncherIdentity) {
  if (applied === identity.avatar || !window || window.isDestroyed()) return
  const image = nativeImage.createFromDataURL(identity.avatar)
  if (image.isEmpty()) return
  if (process.platform === 'darwin') app.dock?.setIcon(image)
  else window.setIcon(image)
  applied = identity.avatar
}
export function attachIdentityWindow(next: BrowserWindow) {
  window = next; applied = ''; apply(fallback())
  void readLauncherIdentity().catch(() => {})
}
export async function readLauncherIdentity(): Promise<LauncherIdentity> {
  const key = keyOf(), account = chosen()
  if (key !== requestedKey) { requestedKey = key; apply(fallback()) }
  let work = pending.get(key)
  if (!work) {
    work = (async () => {
      const base = fallback()
      if (!account) return base
      try {
        const profile = await getProfile(false, account.id)
        const skin = profile.skins.find(s => s.state === 'ACTIVE' && s.dataUrl) ?? profile.skins.find(s => s.dataUrl)
        if (!skin?.dataUrl) return { ...base, accountId: account.id, username: account.username }
        const image = nativeImage.createFromDataURL(skin.dataUrl), { width, height } = image.getSize()
        const avatar = nativeImage.createFromBitmap(Buffer.from(skinHeadBitmap(image.toBitmap(), width, height)), { width: 32, height: 32 }).toDataURL()
        return { accountId: account.id, username: profile.username || account.username, skin: skin.dataUrl, avatar, variant: skin.variant, cape: profile.capes.find(c => c.active)?.dataUrl, fallback: false }
      } catch { return { ...base, accountId: account.id, username: account.username } }
    })()
    pending.set(key, work)
    void work.finally(() => { if (pending.get(key) === work) pending.delete(key) })
  }
  const identity = await work
  // A late profile fetch cannot replace the icon of a newer account selection.
  if (key !== keyOf()) return readLauncherIdentity()
  apply(identity)
  prepareAvatarFileIcon(identity.avatar)
  return identity
}
