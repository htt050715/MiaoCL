<script setup lang="ts">
import { designIdentity } from '@shared/visualDesign'

import {computed,onUnmounted,ref,watch} from 'vue'
import {getLiveKeys,setLiveKey,errText} from '../api'
import {selectedInstance,displayVersionName,toast} from '../store'
import {codeToMcKey,mouseButtonToMcKey,VANILLA_KEYBINDS} from '@shared/keybindings'
import {emptyBinding,liveBindingLabel,sameBinding} from '@shared/liveKeybindings'
import type {LiveBinding,LiveKeybinding,LiveKeysSnapshot} from '@shared/liveKeybindings'
import {slimefunLabel} from '../utils/slimefunLabels'
import {meteorCategoryLabel,meteorModuleLabel,meteorSettingLabel} from '../utils/meteorLabels'

const props=defineProps<{active:boolean}>()
const target=computed(()=>selectedInstance.value?{id:selectedInstance.value.id,folder:selectedInstance.value.folder}:undefined)
const snapshot=ref<LiveKeysSnapshot>(),error=ref(''),busy=ref(false),refreshing=ref(false),search=ref(''),category=ref(''),updated=ref('')
const capturing=ref('')
let epoch=0,timer:ReturnType<typeof setTimeout>|undefined,disposed=false
let capture:{item:LiveKeybinding;base:LiveBinding;session:string;keys:string[]}|undefined
const clone=(binding:LiveBinding):LiveBinding=>({...binding,keys:[...binding.keys]})
const translations=computed(()=>snapshot.value?.meteorTranslations??{})
function label(item:LiveKeybinding) {
  if(item.kind==='slime')return slimefunLabel(item.path??[],item.label)
  if(item.kind==='meteor')return meteorModuleLabel(translations.value,item.module??'',item.label.split(' · ')[0])+' · '+(item.setting?meteorSettingLabel(translations.value,item.module??'',item.setting):'开关快捷键')
  return VANILLA_KEYBINDS.find(def=>def.id===item.id)?.label??item.label
}
function group(item:LiveKeybinding) {return item.kind==='meteor'?'彗星 · '+meteorCategoryLabel(translations.value,item.category.replace(/^彗星 · /,'')):item.kind==='vanilla'?VANILLA_KEYBINDS.find(def=>def.id===item.id)?.category??item.category:item.category}
const groups=computed(()=>[...new Set(snapshot.value?.items.map(group)??[])])
const items=computed(()=>{
  const term=search.value.trim().toLowerCase()
  return (snapshot.value?.items??[]).filter(item=>(!category.value||group(item)===category.value)&&(!term||`${label(item)} ${item.id} ${liveBindingLabel(item.binding)}`.toLowerCase().includes(term)))
})
function conflict(item:LiveKeybinding) {return item.binding.keys.length>0 && (snapshot.value?.items??[]).some(other=>other.id!==item.id&&other.kind===item.kind&&sameBinding(item.binding,other.binding))}
function schedule(delay=1000){clearTimeout(timer);if(props.active&&!disposed)timer=setTimeout(()=>void refresh(),delay)}
async function refresh(){
  const current=target.value,request=epoch
  if(!props.active||!current||busy.value||refreshing.value){schedule();return}
  refreshing.value=true
  try{
    const next=await getLiveKeys(current.id,current.folder)
    if(request!==epoch||disposed)return
    if(snapshot.value?.session&&snapshot.value.session!==next.session)stopCapture()
    snapshot.value=next;error.value='';updated.value=new Date().toLocaleTimeString('zh-CN',{hour12:false})
    if(category.value&&!groups.value.includes(category.value))category.value=''
  }catch(e){if(request===epoch&&!disposed){error.value=errText(e);stopCapture()}}
  finally{if(request===epoch&&!disposed){refreshing.value=false;schedule(error.value?3000:1000)}}
}
async function save(item:LiveKeybinding,binding:LiveBinding,base=clone(item.binding),session=snapshot.value?.session){
  const current=target.value
  if(!current||!session||busy.value||error.value||!props.active)return
  // Invalidate any snapshot already in flight, so it cannot replace the mutation reply.
  ++epoch;const writeEpoch=epoch;clearTimeout(timer);busy.value=true;refreshing.value=false
  try{
    const next=await setLiveKey(current.id,current.folder,session,item.id,base,binding)
    if(writeEpoch!==epoch||disposed)return
    snapshot.value=next;updated.value=new Date().toLocaleTimeString('zh-CN',{hour12:false});toast('键位已在游戏内生效并保存','success')
  }catch(e){if(writeEpoch===epoch&&!disposed)toast('设置失败：'+errText(e),'error')}
  finally{if(writeEpoch===epoch&&!disposed){busy.value=false;void refresh()}}
}
function stopCapture(){capturing.value='';capture=undefined;removeEventListener('keydown',onKey,true);removeEventListener('keyup',onKeyUp,true);removeEventListener('mousedown',onMouse,true)}
function startCapture(item:LiveKeybinding){
  if(busy.value||error.value||!snapshot.value)return
  stopCapture();capturing.value=item.id;capture={item,base:clone(item.binding),session:snapshot.value.session,keys:[]}
  addEventListener('keydown',onKey,true);addEventListener('keyup',onKeyUp,true);addEventListener('mousedown',onMouse,true)
}
function modifiers(event:KeyboardEvent|MouseEvent){return (event.shiftKey?1:0)|(event.ctrlKey?2:0)|(event.altKey?4:0)|(event.metaKey?8:0)}
function modifierKey(code:string){return /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(code)}
function commitCapture(keys:string[],mods=0){
  const state=capture;if(!state)return
  const binding:LiveBinding={...state.base,keys,modifiers:state.item.kind==='meteor'?mods:0}
  stopCapture();void save(state.item,binding,state.base,state.session)
}
function onKey(event:KeyboardEvent){
  event.preventDefault();event.stopImmediatePropagation()
  if(event.key==='Escape'){stopCapture();return}
  const key=codeToMcKey(event.code),state=capture;if(!key||!state)return
  if(state.item.kind==='slime'){
    for(const [pressed,name] of [[event.ctrlKey,'key.keyboard.left.control'],[event.shiftKey,'key.keyboard.left.shift'],[event.altKey,'key.keyboard.left.alt'],[event.metaKey,'key.keyboard.left.win']] as const){if(pressed&&!state.keys.some(k=>k.includes(name.replace('left.','right.'))||k===name))state.keys.push(name)}
    // Replace the generic modifier with its actual left/right variant when captured.
    if(modifierKey(event.code))state.keys=state.keys.filter(k=>k!==key.replace('right.','left.'))
    if(!state.keys.includes(key))state.keys.push(key)
    return
  }
  if(state.item.kind==='meteor'&&modifierKey(event.code)){state.keys=[key];return}
  commitCapture([key],modifiers(event))
}
function onKeyUp(event:KeyboardEvent){
  event.preventDefault();event.stopImmediatePropagation()
  if(!capture?.keys.length)return
  commitCapture([...capture.keys])
}
function onMouse(event:MouseEvent){
  if((event.target as Element)?.closest('[data-live-key-clear]'))return
  event.preventDefault();event.stopImmediatePropagation()
  const key=mouseButtonToMcKey(event.button);if(!key||!capture)return
  commitCapture(capture.item.kind==='slime'?[...capture.keys,key]:[key])
}
function clearCapture(){const state=capture;if(!state)return;stopCapture();void save(state.item,{...state.base,keys:[],modifiers:0},state.base,state.session)}
watch(()=>[props.active,target.value?.id,target.value?.folder],()=>{
  ++epoch;clearTimeout(timer);stopCapture();snapshot.value=undefined;busy.value=false;refreshing.value=false;error.value='';updated.value='';category.value=''
  if(props.active)void refresh()
},{immediate:true})
onUnmounted(()=>{disposed=true;++epoch;clearTimeout(timer);stopCapture()})
</script>

<template>
  <div class="live-keys" data-live-keys data-design-page="live">
    <div class="live-key-status"><div><strong>{{selectedInstance?displayVersionName(selectedInstance):'请选择游戏实例'}}</strong><p class="muted">{{error|| (updated?`双向同步中 · ${snapshot?.items.length??0} 个绑定 · 更新于 ${updated}`:'正在连接游戏…')}}</p></div><button class="btn btn-ghost btn-sm" :disabled="busy||refreshing||!target" @click="refresh">重新读取</button></div>
    <p class="muted live-key-hint">修改后立即在所选游戏内生效，游戏按键菜单和模组菜单中的改动也会自动回到这里。原版与普通模组支持单键，彗星支持修饰键，史莱姆支持组合键。</p>
    <p v-for="warning in snapshot?.warnings" :key="warning" class="muted">{{warning}}</p>
    <div v-if="snapshot" class="live-key-layout">
      <nav class="live-key-categories" aria-label="游戏键位分类"><button class="btn btn-ghost" :class="{active:!category}" data-design-nav @click="category=''">全部绑定</button><button v-for="name in groups" :key="name" :data-design-key="designIdentity(name)" data-design-nav class="btn btn-ghost" :class="{active:category===name}" @click="category=name">{{name}}</button></nav>
      <div class="live-key-settings"><input data-design-nav v-model="search" class="input" placeholder="搜索名称、模组或快捷键…"/>
        <div v-for="item in items" :key="item.id" :data-design-key="designIdentity(item.id)" class="live-key-row" :data-live-key="item.id">
          <div class="live-key-copy"><strong>{{label(item)}}</strong><small class="muted">{{group(item)}}{{conflict(item)?' · 与其他功能共用按键':''}}</small>
            <div v-if="item.kind==='slime'" class="live-key-flags"><label><input type="checkbox" :checked="item.binding.release" :disabled="busy||!!error||!!capturing" @change="save(item,{...clone(item.binding),release:($event.target as HTMLInputElement).checked})"/>松开时触发</label><label><input type="checkbox" :checked="item.binding.passThrough" :disabled="busy||!!error||!!capturing" @change="save(item,{...clone(item.binding),passThrough:($event.target as HTMLInputElement).checked})"/>允许原版操作</label></div>
          </div>
          <button class="cfg-bind" :class="{capturing:capturing===item.id,modified:item.defaultBinding&&!sameBinding(item.binding,item.defaultBinding)}" :disabled="busy||!!error" :title="capturing===item.id?'按键后松开，Esc 取消':'点击录制快捷键'" @click="startCapture(item)">{{capturing===item.id?'按键后松开…':liveBindingLabel(item.binding)}}</button>
          <button v-if="capturing===item.id" class="btn btn-ghost live-key-clear" data-live-key-clear aria-label="清除快捷键" @click.stop="clearCapture">×</button>
          <button v-else-if="item.defaultBinding" class="btn btn-ghost btn-sm" :disabled="busy||!!error||sameBinding(item.binding,item.defaultBinding)" @click="save(item,clone(item.defaultBinding))">重置</button>
        </div><p v-if="!items.length" class="muted">没有匹配的键位</p>
      </div>
    </div>
    <div v-if="capturing" class="menu-overlay cfg-capture-mask" @click="stopCapture"/>
  </div>
</template>
<style scoped>
.live-key-settings{display:flex;flex-direction:column}
.live-key-status{display:flex;justify-content:space-between;align-items:center;gap:var(--space-3)}.live-key-status strong{font-size:var(--text-sm)}.live-key-status p,.live-key-hint{font-size:var(--text-xs);line-height:1.7;overflow-wrap:anywhere}.live-key-layout{display:grid;grid-template-columns:190px minmax(0,1fr);gap:var(--space-4);margin-top:var(--space-4)}.live-key-categories{display:flex;flex-direction:column;gap:var(--space-1);align-self:start;max-height:65vh;overflow:auto;padding:var(--space-2);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--card-2);position:sticky;top:0}.live-key-categories .btn{text-align:left;white-space:normal;justify-content:flex-start;overflow-wrap:anywhere}.live-key-categories .active{background:var(--accent-soft);color:var(--accent)}.live-key-settings{min-width:0}.live-key-settings>.input{width:100%;margin-bottom:var(--space-3)}.live-key-row{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-2);border-bottom:1px solid var(--border)}.live-key-copy{flex:1;min-width:0;display:grid;gap:var(--space-1);overflow-wrap:anywhere}.live-key-copy strong{font-size:var(--text-sm)}.live-key-copy small,.live-key-flags{font-size:var(--text-xs)}.live-key-flags{display:flex;gap:var(--space-3);flex-wrap:wrap;color:var(--text-dim)}.live-key-flags label{display:flex;align-items:center;gap:var(--space-1)}.cfg-bind{min-width:120px;max-width:220px;padding:var(--space-2) var(--space-3);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-2);color:var(--text);font-size:var(--text-xs);font-family:inherit;cursor:pointer;overflow-wrap:anywhere}.cfg-bind:hover{border-color:var(--accent)}.cfg-bind.modified{border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:var(--accent-soft)}.cfg-bind.capturing,.live-key-clear{position:relative;z-index:9001}.cfg-bind.capturing{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);color:var(--accent-2)}.cfg-capture-mask{z-index:9000}@media(max-width:800px){.live-key-layout{grid-template-columns:1fr}.live-key-categories{position:static;flex-direction:row;max-height:170px;flex-wrap:wrap}.live-key-row{flex-wrap:wrap}.live-key-copy{flex-basis:100%}.cfg-bind{max-width:100%}}
</style>
