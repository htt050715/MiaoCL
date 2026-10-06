const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'..')
const file=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(file,'utf8'))
pkg.name='miaocl';pkg.productName='MiaoCL';pkg.version='1.1.17';pkg.homepage='https://github.com/htt050715/MiaoCL'
pkg.description='MiaoCL - Minecraft 启动器与客户端参数管理'
pkg.build.productName='MiaoCL';pkg.build.appId='cn.htt.miaocl.launcher';pkg.build.win.artifactName='MiaoCL-${version}-windows-${arch}.${ext}';pkg.build.portable.artifactName='MiaoCL-${version}.exe'
fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n')
const lockFile=path.join(root,'package-lock.json'),lock=JSON.parse(fs.readFileSync(lockFile,'utf8'));lock.name=pkg.name;lock.version=pkg.version;lock.packages[''].name=pkg.name;lock.packages[''].version=pkg.version
fs.writeFileSync(lockFile,JSON.stringify(lock,null,2)+'\n')
