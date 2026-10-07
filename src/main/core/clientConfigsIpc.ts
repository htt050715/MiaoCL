import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { ClientConfigManager } from './clientConfigs'
import { decodeConfig } from './clientConfigCodec'
import { instanceDirectoryState } from './instances'
import { readVersionJson } from './versions'
import { requireResourceVersion } from './resourceDirectory'
import { folderOfVersion, withGameFolder } from './paths'
import { samePath } from './folderPaths'
import { getSettings } from './settings'
import { callBridge, readDiscovery, bridgeStatus } from './modBridge'
import { externalGameUsesDirectory, invalidateGameDirectoryUseCache } from './gameDirectoryUse'
import { ownsClientConfigSession, restartForClientConfig, setBeforeClientConfigLaunch } from './launch'
import { IPC } from '../../shared/types'
import type { ConfigDocument, ConfigRuntime, ConfigSaveMode, ConfigScope } from '../../shared/clientConfigs'
import type {ConfigNode} from '../../shared/clientConfigs'
import { readMeteorTranslations } from './meteorTranslations'
import {populateModConfigCatalog} from './modConfigCatalog'
import type {LiveKeysSnapshot} from '../../shared/liveKeybindings'

const directory = (version: string) => { requireResourceVersion(version); return instanceDirectoryState(version,readVersionJson(version)).path }
export const clientConfigs = new ClientConfigManager({
  directory,
  async runtime(version): Promise<ConfigRuntime> {
    const status = await bridgeStatus(version), discovery = readDiscovery(version)
    const result: ConfigRuntime = {running:status.connected || await externalGameUsesDirectory(directory(version)),owned:ownsClientConfigSession(version,folderOfVersion(version)),connected:status.connected,capabilities:[],modules:[],reason:status.reason}
    if (status.connected && discovery) {
      try {
        const manifest = await callBridge(discovery,'client-configs/manifest',undefined,15000) as {capabilities?:string[];modules?:ConfigRuntime['modules'];slimeModules?:ConfigRuntime['slimeModules'];ok?:boolean;error?:string}
        result.capabilities = manifest.capabilities ?? []; result.modules = manifest.modules ?? []
        result.slimeModules=manifest.slimeModules??[]
        if (!manifest.ok) result.reason = manifest.error ?? '客户端尚未准备好'
      } catch { result.reason = '桥接版本不支持配置管理，请安装或升级桥接 MOD 后重新启动游戏' }
    }
    return result
  },
  async hot(version,files,snapshot) {
    const discovery = readDiscovery(version)
    if (!discovery) throw Error('客户端桥接服务未连接')
    const result = await callBridge(discovery,'client-configs/apply',{files,snapshot},120000) as {ok?:boolean;error?:string}
    if (!result.ok) throw Error(result.error ?? '客户端未确认配置加载')
  },
  async restart(version,save) {
    await restartForClientConfig(version,folderOfVersion(version),async () => { invalidateGameDirectoryUseCache(); await save() })
  }
})
export function registerClientConfigsIpc(getWindow: () => BrowserWindow | null) {
  async function sync(version: string) {
    const status = await bridgeStatus(version), discovery = readDiscovery(version)
    if (!status.connected || !/^1\.1\./.test(status.modVersion??'') || !discovery) return
    const result = await callBridge(discovery,'client-configs/sync',{},60000) as {ok?:boolean;error?:string}
    if (!result.ok) throw Error(result.error ?? '无法同步客户端当前参数')
  }
  async function read(version:string,file:string,flush:boolean) {
    let warning:string|undefined
    if(flush)try{await sync(version)}catch(e){warning='游戏参数同步失败，已读取磁盘配置：'+String(e)}
    const doc=clientConfigs.read(version,file),discovery=readDiscovery(version)
    doc.warning=warning??doc.warning
    if(file!=='meteor-client/modules.nbt'||!discovery||!(await bridgeStatus(version)).connected||!/^1\.1\./.test(discovery.modVersion??'')||clientConfigs.hasPending(version))return doc
    try {
    const full=await callBridge(discovery,'client-configs/full-modules',undefined,60000) as {ok?:boolean;nbt?:string;error?:string;schema?:{module:string;group:string;name:string;title:string;description:string;options?:string[];min?:number;max?:number;kind?:string;sliderMin?:number;sliderMax?:number;noSlider?:boolean;enumType?:string;enumNames?:Record<string,string>}[]}
    if(!full.ok||!full.nbt)throw Error(full.error??'无法读取完整模块参数')
    const root=decodeConfig(file,Buffer.from(full.nbt,'base64'),doc.hash).root
    const schema=new Map((full.schema??[]).map(s=>[JSON.stringify([s.module,s.group,s.name]),s]))
    const child=(node:ConfigNode|undefined,key:string)=>node?.children?.find(c=>c.key===key)?.node
    for(const entry of child(root,'modules')?.children??[]) {
      const module=entry.node,name=child(module,'name')?.value
      for(const group of child(child(module,'settings'),'groups')?.children??[]) {
        const groupName=child(group.node,'name')?.value
        for(const setting of child(group.node,'settings')?.children??[]) {
          const settingName=child(setting.node,'name')?.value,metadata=schema.get(JSON.stringify([name,groupName,settingName])),value=child(setting.node,'value')
          if(metadata&&value){value.title=metadata.title;value.description=metadata.description;value.options=metadata.options;value.min=metadata.min;value.max=metadata.max;value.kind=metadata.kind;value.sliderMin=metadata.sliderMin;value.sliderMax=metadata.sliderMax;value.noSlider=metadata.noSlider;value.enumType=metadata.enumType;value.enumNames=metadata.enumNames}
        }
      }
    }
    doc.root=root
    }catch(e){doc.warning='无法补全游戏内默认参数，当前显示磁盘配置：'+String(e)}
    return doc
  }
  function target<T>(version: string, folder: string, action: () => T): T {
    requireResourceVersion(version)
    const bound = getSettings().folders.find(f => samePath(f.path,folder))
    if (!bound) throw Error('游戏文件夹未绑定，请先在启动器中添加')
    return withGameFolder(bound.path,action)
  }
  ipcMain.handle(IPC.clientConfigsCatalog,(_e,id:string,folder:string,scope?:ConfigScope) => target(id,folder,async () => {
    if(scope==='mods')return populateModConfigCatalog(await clientConfigs.catalog(id,'mods'))
    const [catalog,translations]=await Promise.all([clientConfigs.catalog(id),readMeteorTranslations(directory(id))])
    catalog.meteorTranslations=translations;return catalog
  }))
  ipcMain.handle(IPC.clientConfigsRead,(_e,id:string,folder:string,file:string,flush?:boolean) => target(id,folder,() => read(id,file,flush===true)))
  async function liveKeys(id:string,body?:unknown): Promise<LiveKeysSnapshot> {
    const discovery=readDiscovery(id)
    if(!discovery || !(await bridgeStatus(id)).connected) throw Error('请先启动所选实例，并安装或升级配置桥接 MOD（1.1.4 或更新版本）')
    const version=discovery.modVersion.split('.').map(Number)
    if(version.length!==3 || version.some(n=>!Number.isInteger(n)) || version[0]<1 || version[0]===1 && (version[1]<1 || version[1]===1 && version[2]<4)) throw Error('请退出游戏，在 MOD 面板升级配置桥接 MOD 后重新启动')
    const request=body===undefined?undefined:{...(body as Record<string,unknown>),expiresAt:Date.now()+25000}
    const result=await callBridge(discovery,body===undefined?'keybindings/snapshot':'keybindings/set',request,35000) as LiveKeysSnapshot & {ok?:boolean;error?:string}
    if(!result.ok || typeof result.session!=='string' || !Array.isArray(result.items))throw Error(result.error??'客户端未确认键位，请重新读取')
    result.meteorTranslations=await readMeteorTranslations(directory(id))
    return result
  }
  ipcMain.handle(IPC.keysLiveSnapshot,(_e,id:string,folder:string) => target(id,folder,() => liveKeys(id)))
  ipcMain.handle(IPC.keysLiveSet,(_e,id:string,folder:string,body:unknown) => target(id,folder,() => liveKeys(id,body)))
  ipcMain.handle(IPC.clientConfigsCommit,(_e,id:string,folder:string,docs:ConfigDocument[],mode:ConfigSaveMode) => target(id,folder,async () => clientConfigs.commit(id,docs,mode)))
  ipcMain.handle(IPC.clientConfigsCancelPending,(_e,id:string,folder:string) => target(id,folder,() => clientConfigs.clearPending(id)))
  ipcMain.handle(IPC.clientConfigsProfileSave,(_e,id:string,folder:string,scope:ConfigScope,name:string) => target(id,folder,async () => { await sync(id); return clientConfigs.saveProfile(id,scope,name) }))
  ipcMain.handle(IPC.clientConfigsProfileSwitch,(_e,id:string,folder:string,name:string,mode:ConfigSaveMode) => target(id,folder,() => clientConfigs.switchProfile(id,name,mode)))
  ipcMain.handle(IPC.clientConfigsActivateSnapshot,(_e,id:string,folder:string,file:string,mode:ConfigSaveMode) => target(id,folder,() => clientConfigs.activateSlimefunSnapshot(id,file,mode)))
  ipcMain.handle(IPC.clientConfigsExport,(_e,id:string,folder:string,scope:ConfigScope) => target(id,folder,async () => {
    const window = getWindow(), options = {title:scope==='mods'?'导出全部模组配置':'导出全部客户端配置',defaultPath:`MiaoCL-${scope}.zip`,filters:[{name:'MiaoCL 配置包',extensions:['zip']}]}
    const selected = window ? await dialog.showSaveDialog(window,options) : await dialog.showSaveDialog(options)
    if (selected.canceled || !selected.filePath) return false
    await sync(id); clientConfigs.exportBundle(id,scope,selected.filePath); return true
  }))
  ipcMain.handle(IPC.clientConfigsImport,(_e,id:string,folder:string,mode:ConfigSaveMode,scope?:ConfigScope) => target(id,folder,async () => {
    const window = getWindow(), options = {title:'导入全部客户端配置',properties:['openFile'] as ('openFile')[],filters:[{name:'MiaoCL 配置包',extensions:['zip']}]}
    const selected = window ? await dialog.showOpenDialog(window,options) : await dialog.showOpenDialog(options)
    if (selected.canceled || !selected.filePaths[0]) return null
    return clientConfigs.importBundle(id,selected.filePaths[0],mode,scope)
  }))
  setBeforeClientConfigLaunch(version => clientConfigs.beforeLaunch(version))
}
