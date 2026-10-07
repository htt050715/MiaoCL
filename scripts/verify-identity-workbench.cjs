const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const {nativeImage}=require('electron')
module.exports=async function verify({window,root,games,instance,report,archive,liveConnected=false}){
  window.webContents.setBackgroundThrottling(false)
  const js=code=>window.webContents.executeJavaScript(code).catch(error=>{throw Error(error.message+'\nExpression: '+code)}),wait=ms=>new Promise(r=>setTimeout(r,ms))
  const invoke=(channel,...args)=>js(`window.kamucl.invoke(${JSON.stringify(channel)},...${JSON.stringify(args)})`)
  async function until(code){for(let i=0;i<50;i++){if(await js(code))return;await wait(100)}throw Error('UI condition timed out: '+code)}
  const selectSource=async value=>{await js("document.querySelector('[data-ui=\"identity:account-select\"]').click()");await wait(80);await js(`[...document.querySelectorAll('.select-menu-option')].find(b=>b.textContent.includes(${JSON.stringify(value)})).click()`);await wait(250)}
  const navigate=async key=>{await js(`(()=>{if(!document.querySelector('[data-nav="${key}"]'))document.querySelector('[data-nav=resources]').click();document.querySelector('[data-nav="${key}"]').click()})()`);await wait(350)}
  await navigate('settings')
  await until("!!document.querySelector('.settings-navigation')")
  await js("[...document.querySelectorAll('.settings-navigation button')].find(b=>b.textContent.includes('外观')).click()")
  await until("!!document.querySelector('[data-ui=\"identity:account-select\"]')")
  const defaultIdentity=await invoke('skin:launcherIdentity')
  assert.equal(defaultIdentity.username,'HT_T');assert.equal(defaultIdentity.fallback,true)
  assert(defaultIdentity.skin.startsWith('data:image/png;base64,iVBOR'))
  const iconUpdates=[],setIcon=window.setIcon.bind(window);window.setIcon=image=>{iconUpdates.push(image.toDataURL());return setIcon(image)}
  const seed=account=>{
    const image=nativeImage.createFromDataURL(defaultIdentity.skin),{width,height}=image.getSize(),bitmap=image.toBitmap()
    for(let y=8;y<16;y++)for(let x=8;x<16;x++)Buffer.from(account.username==='AppearanceA'?[220,60,40,255]:[40,180,220,255]).copy(bitmap,(y*width+x)*4)
    const skin=nativeImage.createFromBitmap(bitmap,{width,height}).toDataURL()
    const key=JSON.stringify([account.type,account.id,account.uuid,account.providerId,account.apiRoot])
    const dir=path.join(root,'skin-cache');fs.mkdirSync(dir,{recursive:true})
    fs.writeFileSync(path.join(dir,crypto.createHash('sha256').update(key).digest('hex')+'.json'),JSON.stringify({username:account.username,skins:[{url:'https://example.invalid/'+account.id,dataUrl:skin,variant:'slim',state:'ACTIVE'}],capes:[]}))
    return skin
  }
  const a=await invoke('accounts:addOffline','AppearanceA');seed(a)
  const b=await invoke('accounts:addOffline','AppearanceB');seed(b)
  await window.reload();await wait(650)
  await until("document.querySelector('.brand-head')?.alt==='AppearanceB 的头像'")
  const bi=await invoke('skin:launcherIdentity');assert.equal(bi.accountId,b.id);assert.equal(bi.variant,'slim');assert.equal(iconUpdates.at(-1),bi.avatar)
  await navigate('settings');await js("[...document.querySelectorAll('.settings-navigation button')].find(b=>b.textContent.includes('外观')).click()")
  await selectSource('AppearanceA')
  await until("document.querySelector('.brand-head')?.alt==='AppearanceA 的头像'")
  const ai=await invoke('skin:launcherIdentity');assert.equal(ai.accountId,a.id);assert.notEqual(ai.avatar,bi.avatar);assert.equal(iconUpdates.at(-1),ai.avatar)
  assert.equal((await invoke('accounts:selected')).id,b.id,'Display selection changed gameplay account')
  await js("document.querySelector('[data-ui=\"identity:model-toggle\"] input').click()")
  await until("document.querySelector('.player-skin-logo')?.getAttribute('aria-label')==='AppearanceA 的皮肤小人'")
  assert(await js("!!document.querySelector('.player-skin-logo canvas')"))
  await wait(900);fs.writeFileSync(path.join(root,'account-appearance.png'),(await window.webContents.capturePage()).toPNG())
  await selectSource('跟随当前账号')
  await until("document.querySelector('.player-skin-logo')?.getAttribute('aria-label')==='AppearanceB 的皮肤小人'")
  await invoke('accounts:select',a.id)
  await selectSource('AppearanceB')
  await invoke('accounts:remove',b.id);await window.reload();await wait(650)
  await until("document.querySelector('.player-skin-logo')?.getAttribute('aria-label')==='AppearanceA 的皮肤小人'")
  await invoke('accounts:remove',a.id);await window.reload();await wait(650)
  await until("document.querySelector('.player-skin-logo')?.getAttribute('aria-label')==='HT_T 的皮肤小人'")
  assert.equal((await invoke('skin:launcherIdentity')).skin,defaultIdentity.skin)
  report.ui.accountAppearance={bundledFallback:true,currentAccount:true,pinnedIndependent:true,slim:true,model:true,removedAccountRecovery:true,nativeIconUpdates:iconUpdates.length,offlineCache:true}
  await invoke('settings:set',{playerSkinLogo:false,displayAccountId:''})
  await window.reload();await wait(600)

  const files=['slimefunhelper/runtime/combat.yml','meteor-client/modules.nbt','config/menudemo.json5']
  const before=Object.fromEntries(files.map(name=>[name,fs.readFileSync(path.join(instance,name))]))
  const enter=async()=>{await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'E',ctrlKey:true,shiftKey:true,bubbles:true}))");await until("!!document.querySelector('.designer-toolbar')")}
  const click=async text=>{await js(`[...document.querySelectorAll('[data-design-tools] button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);await wait(100)}
  const page=async value=>{await js(`(()=>{const e=document.querySelector('[aria-label="编辑页面"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(350)}
  const select=async selector=>{await wait(700);for(let i=0;i<15;i++){await js(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);await wait(200);if(await js(`(()=>{const target=document.querySelector(${JSON.stringify(selector)}),title=document.querySelector('.designer-panel h3')?.textContent,label=(target.querySelector('strong')?.textContent||target.textContent||'').trim();return !!document.querySelector('.property-tabs')&&title?.includes(label.slice(0,20))})()`))return}throw Error('Target not selected: '+selector+' '+JSON.stringify(await js(`({target:document.querySelector(${JSON.stringify(selector)})?.outerHTML.slice(0,400),panel:document.querySelector('.designer-panel')?.innerText,layers:document.querySelector('.designer-layers')?.innerText.slice(-1200)})`)))}
  const field=async(label,value)=>{await js(`(()=>{const e=document.querySelector('[data-design-tools] [aria-label=${JSON.stringify(label)}]');if(!e)throw Error('Missing field '+${JSON.stringify(label)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(500)}
  if(liveConnected){
    await navigate('keys');await until("!!document.querySelector('[data-live-keys-toggle]')")
    await js("[...document.querySelectorAll('.cfg-sections button')].find(b=>b.innerText.includes('按键配置')).click();document.querySelector('[data-live-keys-toggle]').click()")
    await until("!!document.querySelector('.live-key-row')")
  }
  await enter()
  if(liveConnected){await select('.live-key-row');await click('外观');await field('圆角','13');await until("getComputedStyle(document.querySelector('.live-key-row')).borderRadius==='13px'")}
  assert(await js("[...document.querySelector('[aria-label=\"编辑页面\"]').options].some(o=>o.value==='client-configs')"))
  await page('client-configs');await until("!!document.querySelector('.clickui-editor')")
  await select('.settings-panel .click-setting');await click('外观');await field('毛玻璃','29');await field('圆角','19')
  await until("getComputedStyle(document.querySelector('.settings-panel .click-setting')).backdropFilter==='blur(29px)'")
  await click('主题与恢复');await wait(700)
  const theme=await invoke('appearance:exportTheme',await invoke('appearance:draftRead'));assert(theme.startsWith('KAMUCL2.'))
  await click('返回编辑');await click('选择组件') // Toggle from selecting to browsing.
  await js("document.querySelector('.config-toolbar .select-menu-btn').click()");await until("!!document.querySelector('.select-menu-float')")
  await js("[...document.querySelectorAll('.select-menu-option')].find(b=>b.textContent.includes('Meteor /')).click()")
  await until("document.querySelector('.client-configs')?.dataset.designPage==='meteor'&&!!document.querySelector('.category-list')")
  await js("[...document.querySelectorAll('.feature-list .feature-row')].find(b=>b.textContent.includes('flight')).click()")
  await click('浏览导航');await select('.settings-panel .click-setting-copy strong');await click('文字');await field('字号','21')
  const selector='.settings-panel .click-setting-copy strong'
  await until(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).fontSize==='21px'`)
  await click('选择组件');await js("[...document.querySelectorAll('.feature-list .feature-row')].find(b=>b.textContent.includes('kill-aura')).click()")
  assert.equal(await js("document.querySelector('.feature-title h3').textContent"),'杀戮光环')
  await js("[...document.querySelectorAll('.feature-list .feature-row')].find(b=>b.textContent.includes('flight')).click()")
  await until("getComputedStyle(document.querySelector('.settings-panel .click-setting-copy strong')).fontSize==='21px'")
  fs.writeFileSync(path.join(root,'configuration-workbench.png'),(await window.webContents.capturePage()).toPNG())
  await page('mod-configs');await until("!!document.querySelector('.mod-menu-list .feature-row')")
  await js("[...document.querySelectorAll('.mod-menu-list .feature-row')].find(b=>b.textContent.includes('菜单测试模组')).click()")
  await until("!!document.querySelector('.click-setting')")
  await click('浏览导航');await select('.click-setting');await click('布局');await field('内部留白','17')
  await until("getComputedStyle(document.querySelector('.click-setting')).paddingTop==='17px'")
  await click('应用外观');await until("!document.querySelector('.designer-toolbar')")
  const design=(await invoke('settings:get')).visualDesign
  assert(Object.keys(design.pages).includes('client-configs/slimefunhelper'));assert(Object.keys(design.pages).includes('client-configs/meteor'));assert(Object.keys(design.pages).includes('mod-configs'))
  await window.reload();await wait(650)
  await navigate('bridge');await until("!!document.querySelector('[data-open-mod-configs]')")
  await js("document.querySelector('[data-open-mod-configs]').click()");await until("!!document.querySelector('.click-setting')")
  await until("getComputedStyle(document.querySelector('.click-setting')).paddingTop==='17px'")
  await enter();await page('client-configs');await until("!!document.querySelector('.click-setting')")
  await select('.click-setting');await click('重置组件');await click('主题与恢复');await click('重置所有组件')
  await js(`(()=>{const e=document.querySelector('[aria-label="主题码"]');e.value=${JSON.stringify(theme)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await click('导入到草稿');await until("!document.querySelector('.designer-dialog-mask')");await click('应用外观');await until("!document.querySelector('.designer-toolbar')")
  await until("getComputedStyle(document.querySelector('.click-setting')).backdropFilter==='blur(29px)'")
  for(const name of files)assert.deepEqual(fs.readFileSync(path.join(instance,name)),before[name],'Appearance edits modified game config '+name)
  report.ui.configurationWorkbench={entries:true,slime:true,meteor:true,modConfigs:true,liveKeys:liveConnected,stableSelection:true,browseNavigation:true,dropdownNavigation:true,glass:true,layout:true,typography:true,persistence:true,themeExportImport:true,reset:true,gameFilesUnchanged:true}
  if(liveConnected){await navigate('keys');await until("!!document.querySelector('[data-live-keys-toggle]')");await js("[...document.querySelectorAll('.cfg-sections button')].find(b=>b.innerText.includes('按键配置')).click();document.querySelector('[data-live-keys-toggle]').click()");await until("!!document.querySelector('.live-key-row')")}
}
