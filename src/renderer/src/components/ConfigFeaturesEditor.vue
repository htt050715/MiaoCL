<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {ConfigNode} from '@shared/clientConfigs'
import {configChild,configEnabled,configFeatures} from '@shared/configFeatures'
import ConfigNodeEditor from './ConfigNodeEditor.vue'
const props=defineProps<{root:ConfigNode;meteor:boolean;search:string;disabled?:boolean;modules?:{name:string;title:string;category:string;addon:string}[]}>()
const emit=defineEmits<{change:[]}>()
const enabledOnly=ref(false),selected=ref(''),page=ref(0)
const features=computed(()=>configFeatures(props.root,props.meteor))
const visible=computed(()=>features.value.filter(f=>(!enabledOnly.value||f.enabled>0)&&(!props.search||(f.name+' '+props.modules?.find(m=>m.name===f.name)?.title+' '+JSON.stringify(f.node)).toLowerCase().includes(props.search.toLowerCase()))))
const current=computed(()=>features.value.find(f=>f.name===selected.value))
const groups=computed(()=>configChild(configChild(current.value?.node,'settings'),'groups')?.children??[])
watch(()=>[props.root,props.search,enabledOnly.value],()=>{page.value=0;if(!visible.value.some(f=>f.name===selected.value))selected.value=visible.value[0]?.name??''},{immediate:true})
const title=(name:string)=>props.modules?.find(m=>m.name===name)?.title||name
function toggle(node:ConfigNode,event:Event){node.value=node.type==='byte'?Number((event.target as HTMLInputElement).checked):(event.target as HTMLInputElement).checked;emit('change')}
</script>
<template>
  <div class="feature-heading"><span>共 {{ features.length }} 项 · {{ meteor?'已启用模块':'含已开启参数的功能' }} {{ features.filter(f=>f.enabled>0).length }} 项</span><label class="feature-filter"><input v-model="enabledOnly" type="checkbox"/> 只看已启用</label></div>
  <div class="feature-layout">
    <div class="feature-list"><button v-for="f in visible.slice(page*40,(page+1)*40)" :key="f.name" class="feature-row" :class="{selected:selected===f.name}" @click="selected=f.name"><span class="feature-dot" :class="{on:f.enabled>0}"/><span><strong>{{title(f.name)}}</strong><small>{{meteor?(f.enabled?'已启用':'已关闭'):'已开启 '+f.enabled+' 个参数'}} · {{f.name}}</small></span></button><p v-if="!visible.length" class="muted">没有匹配的功能</p><div v-if="visible.length>40" class="feature-pages"><button class="btn btn-ghost btn-sm" :disabled="page===0" @click="page--">上一页</button><span>{{page+1}} / {{Math.ceil(visible.length/40)}}</span><button class="btn btn-ghost btn-sm" :disabled="(page+1)*40>=visible.length" @click="page++">下一页</button></div></div>
    <div v-if="current" class="feature-parameters">
      <div class="feature-title"><div><h3>{{title(current.name)}}</h3><small class="muted">{{modules?.find(m=>m.name===current!.name)?.category}} {{modules?.find(m=>m.name===current!.name)?.addon}}</small></div><label v-if="current.active" class="switch"><input type="checkbox" :aria-label="'启用 '+current.name" :checked="configEnabled(current.active)" :disabled="disabled" @change="toggle(current.active,$event)"/><span class="switch-ui"/></label></div>
      <p class="muted">修改后点击保存，可选择立即热重载。</p>
      <template v-if="meteor&&groups.length"><section v-for="group in groups" :key="group.key" class="parameter-group"><h4>{{configChild(group.node,'name')?.value}}</h4><ConfigNodeEditor v-for="setting in configChild(group.node,'settings')?.children??[]" :key="current.name+group.key+setting.key" :node="configChild(setting.node,'value')??setting.node" :label="String(configChild(setting.node,'name')?.value??setting.key)" :disabled="disabled" :expanded-depth="3" @change="emit('change')"/></section></template>
      <ConfigNodeEditor v-else :key="current.name" :node="meteor?(configChild(current.node,'settings')??current.node):current.node" :label="'具体参数'" :disabled="disabled" :expanded-depth="3" @change="emit('change')"/>
      <p v-if="meteor&&!groups.length" class="muted">磁盘配置省略了默认参数。连接游戏并刷新后可读取完整参数；模块开关仍可编辑。</p>
      <details v-if="meteor"><summary>按键、收藏与其他设置</summary><ConfigNodeEditor :node="current.node" :label="current.name" :disabled="disabled" @change="emit('change')"/></details>
    </div>
  </div>
</template>
<style scoped>
.feature-heading,.feature-title,.feature-pages{display:flex;align-items:center;justify-content:space-between;gap:12px}.feature-heading{padding:12px 0;font-size:var(--text-sm);color:var(--text-dim)}.feature-filter{display:flex;gap:6px;align-items:center}.feature-layout{display:grid;grid-template-columns:minmax(160px,230px) minmax(0,1fr);gap:16px}.feature-list{max-height:580px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-md);padding:6px;background:var(--card-2)}.feature-row{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;color:var(--text);text-align:left;padding:12px 10px;border-radius:var(--radius-sm);cursor:pointer}.feature-row:hover{background:var(--hover)}.feature-row.selected{background:var(--accent-soft);color:var(--accent)}.feature-row>span:last-child{display:grid;gap:5px;min-width:0;overflow-wrap:anywhere}.feature-row strong{font-size:var(--text-sm)}.feature-row small{font-size:12px;color:var(--text-dim)}.feature-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--text-dim)}.feature-dot.on{background:var(--success,#62d98b)}.feature-parameters{min-width:0;padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-content)}.feature-title h3{margin:0 0 5px;font-size:var(--text-md)}.feature-parameters p,.feature-parameters details,.feature-pages{font-size:var(--text-sm)}.feature-pages{flex-wrap:wrap;padding:10px 0}@media(max-width:950px){.feature-layout{grid-template-columns:1fr}.feature-list{max-height:240px}}
.parameter-group{margin:18px 0}.parameter-group h4{font-size:var(--text-sm);color:var(--accent);margin:0 0 8px;padding-bottom:8px;border-bottom:1px solid var(--border)}
</style>
