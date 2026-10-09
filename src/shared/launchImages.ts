/** Stable keys keep image selection and timing independent of bundled asset hashes. */
export const BUILTIN_LAUNCH_IMAGES = [
  { key: 'builtin:miaocl-cat', title: '猫瓜猫瓜猫？', file: 'miaocl-cat.png' }
] as const

export function isBuiltinLaunchImage(key: string): boolean {
  return BUILTIN_LAUNCH_IMAGES.some(image => image.key === key)
}
