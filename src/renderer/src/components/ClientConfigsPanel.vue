<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref,watch} from 'vue'
import type {ConfigCatalog,ConfigDocument,ConfigSaveMode,ConfigScope} from '@shared/clientConfigs'
import {clientConfigsCatalog,clientConfigsRead,clientConfigsCommit,clientConfigsProfileSave,clientConfigsProfileSwitch,clientConfigsExport,clientConfigsImport,clientConfigsCancelPending,clientConfigsActivateSnapshot,errText} from '../api'
import {selectedInstance,toast} from '../store'
import SelectMenu from './SelectMenu.vue'
import ConfigNodeEditor from './ConfigNodeEditor.vue'
import ConfirmModal from './ConfirmModal.vue'
const catalog=ref<ConfigCatalog>(), scope=ref<ConfigScope>('slimefunhelper'), file=ref(''), search=ref(''), fileSearch=ref(''), profile=ref(''), profileName=ref(''),error=ref(''),busy=ref(false)
const documents=ref<Record<string,ConfigDocument>>({}),originals=ref<Record<string,string>>({})
const operation=ref<'save'|'import'|'switch'|'snapshot'|null>(null),discard=ref(false),cancelPending=ref(false)
let epoch=0, disposed=false, polling=false, timer:ReturnType<typeof setInterval>|undefined
const target=computed(() => selectedInstance.value ? {id:selectedInstance.value.id,folder:selectedInstance.value.folder} : undefined)
const current=computed(() => documents.value[file.value])
const dirty=computed(() => Object.values(documents.value).filter(doc => JSON.stringify(doc)!==originals.value[doc.file]))
const options=computed(() => (catalog.value?.files??[]).filter(f => (scope.value==='all'||f.scope===scope.value)&&f.file.toLowerCase().includes(fileSearch.value.toLowerCase())).map(f=>({value:f.file,label:f.file,description:Math.round(f.size/1024)+' KB'})))
const modules=computed(() => (catalog.value?.runtime.modules??[]).filter(m => !search.value || (m.title+' '+m.name+' '+m.category+' '+m.addon).toLowerCase().includes(search.value.toLowerCase())))
async function refresh() {
  const t=target.value,request=epoch
  if(!t||polling||disposed)return
  polling=true
  try {const next=await clientConfigsCatalog(t.id,t.folder);if(request===epoch){catalog.value=next;error.value=''} }
  catch(e){if(request===epoch)error.value=errText(e)} finally{polling=false}
}
async function openFile(name:string) {
  const t=target.value,request=epoch
  if(!t||!name||busy.value)return
  file.value=name
  if(documents.value[name])return
  try{const doc=await clientConfigsRead(t.id,t.folder,name,true);if(request===epoch){documents.value[name]=doc;originals.value[name]=JSON.stringify(doc)}}catch(e){if(request===epoch)error.value=errText(e)}
}
async function run(mode:ConfigSaveMode) {
  const t=target.value,request=epoch,op=operation.value
  if(!t||busy.value||!op)return
  busy.value=true;error.value=''
  try {
    const result=op==='save'?await clientConfigsCommit(t.id,t.folder,JSON.parse(JSON.stringify(dirty.value)),mode):op==='switch'?await clientConfigsProfileSwitch(t.id,t.folder,profile.value,mode):op==='snapshot'?await clientConfigsActivateSnapshot(t.id,t.folder,file.value,mode):await clientConfigsImport(t.id,t.folder,mode)
    if(request!==epoch)return
    if(result){toast(result.message,'success');documents.value={};originals.value={};operation.value=null;await refresh();await openAfterSave()}
    else operation.value=null
  }catch(e){if(request===epoch)error.value=errText(e)}finally{busy.value=false}
}
async function openAfterSave(){const name=file.value;file.value='';if(name){busy.value=false;await openFile(name)}}
async function saveProfile(){const t=target.value;if(!t||busy.value)return;busy.value=true;try{if(dirty.value.length)throw Error('请先保存或取消编辑，再保存完整配置');await clientConfigsProfileSave(t.id,t.folder,scope.value,profileName.value);toast('完整配置已保存','success');profileName.value='';await refresh()}catch(e){error.value=errText(e)}finally{busy.value=false}}
async function exportAll(){const t=target.value;if(!t||busy.value)return;busy.value=true;try{if(dirty.value.length)throw Error('请先保存或取消编辑，再导出完整配置');if(await clientConfigsExport(t.id,t.folder,scope.value))toast('配置包已导出','success')}catch(e){error.value=errText(e)}finally{busy.value=false}}
async function switchHot(op:'switch'|'snapshot'){operation.value=op;await run('hot')}
function discardEdits(){documents.value={};originals.value={};operation.value=null;discard.value=false;error.value='';void openAfterSave()}
async function discardPending(){const t=target.value;if(!t)return;busy.value=true;try{await clientConfigsCancelPending(t.id,t.folder);cancelPending.value=false;discardEdits();await refresh()}catch(e){error.value=errText(e)}finally{busy.value=false}}
watch(()=>[target.value?.id,target.value?.folder],()=>{++epoch;catalog.value=undefined;documents.value={};originals.value={};file.value='';profile.value='';error.value='';operation.value=null;void refresh()})
watch(scope,()=>{file.value='';search.value=''})
async function poll(){if(document.hidden||disposed||busy.value)return;await refresh();const doc=current.value,t=target.value,request=epoch;if(!doc||!t||dirty.value.some(d=>d.file===doc.file))return;try{const next=await clientConfigsRead(t.id,t.folder,doc.file);if(request===epoch&&next.hash!==doc.hash&&!dirty.value.some(d=>d.file===doc.file)){documents.value[doc.file]=next;originals.value[doc.file]=JSON.stringify(next)}}catch(e){if(request===epoch)error.value=errText(e)}}
onMounted(()=>{void refresh();timer=setInterval(()=>void poll(),4000)})
onUnmounted(()=>{disposed=true;++epoch;clearInterval(timer)})
</script>
<template>
  <section class="client-configs card">
    <div class="config-heading"><div><h2>客户端参数管理</h2><p class="muted">SlimefunHelper、Meteor 附加模块、Baritone、好友与全配置</p></div><button class="btn btn-ghost btn-sm" :disabled="busy" @click="refresh">刷新</button></div>
    <p v-if="!target" class="muted">请先选择游戏实例。</p>
    <template v-else>
      <p v-if="catalog" class="config-monitor"><span class="tag">{{ catalog.runtime.running?'客户端运行中':'客户端已关闭' }}</span><span>{{ catalog.runtime.connected?'桥接已连接':'桥接未连接' }}</span><span v-if="catalog.runtime.capabilities.length">已识别：{{ catalog.runtime.capabilities.join('、') }}</span></p>
      <p v-if="catalog?.runtime.reason" class="muted">{{ catalog.runtime.reason }}</p>
      <p v-if="catalog" class="config-directory muted">{{ catalog.directory }}</p>
      <div v-if="catalog?.pending" class="config-pending">有下次启动生效的修改。<button class="btn btn-ghost btn-sm" :disabled="busy" @click="cancelPending=true">取消暂存修改</button></div>
      <div class="config-toolbar"><SelectMenu v-model="scope" :options="[{value:'slimefunhelper',label:'SlimefunHelper'},{value:'meteor',label:'Meteor / Baritone'},{value:'all',label:'全部客户端配置'}]" :disabled="busy"/><button class="btn btn-ghost" :disabled="busy" @click="exportAll">导出全配置</button><button class="btn btn-ghost" :disabled="busy||dirty.length>0" @click="operation='import'">导入全配置</button></div>
      <div class="config-toolbar"><input v-model="profileName" class="input" placeholder="新配置名称" :disabled="busy"/><button class="btn btn-ghost" :disabled="busy||!profileName.trim()" @click="saveProfile">保存完整配置</button><SelectMenu v-model="profile" :options="(catalog?.profiles??[]).map(name=>({value:name,label:name}))" placeholder="选择已保存配置" :disabled="busy"/><button class="btn btn-gold" :disabled="busy||!profile||dirty.length>0" @click="switchHot('switch')">切换并热重载</button></div>
      <div class="config-toolbar"><input v-model="fileSearch" class="input" placeholder="筛选配置文件…" :disabled="busy"/><SelectMenu :model-value="file" :options="options" placeholder="选择配置文件" :disabled="busy" @change="openFile"/></div>
      <div v-if="current" class="config-editor">
        <button v-if="/^slimefunhelper\/config\/[^/]+\.nbt$/i.test(file)" class="btn btn-gold" :disabled="busy||dirty.length>0" @click="switchHot('snapshot')">应用此 SlimefunHelper 参数快照并热重载</button>
        <div class="config-toolbar"><input v-model="search" class="input" placeholder="搜索参数、模块、好友名称…"/><span class="muted">{{ current.format.toUpperCase() }}</span><button class="btn btn-ghost btn-sm" :disabled="busy||!dirty.length" @click="discard=true">取消全部修改</button><button class="btn btn-gold" :disabled="busy||!dirty.length" @click="operation='save'">保存 {{ dirty.length }} 个文件</button></div>
        <ConfigNodeEditor :node="current.root" :label="current.file" :search="search" :disabled="busy" @change="error=''"/>
      </div>
      <details v-if="scope!=='slimefunhelper' && catalog?.runtime.modules.length" class="config-modules"><summary>游戏已注册 {{ catalog.runtime.modules.length }} 个 Meteor 模块（包含附加插件）</summary><div v-for="m in modules.slice(0,100)" :key="m.addon+m.name" class="config-module"><strong>{{ m.title }}</strong><small class="muted">{{ m.name }} · {{ m.category }} · {{ m.addon }}</small></div><small v-if="modules.length>100" class="muted">显示前 100 项，请使用搜索缩小范围。</small></details>
      <p v-if="!options.length&&catalog" class="muted">当前实例没有匹配的配置文件。启动对应模组后会生成配置。</p>
      <p v-if="error" class="config-error" role="alert">{{ error }}</p>
    </template>
    <Teleport to="body"><div v-if="operation" class="modal-mask"><div class="modal config-save-modal"><h3 class="modal-title">{{ operation==='switch'?'切换完整配置':operation==='import'?'导入完整配置':'保存参数修改' }}</h3><p>{{ operation==='save'?'选择本次修改的生效方式。': '完整配置包含当前范围的模块、好友和 Baritone 等数据，应用前自动备份。' }}</p><button v-if="operation!=='save'" class="btn btn-gold" :disabled="busy" @click="run('hot')">切换参数并在游戏内热重载</button><button class="btn" :disabled="busy" @click="run('restart')">1. 关闭所选客户端实例并重启</button><button class="btn" :disabled="busy" @click="run('next-launch')">2. 保存改变，下次重启客户端后生效</button><button class="btn btn-ghost" :disabled="busy" @click="operation==='save'?discardEdits():operation=null">3. {{ operation==='save'?'取消本次所有修改':'取消本次操作' }}</button><p v-if="error" class="config-error" role="alert">{{ error }}</p><p v-if="busy" class="muted">正在处理，请等待客户端确认…</p></div></div></Teleport>
    <ConfirmModal :open="discard" title="取消全部修改" message="将撤销此页面所有尚未保存的编辑。" confirm-text="撤销编辑" @confirm="discardEdits" @cancel="discard=false"/>
    <ConfirmModal :open="cancelPending" title="取消暂存修改" message="删除本实例下次启动生效的修改，保留当前游戏配置。" confirm-text="取消暂存" :busy="busy" :error="error" @confirm="discardPending" @cancel="cancelPending=false"/>
  </section>
</template>
<style scoped>
.client-configs{padding:var(--card-pad);margin-top:16px}.config-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.config-heading h2{font-size:var(--text-lg);margin:0 0 8px}.config-heading p,.config-directory,.config-monitor{font-size:var(--text-sm)}.config-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:12px 0}.config-toolbar>.input{flex:1;min-width:180px}.config-toolbar :deep(.select-root){flex:1;min-width:160px}.config-monitor{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.config-directory{overflow-wrap:anywhere}.config-pending{padding:10px;background:var(--hover);border-radius:var(--radius-sm);font-size:var(--text-sm)}.config-error{color:var(--danger);font-size:var(--text-sm);white-space:pre-wrap;overflow-wrap:anywhere}.config-modules{margin:16px 0;font-size:var(--text-sm)}.config-module{display:flex;flex-direction:column;gap:4px;padding:8px 0;border-bottom:1px solid var(--border)}.config-save-modal{display:flex;flex-direction:column;gap:12px;max-width:600px}.config-save-modal .btn{text-align:left}.config-save-modal p{font-size:var(--text-sm);line-height:1.7}
</style>
