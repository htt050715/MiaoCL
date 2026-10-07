<script setup lang="ts">
import {computed} from 'vue'
import { designIdentity } from '@shared/visualDesign'

import type {ConfigNode} from '@shared/clientConfigs'
import {modSettingLabel,modSettingDescription} from '@shared/modConfigs'
import ClickUiSetting from './ClickUiSetting.vue'
const props=defineProps<{node:ConfigNode;path:string[];modId:string;translations:Record<string,string>;search:string;disabled?:boolean}>()
const emit=defineEmits<{change:[]}>()
function label(path:string[]){return modSettingLabel(props.translations,props.modId,path)}
function matches(node:ConfigNode,path:string[]):boolean {
  if(!props.search.trim())return true
  const query=props.search.trim().toLowerCase()
  return (path.join('.')+' '+label(path)+' '+modSettingDescription(props.translations,props.modId,path)+' '+String(node.value??'')).toLowerCase().includes(query)||(node.children??[]).some(c=>matches(c.node,[...path,c.key]))
}
const rows=computed(()=>(props.node.children??[]).filter(c=>matches(c.node,[...props.path,c.key])))
</script>
<template>
  <div class="mod-config-group">
  <template v-if="node.type==='object'||node.type==='compound'">
    <template v-for="row in rows" :key="row.key">
      <details v-if="row.node.type==='object'||row.node.type==='compound'" :data-design-key="designIdentity(modId,...path,row.key)" class="mod-setting-section" open><summary data-design-nav>{{label([...path,row.key])}}<small>{{row.key}}</small></summary><ModConfigGroup :node="row.node" :path="[...path,row.key]" :mod-id="modId" :translations="translations" :search="search" :disabled="disabled" @change="emit('change')"/></details>
      <div v-else-if="row.node.type==='null'" :data-design-key="designIdentity(modId,...path,row.key)" class="mod-null"><strong>{{label([...path,row.key])}}</strong><span class="muted">未设置（null）</span></div>
      <ClickUiSetting v-else :design-key="designIdentity(modId,...path,row.key)" :node="row.node" :label="label([...path,row.key])" :description="modSettingDescription(translations,modId,[...path,row.key])||row.key" :generic="true" :disabled="disabled" @change="emit('change')"/>
    </template>
    <p v-if="!rows.length" class="muted">没有匹配的设置。</p>
  </template>
  <ClickUiSetting v-else :design-key="designIdentity(modId,...path)" :node="node" :label="path.at(-1)||'配置内容'" :generic="true" :disabled="disabled" @change="emit('change')"/>
  </div>
</template>
<style scoped>
.mod-config-group{display:flex;flex-direction:column;width:100%;min-width:0}
.mod-setting-section{border-bottom:1px solid var(--border);padding:var(--space-3) 0}.mod-setting-section>summary{cursor:pointer;font-size:var(--text-sm);font-weight:600;padding:var(--space-2) 0;color:var(--text)}.mod-setting-section>summary small{font-weight:400;color:var(--text-dim);margin-left:var(--space-3)}.mod-setting-section :deep(.mod-setting-section){margin-left:var(--space-3)}.mod-null{display:flex;justify-content:space-between;gap:var(--space-3);padding:var(--space-3) 0;font-size:var(--text-sm)}
</style>
