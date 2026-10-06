// Run through verify-compact-windows-ui.cjs to test a copy of the final runtime.
// A packaged executable with resources/app.asar ignores the script argument.
// All settings, games, log output and windows belong to the test.
const { app, session } = require('electron')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const assert = require('node:assert/strict'), { createRequire } = require('node:module')
const { Worker } = require('node:worker_threads')
const archive = path.resolve(process.argv[2] || 'release/win-unpacked/resources/app.asar')
const packedRequire = createRequire(path.join(archive, 'package.json'))
const version = packedRequire('./package.json').version
const productName = packedRequire('./package.json').productName || 'KAMUCL'
const compact = !fs.existsSync(path.join(path.dirname(process.execPath), 'dxcompiler.dll'))
const mode = process.env.KAMUCL_TEST_SOFTWARE === '1' ? 'software' : 'hardware'
if (mode === 'software') {
  app.commandLine.appendSwitch('use-angle', 'swiftshader')
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'KAMUCL packaged UI '))
const games = path.join(root, 'games'); fs.mkdirSync(games)
const instance=path.join(games,'versions','config-test');fs.mkdirSync(instance,{recursive:true})
fs.writeFileSync(path.join(instance,'config-test.json'),JSON.stringify({id:'config-test',_gameDir:true,type:'release',mainClass:'net.minecraft.client.main.Main',libraries:[],assets:'test',arguments:{game:[],jvm:[]}}))
fs.writeFileSync(path.join(instance,'config-test.jar'),Buffer.alloc(0))
const slime=path.join(instance,'slimefunhelper','runtime');fs.mkdirSync(slime,{recursive:true})
fs.copyFileSync('tests/fixtures/slimefun-localization-combat.yml',path.join(slime,'combat.yml'))
const meteor=path.join(instance,'meteor-client');fs.mkdirSync(meteor)
const str=s=>{const b=Buffer.from(s),h=Buffer.alloc(2);h.writeUInt16BE(b.length);return Buffer.concat([h,b])}
const named=(type,key,value)=>Buffer.concat([Buffer.from([type]),str(key),value])
const compound=children=>Buffer.concat([...children,Buffer.from([0])])
const number=Buffer.alloc(8);number.writeDoubleBE(2)
const settingTag=(name,type,value)=>compound([named(8,'name',str(name)),named(type,'value',value)])
const list=items=>{const h=Buffer.alloc(5);h[0]=10;h.writeInt32BE(items.length,1);return Buffer.concat([h,...items])}
const int=n=>{const b=Buffer.alloc(4);b.writeInt32BE(n);return b}
const stringList=items=>{const h=Buffer.alloc(5);h[0]=8;h.writeInt32BE(items.length,1);return Buffer.concat([h,...items.map(str)])}
const color=compound([named(3,'r',int(20)),named(3,'g',int(40)),named(3,'b',int(60)),named(3,'a',int(123)),named(1,'rainbow',Buffer.from([0]))])
const group=compound([named(8,'name',str('General')),named(9,'settings',list([settingTag('speed',6,number),settingTag('mode',8,str('Abilities')),settingTag('vertical-speed-match',1,Buffer.from([0])),settingTag('fixture-color',10,color),settingTag('fixture-list',9,stringList(['minecraft:stone']))]))])
const keybind=compound([named(1,'isKey',Buffer.from([1])),named(3,'value',int(-1)),named(3,'modifiers',int(0))])
const moduleTag=compound([named(8,'name',str('flight')),named(1,'active',Buffer.from([0])),named(10,'keybind',keybind),named(1,'chatFeedback',Buffer.from([1])),named(10,'settings',compound([named(9,'groups',list([group]))]))])
const second=compound([named(8,'name',str('kill-aura')),named(1,'active',Buffer.from([0])),named(10,'settings',compound([named(9,'groups',list([]))]))])
fs.writeFileSync(path.join(meteor,'modules.nbt'),named(10,'',compound([named(9,'modules',list([moduleTag,second]))])))
const fixtureMods=path.join(instance,'mods');fs.mkdirSync(fixtureMods)
const translationZip=new (require('adm-zip'))()
translationZip.addFile('assets/yalu/lang/zh_cn.json',Buffer.from(JSON.stringify({'Module.Meteor.flight':'飞行','Module.Meteor.kill-aura':'杀戮光环','Setting.Meteor.speed':'速度','Setting.Meteor.speed.Description':'调整飞行速度','Setting.Meteor.mode':'模式','Setting.Meteor.vertical-speed-match':'垂直速度匹配','Setting.Meteor.fixture-color':'示例颜色','Setting.Meteor.fixture-list':'示例列表','Enum.Meteor.Mode.Abilities':'能力飞行','Enum.Meteor.Mode.Velocity':'速度飞行','Category.Meteor.Movement':'移动','Category.Meteor.Combat':'战斗'})))
translationZip.writeZip(path.join(fixtureMods,'i18n-fixture.jar'))
app.setPath('userData', root)
app.setPath('appData', root)
fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ theme: 'transparent', autoUpdate: false,
  gameDir: games, activeFolder: games, folders: [{ path: games, isDefault: true }], startupAnimation: false }))
const report = { version, root, electron: process.versions.electron, compact, mode }
const wait = ms => new Promise(r => setTimeout(r, ms))
const deadline = setTimeout(() => { console.error('Packaged UI timed out', root); app.exit(2) }, 60000)
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_request, callback) => callback({ cancel: true }))
})
app.on('browser-window-created', (_event, window) => {
  if(process.env.MIAOCL_UI_VISIBLE!=='1'){window.show = () => {}; window.showInactive = () => {}}
  if (window.getTitle() !== productName) return
  window.webContents.on('console-message',(_event,level,message)=>{if(level>=2)console.log('Renderer',message)})
  window.webContents.once('did-finish-load', async () => {
    try {
      let ui
      for (let i = 0; i < 100; i++) {
        ui = await window.webContents.executeJavaScript(`(()=>{const canvas=document.querySelector('.viewer3d canvas'),gl=canvas?.getContext('webgl2');return {text:document.body.innerText,images:[...document.images].filter(i=>i.src&&!i.src.startsWith('http')).map(i=>({src:i.src,ok:i.complete&&i.naturalWidth>0})),skin:gl&&!gl.isContextLost(),platform:document.documentElement.dataset.platform}})()`)
        if (ui.text.includes(version) && ui.text.includes('首页') && ui.skin) break
        await wait(200)
      }
      assert(ui.text.includes(version) && ui.text.includes('首页'), 'Main UI/version missing')
      assert(ui.skin, 'Packaged WebGL skin preview unavailable')
      assert.equal(ui.platform, 'win32')
      assert(ui.images.every(i => i.ok), 'Local image failed to load')
      const settings = await window.webContents.executeJavaScript("window.kamucl.invoke('settings:get')")
      assert.equal(settings.gameDir, games, 'IPC used another profile')
      assert.equal(settings.playerSkinLogo,false,'Player skin logo must be disabled by default')
      assert(ui.text.includes('爱来自HTT~')&&ui.text.includes('梦珞大人举世无双！'),'Custom branding missing')
      const koffi = packedRequire('koffi')
      assert.equal(koffi.load('kernel32.dll').func('uint32_t __stdcall GetCurrentProcessId()')(), process.pid)
      assert.equal(typeof packedRequire('undici').fetch, 'function')
      const Zip = packedRequire('adm-zip'), zip = new Zip()
      zip.addFile('fabric.mod.json', Buffer.from('{"id":"package_test","name":"Package test","version":"1"}'))
      const mods = path.join(root, 'mods'); fs.mkdirSync(mods); zip.writeZip(path.join(mods, 'test.jar'))
      const scan = await new Promise((resolve, reject) => {
        const worker = new Worker(path.join(archive, 'out/main/modScanWorker.cjs'), { workerData: { dir: mods, hash: true } })
        worker.once('message', message => { worker.terminate(); resolve(message) }); worker.once('error', reject)
      })
      assert(!scan.error, scan.error); assert.equal(scan.result[0].id, 'package_test'); assert.equal(scan.result[0].sha1.length, 40)
      report.ui = { skin: ui.skin, localImages: ui.images.length, ipc: true, nativeModule: true, worker: true }
      report.gpu = app.getGPUFeatureStatus()
      report.renderer = await window.webContents.executeJavaScript(`(()=>{const gl=document.querySelector('.viewer3d canvas').getContext('webgl2');return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)})()`)
      assert.equal(/swiftshader|software/i.test(report.renderer), mode === 'software', 'Wrong WebGL backend')
      if (compact) {
        assert(app.commandLine.getSwitchValue('disable-features').split(',').includes('WebGPUService'))
        assert(app.commandLine.hasSwitch('disable-skia-graphite'))
        assert.notEqual(report.gpu.webgpu, 'enabled', 'Compact runtime must not advertise enabled WebGPU')
        assert.equal(await window.webContents.executeJavaScript('navigator.gpu ? navigator.gpu.requestAdapter().then(a => a === null) : true'), true, 'DXC-dependent WebGPU adapter available')
      }
      if (mode === 'hardware') assert.equal(report.gpu.gpu_compositing, 'enabled', 'GPU compositing disabled')
      fs.writeFileSync(path.join(root, 'main.png'), (await window.webContents.capturePage()).toPNG())
      if (productName === 'MiaoCL') {
        await window.webContents.executeJavaScript(`document.querySelector('[data-nav="resources"]').click()`)
        await wait(300)
        await window.webContents.executeJavaScript(`document.querySelector('[data-nav="bridge"]').click()`)
        for(let i=0;i<40;i++){if(await window.webContents.executeJavaScript("!!document.querySelector('[data-open-client-configs]')"))break;await wait(100)}
        assert(await window.webContents.executeJavaScript("!document.querySelector('.client-configs')"),'Config editor is still embedded in bridge page')
        await window.webContents.executeJavaScript("document.querySelector('[data-open-client-configs]').click()")
        let panel
        for (let i = 0; i < 40; i++) {
          panel = await window.webContents.executeJavaScript(`document.querySelector('.client-configs')?.innerText || ''`)
          if (panel.includes('客户端参数管理')) break
          await wait(100)
        }
        assert(panel.includes('客户端参数管理') && panel.includes('SlimefunHelper'), 'Client config panel did not mount')
        const js=async code=>{try{return await window.webContents.executeJavaScript(code)}catch(e){console.log('Failed UI action',code,'Panel',await window.webContents.executeJavaScript("document.querySelector('.client-configs')?.innerText"));throw e}}
        for(let i=0;i<70;i++){if(await js("!!document.querySelector('.feature-parameters input[type=number]')"))break;await wait(150)}
        const opened=await js("!!document.querySelector('.feature-parameters input[type=number]')")
        if(!opened){console.log('Config diagnostics',await js("document.querySelector('.client-configs').innerText"));fs.writeFileSync('out/config-ui-failure.png',(await window.webContents.capturePage()).toPNG())}
        assert(opened,'Slimefun settings did not open automatically')
        await js("(()=>{const input=document.querySelector('.feature-parameters input[type=number]');input.value='7';input.dispatchEvent(new Event('input',{bubbles:true}));})()")
        await wait(150)
        await js("[...document.querySelectorAll('.config-editor button')].find(b=>b.textContent.includes('保存 1 个文件')).click()")
        await wait(150)
        assert(await js("document.querySelector('.config-save-modal').innerText.includes('立即保存并在游戏内热重载')"),'Hot save is unavailable')
        await js("[...document.querySelectorAll('.config-save-modal button')].find(b=>b.textContent.includes('立即保存')).click()")
        for(let i=0;i<70;i++){if(fs.readFileSync(path.join(slime,'combat.yml'),'utf8').includes('speed: 7'))break;await wait(150)}
        assert.match(fs.readFileSync(path.join(slime,'combat.yml'),'utf8'),/speed: 7/)
        for(let i=0;i<70;i++){if(await js("!document.querySelector('.config-save-modal')&&!document.querySelector('.client-configs .config-toolbar .select-menu-btn').disabled"))break;await wait(100)}
        await js("[...document.querySelectorAll('.feature-row')].find(b=>b.textContent.includes('spear-module')).click()")
        await wait(150)
        const spearText=await js("document.querySelector('.settings-panel').innerText")
        assert(spearText.includes('长矛工具: 自动重启')&&spearText.includes('长矛速度视角重置: 快捷键'),'Concrete spear translations missing')
        assert(spearText.includes('则自动重新使用'),'Chinese source tooltip missing')
        assert.equal(await js("document.querySelectorAll('.settings-panel .click-setting').length"),18,'Spear fields missing')
        assert(await js("[...document.querySelectorAll('.settings-panel .click-setting-copy strong')].every(s=>/[\u4e00-\u9fff]/.test(s.textContent))"),'Spear parameter title still English')
        await js("document.querySelector('.feature-parameters').scrollIntoView({block:'start'})")
        await js("[...document.querySelectorAll('.feature-row')].find(b=>b.textContent.includes('att-bot')).click()")
        await wait(100)
        assert(await js("document.querySelector('.group-tabs').innerText.includes('暴击')"),'Nested Chinese group missing')
        await js("document.querySelector('.settings-panel .select-menu-btn').click()")
        await wait(100)
        const option=await js("(()=>{const b=[...document.querySelectorAll('.select-menu-option')].find(b=>b.textContent.includes('Grim平地'));if(!b)return false;b.click();return true})()")
        assert(option,'Translated concrete enum options missing')
        await wait(100)
        await js("[...document.querySelectorAll('.feature-row')].find(b=>b.textContent.includes('attack')&&!b.textContent.includes('att-bot')).click()")
        await wait(100)
        assert(await js("document.querySelector('.settings-panel').innerText.includes('历史采样长度')"),'Encoded inner field translation missing')
        const modeButton="[...document.querySelectorAll('.settings-panel .config-leaf')].find(r=>r.innerText.includes('预测模式')).querySelector('.select-menu-btn')"
        await js(modeButton+'.click()');await wait(100)
        const encodedChoices=await js("[...document.querySelectorAll('.select-menu-float')].map(e=>e.innerText).join(' | ')")
        assert(encodedChoices.includes('NV预测器'),'Encoded enum translation missing: '+encodedChoices)
        await js("[...document.querySelectorAll('.select-menu-option')].find(b=>b.textContent.includes('线性')).click()")
        await wait(150)
        await js("[...document.querySelectorAll('.config-editor button')].find(b=>b.textContent.includes('保存 1 个文件')).click()")
        await wait(100);await js("[...document.querySelectorAll('.config-save-modal button')].find(b=>b.textContent.includes('立即保存')).click()")
        for(let i=0;i<70;i++){if(await js("!document.querySelector('.config-save-modal')&&!document.querySelector('.client-configs .config-toolbar .select-menu-btn').disabled"))break;await wait(100)}
        const savedSlime=fs.readFileSync(path.join(slime,'combat.yml'),'utf8')
        assert(savedSlime.includes('enum:critical_mode:GRIM_GROUND_SIMULATION'),'Translated enum did not preserve raw constant')
        const savedSlimeObject=packedRequire('yaml').parse(savedSlime)
        assert(savedSlimeObject.attack['attack-predict-argument'].includes('"mode":"LINEAR"'),'Encoded mode did not persist raw constant')
        assert(savedSlimeObject.attack['attack-predict-argument'].includes('2d'),'Encoded numeric type changed')
        assert.equal(savedSlimeObject.attack.speed,7)
        report.ui.slimefunLocalization={spearSettings:18,sourceTooltip:true,nestedGroup:true,enumValuesPreserved:true,encodedFields:true}
        await js("document.querySelector('.client-configs .config-toolbar .select-menu-btn').click()")
        await wait(100);await js("[...document.querySelectorAll('.select-menu-option')].find(b=>b.textContent.includes('Meteor / Baritone')).click()")
        for(let i=0;i<70;i++){if(await js("!!document.querySelector('.feature-title .switch input')"))break;await wait(150)}
        assert(await js("document.querySelector('.feature-parameters').innerText.includes('速度')"),'Meteor concrete parameter missing')
        assert(await js("document.querySelector('.category-list').innerText.includes('移动')&&document.querySelector('.category-list').innerText.includes('战斗')"),'Meteor categories missing')
        await js("[...document.querySelectorAll('.category-row')].find(b=>b.textContent.includes('战斗')).click()")
        await wait(100)
        assert(await js("document.querySelectorAll('.feature-row').length===1&&document.querySelector('.feature-list').innerText.includes('杀戮光环')"),'Category did not filter modules')
        await js("[...document.querySelectorAll('.category-row')].find(b=>b.textContent.includes('移动')).click()")
        await wait(100)
        assert(await js("document.querySelector('.settings-panel').innerText.includes('调整飞行速度')"),'Installed I18n setting description missing')
        assert(await js("!!document.querySelector('.settings-panel input[type=range]')"),'ClickGUI slider unavailable offline')
        await js("document.querySelector('.settings-panel .select-menu-btn').click()")
        await wait(100)
        const meteorChoices=await js("[...document.querySelectorAll('.select-menu-float')].map(e=>e.innerText).join(' | ')")
        assert(meteorChoices.includes('速度飞行'),'Meteor enum translation missing: '+meteorChoices)
        await js("[...document.querySelectorAll('.select-menu-option')].find(b=>b.textContent.includes('速度飞行')).click()")
        await js("(()=>{const c=document.querySelector('.meteor-color-control input[type=color]');c.value='#336699';c.dispatchEvent(new Event('input',{bubbles:true}));const a=document.querySelector('.meteor-color-control input[type=range]');a.value='77';a.dispatchEvent(new Event('input',{bubbles:true}));})()")
        await js("(()=>{const n=document.querySelector('.list-add input');n.value='minecraft:dirt';n.dispatchEvent(new Event('input',{bubbles:true}));})()")
        await wait(100);await js("document.querySelector('.list-add button').click()")
        await js("[...document.querySelectorAll('.group-tab')].find(b=>b.textContent.includes('模块与快捷键')).click()")
        await wait(100)
        await js("(()=>{const b=document.querySelector('.meteor-key-control button');b.click();b.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyG',key:'g',ctrlKey:true,bubbles:true}));})()")
        await js("[...document.querySelectorAll('.group-tab')].find(b=>b.textContent.includes('常规')).click()")
        await wait(100)
        await js("(()=>{const input=document.querySelector('.feature-title .switch input');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));const n=document.querySelector('.feature-parameters input[type=number]');n.value='9';n.dispatchEvent(new Event('input',{bubbles:true}));})()")
        await js("document.querySelector('[data-nav=bridge]').click()")
        for(let i=0;i<40;i++){if(await js("!!document.querySelector('[data-open-client-configs]')"))break;await wait(100)}
        await js("document.querySelector('[data-open-client-configs]').click()")
        for(let i=0;i<40;i++){if(await js("!!document.querySelector('.feature-parameters input[type=number]')"))break;await wait(100)}
        assert(await js("document.querySelector('.feature-parameters input[type=number]').value==='9'"),'Navigating away lost unsaved draft')
        await wait(150);await js("[...document.querySelectorAll('.config-editor button')].find(b=>b.textContent.includes('保存 1 个文件')).click()")
        await wait(100);await js("[...document.querySelectorAll('.config-save-modal button')].find(b=>b.textContent.includes('立即保存')).click()")
        for(let i=0;i<70;i++){if(await js("!document.querySelector('.config-save-modal')&&!document.querySelector('.client-configs .config-toolbar .select-menu-btn').disabled"))break;await wait(100)}
        const doc=await js(`window.kamucl.invoke('client-configs:read','config-test',${JSON.stringify(games)},'meteor-client/modules.nbt')`)
        const fields=doc.root.children.find(c=>c.key==='modules').node.children[0].node.children
        assert.equal(fields.find(c=>c.key==='active').node.value,1,'Module switch did not persist')
        const savedSettings=fields.find(c=>c.key==='settings').node.children.find(c=>c.key==='groups').node.children[0].node.children.find(c=>c.key==='settings').node.children[0].node.children
        assert.equal(savedSettings.find(c=>c.key==='value').node.value,9,'Concrete module parameter did not persist')
        const groupSettings=fields.find(c=>c.key==='settings').node.children.find(c=>c.key==='groups').node.children[0].node.children.find(c=>c.key==='settings').node.children
        const settingValue=name=>groupSettings.find(s=>s.node.children.find(c=>c.key==='name').node.value===name).node.children.find(c=>c.key==='value').node
        assert.equal(settingValue('mode').value,'Velocity','Enum saved Chinese label')
        const colorFields=Object.fromEntries(settingValue('fixture-color').children.map(c=>[c.key,c.node.value]))
        assert.deepEqual(colorFields,{r:51,g:102,b:153,a:77,rainbow:0},'Color/alpha NBT did not persist')
        assert.deepEqual(settingValue('fixture-list').children.map(c=>c.node.value),['minecraft:stone','minecraft:dirt'])
        const bindingFields=Object.fromEntries(fields.find(c=>c.key==='keybind').node.children.map(c=>[c.key,c.node.value]))
        assert.deepEqual(bindingFields,{isKey:1,value:71,modifiers:2},'Keyboard/modifier binding did not persist')
        report.ui.meteorWorkspace={separatePage:true,categories:true,installedChinese:true,slider:true,enum:true,colorAlpha:true,keybind:true,list:true,draftPreserved:true}

        for(let i=0;i<70;i++){if(await js("!!document.querySelector('.feature-parameters input[type=number]')&&!document.querySelector('.client-configs').innerText.includes('正在读取完整配置')"))break;await wait(100)}
        assert(await js("document.querySelector('.feature-parameters input[type=number]').value==='9'"),'Meteor parameter did not reload')
        report.ui.configEditing={slimefun:true,meteor:true,hotSaveChoice:true,moduleToggle:true,liveGameHotReload:false}
        report.ui.clientConfigsPanel = true
        await js("document.querySelector('.feature-parameters').scrollIntoView({block:'center'})")
        await wait(400)
        fs.writeFileSync(path.join(root, 'client-configs.png'), (await window.webContents.capturePage()).toPNG())
        if(process.env.MIAOCL_UI_VISIBLE==='1'){
          await window.webContents.executeJavaScript("window.scrollTo(0,0);document.querySelector('.content').scrollTop=0")
          await wait(500);fs.writeFileSync(path.join(root,'client-configs-top.png'),(await window.webContents.capturePage()).toPNG())
          const overflow=await js("document.documentElement.scrollWidth>innerWidth")
          assert.equal(overflow,false,'Workspace horizontal overflow')
          window.setSize(1024,768);await wait(500)
          assert.equal(await js("document.documentElement.scrollWidth>innerWidth"),false,'Narrow workspace horizontal overflow')
          fs.writeFileSync(path.join(root,'client-configs-narrow.png'),(await window.webContents.capturePage()).toPNG())
        }
      }
      fs.writeFileSync(`out/windows-ui-${version}-${mode}.json`, JSON.stringify(report, null, 2))
      console.log('PASS packaged Windows UI', JSON.stringify(report)); clearTimeout(deadline); app.exit(0)
    } catch (error) { console.error(error); clearTimeout(deadline); app.exit(1) }
  })
})
packedRequire('./out/main/index.js')
