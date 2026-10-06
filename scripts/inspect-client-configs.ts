import fs from 'node:fs'
import path from 'node:path'
import {readTypedNbt} from '../src/main/core/typedNbt'
const dir = process.argv[2]
for (const file of ['slimefunhelper/config/HTT106.nbt','slimefunhelper/internal/friends.nbt','meteor-client/modules.nbt']) {
  const {root} = readTypedNbt(fs.readFileSync(path.join(dir,file)))
  function shape(tag:any,depth=0):any {
    if (tag.type===10) return Object.fromEntries(Object.entries(tag.value).slice(0,depth ? 5 : 20).map(([k,v])=>[k,depth<2?shape(v,depth+1):(v as any).type]))
    if (tag.type===9) return {type:9,elementType:tag.elementType,length:tag.value.length,first:depth<3&&tag.value[0]?shape(tag.value[0],depth+1):undefined}
    return {type:tag.type}
  }
  console.log(file,JSON.stringify(shape(root)))
}
