<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConfigNode } from '@shared/clientConfigs'
import { configChild, configEnabled, configFeatures } from '@shared/configFeatures'
import ConfigNodeEditor from './ConfigNodeEditor.vue'
import ClickUiSetting from './ClickUiSetting.vue'
import { slimefunLabel, slimefunDescription, slimefunOptions, slimefunNodeSearchText } from '../utils/slimefunLabels'
import { meteorModuleLabel, meteorCategoryLabel, meteorGroupLabel, meteorSettingLabel, meteorSettingDescription, meteorSettingMetadata, meteorSchema, meteorChoice, type Translations } from '../utils/meteorLabels'
type RuntimeModule = { name:string; title:string; category:string; addon:string }
type SettingGroup = { key:string; label:string; raw:string; node:ConfigNode; path:string[]; settings?:{key:string;node:ConfigNode}[]; common?:boolean }
type Setting = { key:string; node:ConfigNode; label:string; path?:string[]; description?:string; options?:string[]; optionLabels?:Record<string,string>; min?:number; max?:number; sliderMin?:number; sliderMax?:number; kind?:string; noSlider?:boolean }
const props=defineProps<{root:ConfigNode;meteor:boolean;search:string;disabled?:boolean;modules?:RuntimeModule[];translations?:Translations}>()
const emit=defineEmits<{change:[]}>()
const enabledOnly=ref(false),selected=ref(''),selectedGroup=ref(''),category=ref('all')
const translations=computed(()=>props.translations??{})
const features=computed(()=>configFeatures(props.root,props.meteor))
const moduleInfo=(name:string)=>props.modules?.find(m=>m.name===name)
const title=(name:string)=>props.meteor?meteorModuleLabel(translations.value,name,moduleInfo(name)?.title??name):slimefunLabel([name],name)
const categoryOf=(name:string)=>moduleInfo(name)?.category||meteorSchema(name)?.category||'附加模块'
const categories=computed(()=>[...new Set(features.value.map(f=>categoryOf(f.name)))].map(name=>({name,label:meteorCategoryLabel(translations.value,name),count:features.value.filter(f=>categoryOf(f.name)===name).length})))
const visible=computed(()=>features.value.filter(feature=>{
  if(props.meteor&&category.value!=='all'&&categoryOf(feature.name)!==category.value)return false
  if(enabledOnly.value&&feature.enabled<=0)return false
  if(!props.search.trim())return true
  const parameters=props.meteor?`${JSON.stringify(feature.node)} ${(configChild(configChild(feature.node,'settings'),'groups')?.children??[]).flatMap(g=>(configChild(g.node,'settings')?.children??[]).map(s=>{const name=String(configChild(s.node,'name')?.value??s.key);return meteorSettingLabel(translations.value,feature.name,name)+' '+meteorSettingDescription(translations.value,feature.name,name)})).join(' ')}`:slimefunNodeSearchText(feature.node,[feature.name])
  return `${feature.name} ${title(feature.name)} ${parameters}`.toLowerCase().includes(props.search.trim().toLowerCase())
}))
const current=computed(()=>features.value.find(f=>f.name===selected.value))
const groups=computed<SettingGroup[]>(()=>{
  const module=current.value?.node;if(!module)return []
  if(props.meteor){
    const list=(configChild(configChild(module,'settings'),'groups')?.children??[]).map(group=>{const raw=String(configChild(group.node,'name')?.value??group.key);return{key:group.key,raw,label:meteorGroupLabel(translations.value,raw),node:group.node,path:[],settings:configChild(group.node,'settings')?.children??[]}})
    const common=(module.children??[]).filter(c=>['keybind','toggleOnBindRelease','chatFeedback','favorite'].includes(c.key))
    return [...list,...(common.length?[{key:'__module',raw:'Bind',label:'模块与快捷键',node:{type:'compound',children:common},path:[],common:true}]:[])]
  }
  const scalar=(module.children??[]).filter(c=>!c.node.children),nested=(module.children??[]).filter(c=>c.node.children),path=[current.value!.name]
  return [...(scalar.length?[{key:'__general',raw:'General',label:'常规',path,node:{type:'object',children:scalar}}]:[]),...nested.map(g=>({key:g.key,raw:g.key,label:slimefunLabel([...path,g.key],g.key),path:[...path,g.key],node:g.node}))]
})
const activeGroup=computed(()=>groups.value.find(g=>g.key===selectedGroup.value)??groups.value[0])
const settings=computed<Setting[]>(()=>{
  const group=activeGroup.value;if(!group)return []
  if(props.meteor){
    if(group.common)return(group.node.children??[]).map(c=>({key:c.key,node:c.node,label:({keybind:'绑定快捷键',toggleOnBindRelease:'松开按键时切换',chatFeedback:'聊天反馈',favorite:'加入收藏'} as Record<string,string>)[c.key],kind:c.key==='keybind'?'KeybindSetting':undefined}))
    return(group.settings??[]).map(s=>{
      const node=configChild(s.node,'value')??s.node,name=String(configChild(s.node,'name')?.value??s.key),fallback=meteorSettingMetadata(current.value!.name,group.raw,name,translations.value,node),options=node.options??fallback?.options,enumType=node.enumType??fallback?.enumType,enumNames=node.enumNames??fallback?.enumNames
      return{key:s.key,node,label:meteorSettingLabel(translations.value,current.value!.name,name,node.title??name),description:meteorSettingDescription(translations.value,current.value!.name,name,node.description),options,optionLabels:Object.fromEntries((options??[]).map(v=>[v,meteorChoice(translations.value,v,enumType,enumNames)])),min:node.min??fallback?.min,max:node.max??fallback?.max,sliderMin:node.sliderMin??fallback?.sliderMin,sliderMax:node.sliderMax??fallback?.sliderMax,noSlider:node.noSlider??fallback?.noSlider,kind:node.kind??fallback?.kind}
    }).filter(s=>!props.search.trim()||`${s.label} ${s.description??''} ${JSON.stringify(s.node)}`.toLowerCase().includes(props.search.trim().toLowerCase())||title(current.value!.name).toLowerCase().includes(props.search.trim().toLowerCase()))
  }
  return(group.node.children??[]).map(c=>{const path=[...group.path,c.key];return{key:c.key,node:c.node,path,label:slimefunLabel(path,c.key),description:slimefunDescription(path),options:c.node.options??slimefunOptions(c.node.value)}})
})
watch(()=>[props.meteor,categories.value.map(c=>c.name).join('|')],()=>{if(!props.meteor||!categories.value.some(c=>c.name===category.value))category.value='all'})
watch(visible,()=>{if(!visible.value.some(f=>f.name===selected.value))selected.value=visible.value[0]?.name??''},{immediate:true})
watch(()=>[selected.value,groups.value.map(g=>g.key).join('|')],()=>{if(!groups.value.some(g=>g.key===selectedGroup.value))selectedGroup.value=groups.value[0]?.key??''},{immediate:true})
function toggle(node:ConfigNode,event:Event){node.value=node.type==='byte'?Number((event.target as HTMLInputElement).checked):(event.target as HTMLInputElement).checked;emit('change')}
</script>
<template>
  <div class="clickui-editor">
    <div class="feature-heading"><span>共 {{features.length}} 个模块 · 已启用 {{features.filter(f=>f.enabled>0).length}} 个</span><label class="feature-filter"><input v-model="enabledOnly" type="checkbox"/> 只看已启用</label></div>
    <div class="feature-layout" :class="{'with-categories':meteor}">
      <nav v-if="meteor" class="category-list" aria-label="模块分类"><strong class="rail-title">模块分类</strong><button class="category-row" :class="{selected:category==='all'}" @click="category='all'"><span>全部模块</span><small>{{features.length}}</small></button><button v-for="c in categories" :key="c.name" class="category-row" :class="{selected:category===c.name}" @click="category=c.name"><span>{{c.label}}</span><small>{{c.count}}</small></button></nav>
      <nav class="feature-list" aria-label="模块列表"><strong class="rail-title">{{meteor&&category!=='all'?meteorCategoryLabel(translations,category):'模块'}} <small>{{visible.length}}</small></strong><button v-for="feature in visible" :key="feature.name" class="feature-row" :class="{selected:selected===feature.name}" @click="selected=feature.name"><span class="feature-dot" :class="{on:feature.enabled>0}"/><span><strong>{{title(feature.name)}}</strong><small>{{meteor?(feature.enabled?'已启用':'已关闭'):`已开启 ${feature.enabled} 个参数`}} · {{feature.name}}</small></span></button><p v-if="!visible.length" class="muted rail-empty">没有匹配的模块</p></nav>
      <section v-if="current" class="feature-parameters">
        <header class="feature-title"><div><small class="muted">{{meteor?meteorCategoryLabel(translations,categoryOf(current.name)):'SlimefunHelper'}}</small><h3>{{title(current.name)}}</h3><small class="muted">{{current.name}}<template v-if="meteor&&moduleInfo(current.name)?.addon"> · {{moduleInfo(current.name)?.addon}}</template></small></div><label v-if="current.active" class="switch"><input type="checkbox" :aria-label="'启用 '+title(current.name)" :checked="configEnabled(current.active)" :disabled="disabled" @change="toggle(current.active,$event)"/><span class="switch-ui"/></label></header>
        <div v-if="groups.length" class="group-tabs" role="tablist"><button v-for="group in groups" :key="group.key" role="tab" :aria-selected="activeGroup?.key===group.key" class="group-tab" :class="{active:activeGroup?.key===group.key}" @click="selectedGroup=group.key">{{group.label}}</button></div>
        <div v-if="activeGroup" class="settings-panel"><div class="settings-heading"><strong>{{activeGroup.label}}</strong><span class="muted">{{settings.length}} 项</span></div><ClickUiSetting v-for="setting in settings" :key="setting.key" :node="setting.node" :label="setting.label" :slimefun="!meteor" :label-path="setting.path" :description="setting.description" :options="setting.options" :option-labels="setting.optionLabels" :min="setting.min" :max="setting.max" :slider-min="setting.sliderMin" :slider-max="setting.sliderMax" :no-slider="setting.noSlider" :kind="setting.kind" :disabled="disabled" @change="emit('change')"/><p v-if="!settings.length" class="muted">这个参数组没有匹配的设置。</p></div>
        <details class="advanced-config"><summary>查看完整配置结构</summary><ConfigNodeEditor :node="current.node" :label="current.name" :slimefun="!meteor" :label-path="meteor?undefined:[current.name]" :disabled="disabled" :expanded-depth="2" @change="emit('change')"/></details>
      </section><div v-else class="feature-parameters muted">选择分类和模块后查看具体参数。</div>
    </div>
  </div>
</template>
<style scoped>
.feature-heading,.feature-title,.settings-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.feature-heading{padding:12px 0;font-size:var(--text-sm);color:var(--text-dim)}.feature-filter{display:flex;gap:6px;align-items:center}.feature-layout{display:grid;grid-template-columns:minmax(185px,235px) minmax(0,1fr);gap:14px;align-items:start}.feature-layout.with-categories{grid-template-columns:145px minmax(185px,225px) minmax(0,1fr)}.category-list,.feature-list{max-height:calc(100vh - 280px);min-height:270px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-md);padding:6px;background:var(--card-2);position:sticky;top:10px}.rail-title{display:flex;justify-content:space-between;padding:12px 10px;font-size:var(--text-sm);color:var(--text-dim)}.rail-title small{font-weight:400}.rail-empty{padding:10px;font-size:var(--text-sm)}.category-row,.feature-row{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;color:var(--text);text-align:left;padding:12px 10px;border-radius:var(--radius-sm);cursor:pointer}.category-row{justify-content:space-between;font-size:var(--text-sm)}.category-row small{color:var(--text-dim)}.category-row:hover,.feature-row:hover{background:var(--hover)}.category-row.selected,.feature-row.selected{background:var(--accent-soft);color:var(--accent)}.feature-row>span:last-child{display:grid;gap:5px;min-width:0;overflow-wrap:anywhere}.feature-row strong{font-size:var(--text-sm)}.feature-row small{font-size:12px;color:var(--text-dim)}.feature-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--text-dim)}.feature-dot.on{background:var(--success,#62d98b)}.feature-parameters{min-width:0;padding:18px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-content)}.feature-title h3{margin:6px 0;font-size:var(--text-lg)}.group-tabs{display:flex;gap:7px;overflow-x:auto;padding:16px 0 12px;border-bottom:1px solid var(--border)}.group-tab{flex:none;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-2);color:var(--text-dim);padding:8px 12px;cursor:pointer}.group-tab:hover{color:var(--text);border-color:var(--border-strong)}.group-tab.active{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}.settings-panel{padding-top:8px}.settings-heading{padding:8px 0;color:var(--text-dim);font-size:var(--text-sm)}.advanced-config{margin-top:18px;padding-top:14px;border-top:1px solid var(--border);font-size:var(--text-sm)}.advanced-config summary{cursor:pointer;color:var(--accent)}@media(max-width:1100px){.feature-layout.with-categories{grid-template-columns:175px minmax(0,1fr)}.with-categories .category-list{grid-column:1/-1;display:flex;gap:5px;min-height:0;max-height:none;position:static;overflow-x:auto}.category-list .category-row{width:auto;flex:none;gap:8px}.category-list .rail-title{display:none}}@media(max-width:780px){.feature-layout,.feature-layout.with-categories{grid-template-columns:1fr}.feature-list{min-height:0;max-height:220px;position:static}.feature-parameters{padding:14px}}
</style>
