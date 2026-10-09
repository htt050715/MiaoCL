import { BUILTIN_LAUNCH_IMAGES } from '@shared/launchImages'
import miaoclCat from './assets/launch/miaocl-cat.png'

const sources = { 'miaocl-cat.png': miaoclCat }
export const builtInLaunchImages = BUILTIN_LAUNCH_IMAGES.map(image => ({ ...image, src: sources[image.file] }))
