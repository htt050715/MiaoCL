<script setup lang="ts">
import { designIdentity } from '@shared/visualDesign'

import {computed,onMounted,onUnmounted,ref,watch} from 'vue'
import type {ConfigCatalog,ConfigDocument,ConfigSaveMode} from '@shared/clientConfigs'
import {configGroups,modSettingLabel} from '@shared/modConfigs'
import {clientConfigsCatalog,clientConfigsRead,clientConfigsCommit,clientConfigsExport,clientConfigsImport,errText} from '../api'
import {selectedInstance,store,toast,displayVersionName} from '../store'
import {draftKey,readDraft,storeDraft} from '../utils/clientConfigDrafts'
import ModConfigGroup from '../components/ModConfigGroup.vue'
import ConfigFeaturesEditor from '../components/ConfigFeaturesEditor.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import SelectMenu from '../components/SelectMenu.vue'
import '../client-configs.css'

const target=computed(()=>selectedInstance.value?{id:selectedInstance.value.id,folder:selectedInstance.value.folder}:undefined)
const catalog=ref<ConfigCatalog>(),documents=ref<Record<string,ConfigDocument>>({}),originals=ref<Record<string,string>>({})
const selected=ref(''),file=ref(''),group=ref(''),search=ref(''),settingSearch=ref(''),configuredOnly=ref(true)
const loading=ref(false),reading=ref(false),busy=ref(false),error=ref(''),operation=ref<'save'|'import'|null>(null),discard=ref(false)
let epoch=0,readEpoch=0,disposed=false,key=draftKey(target.value)+':mods'
const dirty=computed(()=>Object.values(documents.value).filter(d=>JSON.stringify(d)!==originals.value[d.file]))
const mods=computed(()=>(catalog.value?.mods??[]).filter(m=>(!configuredOnly.value||m.files.length)&&(!search.value.trim()||`${m.name} ${m.id} ${m.files.join(' ')}`.toLowerCase().includes(search.value.trim().toLowerCase()))))
const currentMod=computed(()=>catalog.value?.mods?.find(m=>m.id===selected.value))
const current=computed(()=>documents.value[file.value]),groups=computed(()=>current.value?configGroups(current.value.root):[])
const activeGroup=computed(()=>groups.value.find(g=>g.key===group.value)??groups.value[0])
const specialized=computed(()=>file.value==='meteor-client/modules.nbt'||/^slimefunhelper\/runtime\/[^/]+\.ya?ml$/i.test(file.value))
const translations=computed(()=>catalog.value?.modTranslations??{})
function keepDraft(){storeDraft(key,{documents:documents.value,originals:originals.value,file:file.value,scope:'mods'})}
function restore(){const saved=readDraft(key);if(saved){documents.value=saved.documents;originals.value=saved.originals;file.value=saved.file}}
async function refresh(){
  const t=target.value,request=epoch;if(!t||loading.value||disposed)return
  loading.value=true;error.value=''
  try{const next=await clientConfigsCatalog(t.id,t.folder,'mods');if(request!==epoch)return;catalog.value=next
    const owner=next.mods?.find(m=>m.files.includes(file.value));if(owner)selected.value=owner.id
    if(!next.mods?.some(m=>m.id===selected.value))selected.value=next.mods?.find(m=>m.files.length)?.id??next.mods?.[0]?.id??''
    if(!file.value)await openFile(currentMod.value?.files[0]??'')
  }catch(e){if(request===epoch)error.value=errText(e)}finally{if(request===epoch)loading.value=false}
}
async function openFile(name:string){
  const t=target.value;if(!t||busy.value)return;file.value=name;group.value='';settingSearch.value='';error.value=''
  const request=epoch,readRequest=++readEpoch;reading.value=false
  if(!name||documents.value[name])return
  if((catalog.value?.files.find(f=>f.file===name)?.size??0)>2*1024*1024){error.value='此文件超过 2 MB，可通过完整配置包备份和导入。';return}
  reading.value=true
  try{const doc=await clientConfigsRead(t.id,t.folder,name,true);if(request===epoch&&readRequest===readEpoch){documents.value[name]=doc;originals.value[name]=JSON.stringify(doc)}}catch(e){if(request===epoch&&readRequest===readEpoch)error.value=errText(e)}finally{if(readRequest===readEpoch)reading.value=false}
}
async function choose(id:string){if(busy.value)return;selected.value=id;await openFile(currentMod.value?.files[0]??'')}
async function exportAll(){const t=target.value;if(!t||busy.value)return;if(dirty.value.length){error.value='请先保存或取消修改，再导出全部配置';return}busy.value=true
  try{if(await clientConfigsExport(t.id,t.folder,'mods'))toast('全部模组配置已导出','success')}catch(e){error.value=errText(e)}finally{busy.value=false}
}
async function run(mode:ConfigSaveMode){
  const t=target.value,request=epoch,op=operation.value;if(!t||busy.value||!op)return;busy.value=true;error.value=''
  try{const result=op==='save'?await clientConfigsCommit(t.id,t.folder,JSON.parse(JSON.stringify(dirty.value)),mode):await clientConfigsImport(t.id,t.folder,mode,'mods')
    if(request!==epoch)return;operation.value=null
    if(result){toast(result.message,'success');documents.value={};originals.value={};const name=file.value;file.value='';busy.value=false;await refresh();if(name)await openFile(name)}
  }catch(e){if(request===epoch)error.value=errText(e)}finally{busy.value=false}
}
async function reload(){if(dirty.value.length){error.value='请先保存或取消修改，再刷新配置';return}documents.value={};originals.value={};const name=file.value;await refresh();await openFile(name)}
function discardEdits(){documents.value={};originals.value={};discard.value=false;operation.value=null;void openFile(file.value)}
watch(()=>[target.value?.id,target.value?.folder],()=>{keepDraft();key=draftKey(target.value)+':mods';++epoch;++readEpoch;loading.value=false;reading.value=false;catalog.value=undefined;documents.value={};originals.value={};selected.value='';file.value='';operation.value=null;restore();void refresh()})
onMounted(()=>{restore();void refresh();if(store.modConfigImportRequested){operation.value='import';store.modConfigImportRequested=false}})
onUnmounted(()=>{keepDraft();disposed=true;++epoch;++readEpoch})
</script>
<template>
  <div class="page client-configs-page mod-configs-page">
    <div class="page-head mod-menu-header"><div><h1 class="page-title">模组配置菜单</h1><p class="page-sub">{{selectedInstance?displayVersionName(selectedInstance):'先选择游戏实例'}} · 按模组查看配置与具体设置</p></div><button class="btn btn-ghost" data-design-nav @click="store.currentView='bridge'">返回 MOD 面板</button></div>
    <section class="card client-configs mod-config-menu">
      <div class="mod-menu-toolbar"><span class="tag">{{catalog?.runtime.running?'客户端运行中':'客户端已关闭'}}</span><button class="btn btn-ghost btn-sm" :disabled="busy||loading||!target" @click="reload">刷新</button><span class="toolbar-spacer"/><button class="btn btn-ghost" :disabled="busy||!target||dirty.length>0" @click="exportAll">导出全部模组配置</button><button class="btn btn-ghost" :disabled="busy||!target||dirty.length>0" @click="operation='import'">导入全部模组配置</button></div>
      <p class="muted mod-menu-hint">配置包包含 config、defaultconfigs、SlimefunHelper、Meteor 和 Baritone 配置。导入会备份并覆盖同名文件；保留包外配置。</p>
      <p v-if="catalog?.pending" class="mod-menu-hint">有已暂存的修改，将在下次启动前应用。</p>
      <p v-if="error" class="config-error" role="alert">{{error}}</p>
      <details v-if="catalog?.warnings?.length" class="mod-menu-hint"><summary>部分汉化资源未读取</summary><p v-for="warning in catalog.warnings" :key="warning">{{warning}}</p></details>
      <div v-if="loading&&!catalog" class="empty">正在读取模组与配置…</div>
      <div v-else-if="target" class="mod-menu-layout">
        <aside class="feature-list mod-menu-list"><input data-design-nav v-model="search" class="input" placeholder="搜索模组或配置文件…"/><label class="mod-menu-filter"><input data-design-nav v-model="configuredOnly" type="checkbox"/> 只看有配置的模组</label><button v-for="mod in mods" :key="mod.id" :data-design-key="designIdentity(mod.id)" data-design-nav class="feature-row" :class="{selected:selected===mod.id}" :disabled="busy" @click="choose(mod.id)"><img v-if="mod.icon" :src="mod.icon" alt=""/><span v-else class="mod-menu-icon">⚙</span><span><strong>{{mod.name}}</strong><small>{{mod.version||mod.association||mod.id}}{{mod.disabled?' · 已禁用':''}}</small><small>{{mod.files.length}} 个配置文件</small></span></button><p v-if="!mods.length" class="muted">没有匹配的模组配置</p></aside>
        <section class="feature-parameters mod-menu-parameters">
          <template v-if="currentMod"><header class="mod-menu-title"><div><h2>{{currentMod.name}}</h2><p class="muted">{{currentMod.id}} · {{currentMod.association||'尚未发现配置文件'}}</p></div></header>
            <template v-if="currentMod.files.length"><SelectMenu data-design-nav :model-value="file" :options="currentMod.files.map(name=>({value:name,label:name}))" :disabled="busy||reading" @change="openFile"/><div class="mod-menu-editbar"><input data-design-nav v-model="settingSearch" class="input" placeholder="搜索具体设置…"/><button class="btn btn-ghost btn-sm" :disabled="busy||!dirty.length" @click="discard=true">取消修改</button><button class="btn btn-gold" :disabled="busy||!dirty.length" @click="operation='save'">保存 {{dirty.length}} 个文件</button></div>
              <p v-if="reading" class="muted">正在读取配置…</p><template v-else-if="current"><p v-if="current.warning" class="muted mod-menu-hint">{{current.warning}}</p><p class="muted mod-menu-hint">普通模组设置在下次启动游戏后生效。</p>
                <p v-if="current.format==='binary'" class="muted">此文件为二进制配置，可通过完整配置包导入导出。</p>
                <textarea v-else-if="current.format==='text'" :value="String(current.root.value??'')" @input="current.root.value=($event.target as HTMLTextAreaElement).value" class="input mod-config-text" :disabled="busy" rows="16" spellcheck="false" aria-label="原始配置内容"/>
                <ConfigFeaturesEditor v-else-if="specialized" :data-design-key="designIdentity(currentMod.id,file)" :root="current.root" :meteor="file==='meteor-client/modules.nbt'" :search="settingSearch" :disabled="busy" :modules="catalog?.runtime.modules" :translations="translations"/>
                <template v-else><nav class="mod-menu-groups"><button v-for="entry in groups" :key="entry.key" :data-design-key="designIdentity(currentMod.id,entry.key)" data-design-nav class="btn btn-ghost btn-sm" :class="{active:activeGroup?.key===entry.key}" @click="group=entry.key">{{modSettingLabel(translations,currentMod.id,[entry.key])}}</button></nav><div :data-design-key="designIdentity(currentMod.id,file)"><ModConfigGroup v-if="activeGroup" :node="activeGroup.node" :path="activeGroup.path" :mod-id="currentMod.id" :translations="translations" :search="settingSearch" :disabled="busy"/></div></template>
              </template>
            </template><p v-else class="muted">此模组尚未生成可识别的配置文件。可先启动游戏，或关闭“只看有配置的模组”查看已安装列表。</p>
          </template><p v-else class="muted">选择左侧模组后查看设置。</p>
        </section>
      </div><p v-else class="muted">请先选择游戏实例。</p>
    </section>
    <Teleport to="body"><div v-if="operation" class="modal-mask"><div class="modal mod-config-save"><h3 class="modal-title">{{operation==='import'?'导入全部模组配置':'保存模组配置'}}</h3><p>{{operation==='import'?'选择 MiaoCL 模组配置包，覆盖包内同名配置并自动备份。':'保存当前编辑的配置，并自动备份原文件。'}} 当前游戏运行时，推荐下次启动生效。</p><button class="btn btn-gold" :disabled="busy" @click="run('next-launch')">下次启动生效</button><button class="btn btn-ghost" :disabled="busy" @click="run('restart')">{{catalog?.runtime.running?'关闭当前实例并重启后应用':'立即保存'}}</button><button class="btn btn-ghost" :disabled="busy" @click="operation=null">取消本次操作</button><p v-if="error" class="config-error" role="alert">{{error}}</p></div></div></Teleport>
    <ConfirmModal :open="discard" title="取消本次修改" message="此操作会丢弃本页面全部未保存编辑。" confirm-text="取消所有未保存修改" @confirm="discardEdits" @cancel="discard=false"/>
  </div>
</template>
<style scoped>
.mod-menu-header{flex-direction:row;text-align:left}.mod-menu-list .feature-row small{overflow-wrap:anywhere}
.mod-config-save{display:flex;flex-direction:column;gap:var(--space-3);max-width:580px}.mod-config-save p{font-size:var(--text-sm);line-height:1.7}
.mod-menu-header,.mod-menu-toolbar,.mod-menu-editbar{display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap}.mod-menu-header{justify-content:space-between}.mod-menu-header .page-title{font-size:var(--text-lg)}.mod-menu-toolbar .toolbar-spacer{flex:1}.mod-menu-hint{font-size:var(--text-xs);line-height:1.7;margin:var(--space-3) 0}.mod-menu-layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:var(--space-4);align-items:start;margin-top:var(--space-4)}.mod-menu-list{position:sticky;top:0;max-height:calc(100vh - 210px);overflow:auto;border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-2)}.mod-menu-list>.input{width:100%;min-width:0}.mod-menu-filter{display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-xs);padding:var(--space-3) var(--space-1)}.feature-row{display:flex;width:100%;gap:var(--space-3);align-items:center;padding:var(--space-3) var(--space-2);border:0;border-radius:var(--radius-sm);text-align:left;background:transparent;color:var(--text);cursor:pointer}.feature-row:hover{background:var(--hover)}.feature-row.selected{background:var(--accent-soft);color:var(--accent)}.feature-row img,.mod-menu-icon{width:32px;height:32px;object-fit:contain;flex:none}.mod-menu-icon{display:grid;place-items:center;color:var(--text-dim)}.feature-row>span:last-child{display:grid;gap:var(--space-1);min-width:0;overflow-wrap:anywhere}.feature-row strong{font-size:var(--text-sm)}.feature-row small{font-size:var(--text-xs);color:var(--text-dim)}.mod-menu-parameters{min-width:0;padding:var(--card-pad);border:1px solid var(--border);border-radius:var(--radius-md)}.mod-menu-title h2{font-size:var(--text-lg);margin:0}.mod-menu-title p{font-size:var(--text-xs);overflow-wrap:anywhere}.mod-menu-editbar{margin-top:var(--space-3);position:sticky;top:0;z-index:2;background:var(--card);backdrop-filter:blur(16px);padding:var(--space-2);border-radius:var(--radius-sm)}.mod-menu-editbar>.input{flex:1;min-width:140px}.mod-menu-groups{display:flex;flex-wrap:wrap;gap:var(--space-2);margin:var(--space-4) 0;border-bottom:1px solid var(--border);padding-bottom:var(--space-3)}.mod-menu-groups .active{background:var(--accent-soft);color:var(--accent);border-color:var(--accent)}.mod-config-text{width:100%;font-family:monospace;resize:vertical;line-height:1.7}.config-error{color:var(--danger);font-size:var(--text-sm);white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:1000px){.mod-menu-layout{grid-template-columns:220px minmax(0,1fr)}}@media(max-width:780px){.mod-menu-layout{grid-template-columns:1fr}.mod-menu-list{position:static;max-height:250px}.mod-menu-parameters{padding:var(--space-3)}}
</style>
