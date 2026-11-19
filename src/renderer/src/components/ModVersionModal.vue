<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { InstalledVersion } from '@shared/types'
import type { ModVersionChoices, ModChangePlan } from '@shared/modManagement'
import { errText } from '../api'
const props=defineProps<{source:InstalledVersion;fileName?:string;fabricApi?:boolean}>(),emit=defineEmits<{(e:'close'):void;(e:'done'):void}>()
const title=props.fabricApi?'Fabric API 版本管理':'切换模组版本'
const choices=ref<ModVersionChoices>(),plan=ref<ModChangePlan>(),loading=ref(true),checking=ref(false),applying=ref(false),error=ref(''),selected=ref(''),confirmed=ref(false)
let generation=0,loadGeneration=0,disposed=false
function discard(id?:string){if(id)void window.kamucl.invoke('mods:versionDiscard',id).catch(()=>{})}
onUnmounted(()=>{disposed=true;generation++;loadGeneration++;discard(plan.value?.id);discard(choices.value?.id)})
async function load(){const g=++loadGeneration;loading.value=true;error.value='';try{const c=await window.kamucl.invoke(props.fabricApi?'mods:fabricApiChoices':'mods:versionChoices',props.source.id,props.source.folder,...(props.fabricApi?[]:[props.fileName])) as ModVersionChoices;if(disposed||g!==loadGeneration){discard(c.id);return}discard(choices.value?.id);choices.value=c}catch(e){if(!disposed&&g===loadGeneration)error.value=errText(e)}finally{if(!disposed&&g===loadGeneration)loading.value=false}}
async function select(fileId:string){const g=++generation;selected.value=fileId;discard(plan.value?.id);plan.value=undefined;checking.value=true;confirmed.value=false;error.value='';try{const p=await window.kamucl.invoke('mods:versionPlan',choices.value!.id,fileId) as ModChangePlan;if(!disposed&&g===generation)plan.value=p;else discard(p.id)}catch(e){if(!disposed&&g===generation)error.value=errText(e)}finally{if(!disposed&&g===generation)checking.value=false}}
async function apply(){if(!plan.value)return;applying.value=true;try{await window.kamucl.invoke('mods:versionApply',plan.value.id,confirmed.value);if(!disposed){emit('done');emit('close')}}catch(e){if(!disposed)error.value=errText(e)}finally{if(!disposed)applying.value=false}}
onMounted(load)
</script>
<template>
 <Teleport to="body">
  <div class="modal-mask" @pointerdown.self="!applying&&emit('close')">
   <section class="modal mod-version-modal" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc.stop="!applying&&emit('close')">
    <header><div><h2>{{title}}</h2><p class="muted">{{source.id}} · {{choices?.fileName||fileName||'Fabric API'}}</p><small v-if="choices" class="muted">{{choices.mcVersion}} · {{choices.loader}} · 当前 {{choices.currentVersion||'未知'}} · {{choices.disabled?'已禁用':'已启用'}}</small></div><button class="btn btn-ghost" :disabled="applying" aria-label="关闭" @click="emit('close')">×</button></header>
    <div class="version-content">
     <p v-if="fabricApi" class="muted">可选择适配当前 Minecraft 的新版或旧版 Fabric API，退出游戏后切换，下次启动生效。其他模组可能有额外的 API 或加载器版本要求，请核对版本说明。</p>
     <div v-if="loading" class="empty">正在识别来源并查询适配版本…</div>
     <div v-if="error" class="error" role="alert">{{error}}<button v-if="!choices" class="btn btn-ghost" @click="load">重试</button></div>
     <template v-if="choices">
      <p v-if="choices.shared" class="warning">当前使用共享模组目录，切换后会影响使用此目录的其他实例。</p>
      <div class="version-columns">
       <div class="versions-list"><button v-for="f in choices.files" :key="f.fileId" :class="{active:selected===f.fileId}" :disabled="applying" @click="select(f.fileId)"><strong>{{f.version}} <span v-if="f.version===choices.currentVersion" class="tag">当前</span></strong><small>{{f.releaseType==='release'?'正式版':f.releaseType==='beta'?'测试版':'预览版'}} · {{f.date?.slice(0,10)}}</small><small>{{f.fileName}}</small></button><p v-if="!choices.files.length">此游戏版本与加载器下没有可下载的适配文件。</p></div>
       <div class="version-detail">
        <p v-if="checking" class="muted">正在检查前置并获取版本说明…</p>
        <template v-else-if="plan">
         <h3>本次更改</h3><p>{{choices.currentVersion||'未知'}} → {{plan.target.version}}</p>
         <p v-for="f in plan.files" :key="f.fileName"><span class="tag">{{f.dependency?'新增前置':'替换模组'}}</span> {{f.fileName}}</p>
         <div v-if="plan.warnings.length" class="warning"><p v-for="w in plan.warnings" :key="w">{{w}}</p><label><input v-model="confirmed" type="checkbox">我已了解并确认本次更改</label></div>
         <h3>版本说明</h3><pre>{{plan.changelog}}</pre>
        </template>
        <p v-else class="muted">选择一个适配版本，查看说明与必要前置。</p>
       </div>
      </div>
     </template>
    </div>
    <footer><small class="muted">校验后替换，保留启停与锁定状态</small><button class="btn btn-ghost" :disabled="applying" @click="emit('close')">取消</button><button class="btn btn-gold" :disabled="!plan||checking||applying||(!!plan?.warnings.length&&!confirmed)" @click="apply">{{applying?'正在下载与替换…':'确认切换'}}</button></footer>
   </section>
  </div>
 </Teleport>
</template>
<style scoped>
.version-content>.muted,.version-content>.warning{margin:0 0 16px;font-size:12px;line-height:1.7}
.mod-version-modal{width:min(920px,calc(100vw - 48px));max-height:calc(100vh - 64px);padding:0;display:flex;flex-direction:column;overflow:hidden}.mod-version-modal header,.mod-version-modal footer{display:flex;gap:12px;align-items:center;padding:20px 24px;flex-shrink:0}.mod-version-modal header{justify-content:space-between;border-bottom:1px solid var(--border)}h2{margin:0;font-size:21px}.mod-version-modal header p{margin:7px 0;overflow-wrap:anywhere}.version-content{min-height:0;overflow:auto;padding:20px 24px}.version-columns{display:grid;grid-template-columns:300px minmax(0,1fr);gap:24px}.versions-list{max-height:430px;overflow:auto;overscroll-behavior:contain}.versions-list button{display:flex;flex-direction:column;width:100%;text-align:left;padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;gap:4px;background:var(--card-2);color:var(--text);cursor:pointer;overflow-wrap:anywhere}.versions-list button.active{background:var(--accent-soft);border-color:var(--accent)}.versions-list small{color:var(--text-dim);font-size:11px}.version-detail{min-width:0}.version-detail pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.8 inherit}.version-detail h3{font-size:14px}.version-detail p{font-size:12px;overflow-wrap:anywhere}.warning{background:var(--accent-soft);border-radius:10px;padding:12px}.error{color:var(--danger);padding-bottom:15px}.mod-version-modal footer{border-top:1px solid var(--border);justify-content:flex-end}.mod-version-modal footer small{margin-right:auto}@media(max-width:700px){.version-columns{grid-template-columns:1fr}.versions-list{max-height:220px}}
.version-detail h3{margin:0 0 8px}.version-detail h3:not(:first-child){margin-top:20px}.version-detail p{margin:0 0 8px}.version-detail pre{margin:0;font:inherit;font-size:12px;line-height:1.8}
</style>
