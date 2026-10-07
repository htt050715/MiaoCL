import { shallowRef, watch } from 'vue'
import { store } from './store'
import { skinRevision } from './skinRevision'
import { getLauncherIdentity } from './api'
import type { LauncherIdentity } from '@shared/launcherIdentity'
import avatar from './assets/splash-face.png'
import skin from './assets/htt-skin.png'
export const launcherIdentity = shallowRef<LauncherIdentity>({ accountId: null, username: 'HT_T', avatar, skin, variant: 'classic', fallback: true })
export function useLauncherIdentity() {
  let epoch = 0
  watch(() => [store.selectedAccount?.id, store.accounts.map(a => [a.id,a.uuid,a.username,a.type,a.providerId,a.apiRoot]), store.settings?.displayAccountId, skinRevision.value], async () => {
    const request = ++epoch
    // Keep the bundled identity visible while account textures are loading.
    launcherIdentity.value = { accountId: null, username: 'HT_T', avatar, skin, variant: 'classic', fallback: true }
    try { const next = await getLauncherIdentity(); if (request === epoch && next?.avatar && next.skin) launcherIdentity.value = next } catch { /* bundled HT_T appearance remains available offline */ }
  }, { immediate: true, deep: true })
  return launcherIdentity
}
