import type { Account, SkinVariant } from './types'

export interface LauncherIdentity {
  accountId: string | null
  username: string
  skin: string
  avatar: string
  variant: SkinVariant
  cape?: string
  fallback: boolean
}

/** A missing pinned account follows the gameplay account again. */
export function displayAccount(accounts: Account[], current: Account | null, pinned?: string): Account | null {
  return accounts.find(account => account.id === pinned) ?? current ?? null
}

/** Composite the hat layer and enlarge with nearest-neighbour pixels. */
export function skinHeadBitmap(bitmap: Uint8Array, width: number, height: number, size = 32): Uint8Array {
  if (width < 64 || width % 64 !== 0 || ![width, width / 2].includes(height) || bitmap.length !== width * height * 4) throw new Error('无效的皮肤纹理尺寸')
  const out = new Uint8Array(size * size * 4), unit = width / 64
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.floor(x * 8 * unit / size), sy = Math.floor(y * 8 * unit / size)
    const base = ((8 * unit + sy) * width + 8 * unit + sx) * 4
    const hat = ((8 * unit + sy) * width + 40 * unit + sx) * 4
    const at = (y * size + x) * 4, a = bitmap[hat + 3] / 255, b = bitmap[base + 3] / 255, alpha = a + b * (1 - a)
    for (let channel = 0; channel < 3; channel++) out[at + channel] = alpha ? Math.round((bitmap[hat + channel] * a + bitmap[base + channel] * b * (1 - a)) / alpha) : 0
    out[at + 3] = Math.round(alpha * 255)
  }
  return out
}
