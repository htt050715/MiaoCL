<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { designIdentity } from '@shared/visualDesign'

import type { ConfigNode } from '@shared/clientConfigs'
import SelectMenu from './SelectMenu.vue'
import {parseSlimeValue,writeSlimeValue} from '@shared/snbtConfig'
import {slimefunLabel,slimefunDescription,slimefunChoice,slimefunOptions,slimefunCodecLabel,slimefunCodecDescription,slimefunCodecEnum} from '../utils/slimefunLabels'
const props = defineProps<{designKey?:string;node:ConfigNode;label:string;search?:string;depth?:number;disabled?:boolean;expandedDepth?:number;slimefun?:boolean;labelPath?:string[];slimeCodec?:string}>()
const emit = defineEmits<{(e:'change'):void}>()
const encoded=ref<ReturnType<typeof parseSlimeValue>>(),rawEncoded=ref(false)
watch(()=>props.node.value,value=>{encoded.value=props.node.type==='string'&&typeof value==='string'?parseSlimeValue(value):undefined},{immediate:true})
function updateEncoded(){if(encoded.value){props.node.value=writeSlimeValue(encoded.value.prefix,encoded.value.root);emit('change')}}
const opened=ref((props.depth??0)<(props.expandedDepth??2)), page=ref(0), newKey=ref(''), newType=ref('string')
watch(()=>props.search,()=>{page.value=0})
const byteInteger=ref(false)
const container=computed(() => !!props.node.children)
const list=computed(() => ['list','array','byte-array','int-array','long-array'].includes(props.node.type))
function matches(label:string,node:ConfigNode,path:string[]=props.labelPath??[]):boolean {
  const search=props.search?.trim().toLowerCase()
  return !search || label.toLowerCase().includes(search) || props.slimefun && `${slimefunLabel(path)} ${slimefunDescription(path)??''}`.toLowerCase().includes(search) || String(node.value??'').toLowerCase().includes(search) || !!node.children?.some(c => matches(c.key,c.node,[...path,c.key]))
}
const children=computed(() => (props.node.children??[]).filter(c => matches(c.key,c.node,[...(props.labelPath??[]),c.key])))
const displayed=computed(() => children.value.slice(page.value*60,(page.value+1)*60))
const numeric=computed(() => ['byte','short','int','float','double','number'].includes(props.node.type))
const boolean=computed(() => props.node.type==='boolean' || props.node.type==='byte' && !byteInteger.value && [0,1].includes(Number(props.node.value)))
const label=computed(() => {
  const name=props.node.children?.find(c => c.key==='name')?.node.value
  const path=props.labelPath??[props.label]
  const display=props.slimefun ? props.slimeCodec ? slimefunCodecLabel(props.slimeCodec,path,props.label) : slimefunLabel(path,props.label) : props.label
  return name ? `${display} · ${name}` : display
})
const description=computed(()=>props.node.description ?? (props.slimefun ? props.slimeCodec ? slimefunCodecDescription(props.slimeCodec,props.labelPath??[]) : slimefunDescription(props.labelPath??[]) : undefined))
const enumType=computed(()=>slimefunCodecEnum(props.slimeCodec,props.labelPath??[]))
const choices=computed(()=>props.node.options ?? (props.slimefun ? slimefunOptions(props.node.value,enumType.value) : undefined))
function value(event:Event) {
  const target=event.target as HTMLInputElement
  props.node.value=boolean.value ? props.node.type==='byte' ? Number(target.checked) : target.checked : numeric.value ? Number(target.value) : target.value
  emit('change')
}
function append() {
  if (props.disabled || !props.node.children) return
  let node:ConfigNode
  const sample=props.node.children[props.node.children.length-1]?.node
  if (list.value && sample) node=structuredClone(JSON.parse(JSON.stringify(sample)))
  else if (props.node.type==='list') {
    const types=['end','byte','short','int','long','float','double','byte-array','string','list','compound','int-array','long-array']; const type=types[props.node.elementType??0]
    if (type==='end') return
    node=['compound','list','byte-array','int-array','long-array'].includes(type) ? {type,children:[],...(type==='list'?{elementType:0}:{})} : {type,value:type==='string'||type==='long'?'':0}
    if(type==='long')node.value='0'
  } else node={type:newType.value,value:newType.value==='boolean'?false:newType.value==='number'||['byte','short','int','float','double'].includes(newType.value)?0:newType.value==='long'?'0':''}
  const key=list.value ? String(props.node.children.length) : newKey.value.trim()
  if (!key || props.node.children.some(c => c.key===key)) return
  props.node.children.push({key,node}); newKey.value=''; emit('change')
}
function remove(key:string) { props.node.children=props.node.children?.filter(c => c.key!==key); if(list.value)props.node.children?.forEach((c,i)=>c.key=String(i)); emit('change') }
</script>
<template>
  <div :data-design-key="designKey" class="config-node" :class="{container}" v-if="matches(label,node)">
    <template v-if="container">
      <button data-design-nav class="config-group" :aria-expanded="opened || !!search" @click="opened=!opened"><span>{{ opened || search ? '▾' : '▸' }} {{ label }}</span><small class="muted">{{ node.type }} · {{ node.children?.length }}</small></button>
      <div v-if="opened || search" class="config-children">
        <div v-for="child in displayed" :key="child.key" :data-design-key="designIdentity(child.key)" class="config-entry">
          <ConfigNodeEditor :node="child.node" :label="child.key" :depth="(depth??0)+1" :expanded-depth="expandedDepth" :search="search" :disabled="disabled" :slimefun="slimefun" :slime-codec="slimeCodec" :label-path="[...(labelPath??[]),child.key]" @change="emit('change')"/>
          <button v-if="list" class="btn btn-ghost btn-sm" :disabled="disabled" :aria-label="'移除 '+child.key" @click="remove(child.key)">移除</button>
        </div>
        <div v-if="children.length>60" class="config-pagination"><button class="btn btn-ghost btn-sm" :disabled="page===0" data-design-nav @click="page--">上一页</button><span>{{ page+1 }} / {{ Math.ceil(children.length/60) }}</span><button class="btn btn-ghost btn-sm" :disabled="(page+1)*60>=children.length" data-design-nav @click="page++">下一页</button></div>
        <div class="config-add" v-if="list || ['object','compound'].includes(node.type)">
          <template v-if="!list"><input v-model="newKey" class="input" placeholder="新字段名称" :disabled="disabled"/><SelectMenu v-model="newType" :options="(node.type==='compound'?['string','byte','short','int','long','float','double']:['string','number','boolean']).map(t=>({value:t,label:t}))" :disabled="disabled"/></template>
          <button class="btn btn-ghost btn-sm" :disabled="disabled || node.type==='list' && node.elementType===0 && !node.children?.length" @click="append">{{ list?'添加一项':'添加字段' }}</button>
        </div>
      </div>
    </template>
    <div v-else-if="encoded&&!rawEncoded" class="config-encoded"><ConfigNodeEditor :node="encoded.root" :label="node.title||label" :depth="0" :expanded-depth="2" :disabled="disabled" :slimefun="slimefun" :slime-codec="encoded.prefix.split(':')[1]" :label-path="[]" @change="updateEncoded"/><button class="btn btn-ghost btn-sm" data-design-nav @click="rawEncoded=true">查看原始值</button></div>
    <div v-else class="config-leaf">
      <label><span>{{ node.title || label }}</span><small class="muted">{{ slimefun && label!==props.label ? props.label+' · ' : node.title ? label+' · ' : '' }}{{ node.type }}</small><small v-if="description" class="muted">{{ description }}</small></label>
      <span v-if="node.type==='binary'" class="muted">二进制文件随整包导入导出</span>
      <span v-else-if="node.type==='null'" class="muted">null</span>
      <SelectMenu v-else-if="choices?.length" :model-value="String(node.value??'')" :options="choices.map(o=>({value:o,label:slimefun?slimefunChoice(o,enumType):o}))" :disabled="disabled" @change="v=>{node.value=v;emit('change')}"/>
      <label v-else-if="boolean" class="switch"><input type="checkbox" :checked="node.value===true || node.value===1" :disabled="disabled" @change="value"/><span class="switch-ui"/></label>
      <textarea v-else-if="typeof node.value==='string' && (node.value.includes('\n') || node.value.length>120)" class="input config-value" :value="String(node.value)" :disabled="disabled" rows="3" @input="value"/>
      <input v-else class="input config-value" :type="numeric?'number':'text'" :min="node.min" :max="node.max" :step="['byte','short','int'].includes(node.type)?1:'any'" :value="node.value??''" :disabled="disabled" @input="value"/>
      <button v-if="node.type==='byte'" class="btn btn-ghost btn-sm" :disabled="disabled" @click="byteInteger=!byteInteger">{{ byteInteger?'开关':'整数' }}</button>
      <button v-if="encoded" class="btn btn-ghost btn-sm" data-design-nav @click="rawEncoded=false">结构化编辑</button>
    </div>
  </div>
</template>
<style scoped>
.config-children{display:flex;flex-direction:column}
.config-group{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;background:var(--hover);color:var(--text);border:0;border-radius:var(--radius-sm);padding:12px;text-align:left;cursor:pointer}.config-children{padding:8px 0 8px 14px;border-left:1px solid var(--border);margin-left:8px}.config-entry{display:flex;gap:8px;align-items:start;padding:3px 0}.config-node{width:100%;min-width:0}.config-leaf{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:8px 0;border-bottom:1px solid var(--border)}.config-leaf>label:first-child{min-width:0;display:flex;flex-direction:column;overflow-wrap:anywhere;font-size:var(--text-sm)}.config-value{width:min(55%,420px);min-width:160px}.config-add,.config-pagination{display:flex;gap:8px;align-items:center;padding:10px 0}.config-add .input{width:180px}.config-add :deep(.select-menu){width:110px}.config-pagination{font-size:var(--text-sm)}
</style>
