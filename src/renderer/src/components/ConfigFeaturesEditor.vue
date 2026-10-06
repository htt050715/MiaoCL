<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConfigNode } from '@shared/clientConfigs'
import { configChild, configEnabled, configFeatures } from '@shared/configFeatures'
import ConfigNodeEditor from './ConfigNodeEditor.vue'
import ClickUiSetting from './ClickUiSetting.vue'
import { slimefunLabel, slimefunDescription, slimefunOptions, slimefunNodeSearchText } from '../utils/slimefunLabels'

type RuntimeModule = { name: string; title: string; category: string; addon: string }
type SettingGroup = { key: string; label: string; node: ConfigNode; path: string[]; settings?: { key: string; node: ConfigNode }[] }
type Setting = { key: string; node: ConfigNode; label: string; path?: string[]; description?: string; options?: string[]; min?: number; max?: number }
const props = defineProps<{ root: ConfigNode; meteor: boolean; search: string; disabled?: boolean; modules?: RuntimeModule[] }>()
const emit = defineEmits<{ change: [] }>()
const enabledOnly = ref(false), selected = ref(''), selectedGroup = ref(''), page = ref(0)
const features = computed(() => configFeatures(props.root, props.meteor))
const visible = computed(() => features.value.filter(feature => {
  if (enabledOnly.value && feature.enabled <= 0) return false
  if (!props.search) return true
  const title = props.meteor ? props.modules?.find(module => module.name === feature.name)?.title : slimefunLabel([feature.name])
  const parameters = props.meteor ? JSON.stringify(feature.node) : slimefunNodeSearchText(feature.node, [feature.name])
  return `${feature.name} ${title ?? ''} ${parameters}`.toLowerCase().includes(props.search.toLowerCase())
}))
const current = computed(() => features.value.find(feature => feature.name === selected.value))
const title = (name: string) => props.meteor ? props.modules?.find(module => module.name === name)?.title || name : slimefunLabel([name], name)
const groups = computed<SettingGroup[]>(() => {
  const module = current.value?.node
  if (!module) return []
  if (props.meteor) return (configChild(configChild(module, 'settings'), 'groups')?.children ?? []).map(group => ({ key: group.key, label: String(configChild(group.node, 'name')?.value ?? group.key), node: group.node, path: [], settings: configChild(group.node, 'settings')?.children ?? [] }))
  const scalar = (module.children ?? []).filter(child => !child.node.children)
  const nested = (module.children ?? []).filter(child => child.node.children)
  const path = [current.value!.name]
  return [...(scalar.length ? [{ key: '__general', label: '常规', path, node: { type: 'object', children: scalar } as ConfigNode }] : []), ...nested.map(group => ({ key: group.key, label: slimefunLabel([...path, group.key], group.key), path: [...path, group.key], node: group.node }))]
})
const activeGroup = computed(() => groups.value.find(group => group.key === selectedGroup.value) ?? groups.value[0])
const settings = computed<Setting[]>(() => {
  const group = activeGroup.value
  if (!group) return []
  if (props.meteor) return (group.settings ?? []).map(setting => {
    const value = configChild(setting.node, 'value') ?? setting.node
    return { key: setting.key, node: value, label: String(value.title ?? configChild(setting.node, 'name')?.value ?? setting.key), description: value.description, options: value.options, min: value.min, max: value.max }
  })
  return (group.node.children ?? []).map(child => {
    const path = [...group.path, child.key]
    return { key: child.key, node: child.node, path, label: slimefunLabel(path, child.key), description: slimefunDescription(path), options: child.node.options ?? slimefunOptions(child.node.value) }
  })
})
watch(() => [props.root, props.search, enabledOnly.value], () => { page.value = 0; if (!visible.value.some(feature => feature.name === selected.value)) selected.value = visible.value[0]?.name ?? '' }, { immediate: true })
watch(() => [selected.value, groups.value.map(group => group.key).join('|')], () => { if (!groups.value.some(group => group.key === selectedGroup.value)) selectedGroup.value = groups.value[0]?.key ?? '' }, { immediate: true })
function toggle(node: ConfigNode, event: Event) { node.value = node.type === 'byte' ? Number((event.target as HTMLInputElement).checked) : (event.target as HTMLInputElement).checked; emit('change') }
</script>
<template>
  <div class="clickui-editor">
    <div class="feature-heading"><span>共 {{ features.length }} 个模块 · 已启用 {{ features.filter(feature => feature.enabled > 0).length }} 个</span><label class="feature-filter"><input v-model="enabledOnly" type="checkbox" /> 只看已启用</label></div>
    <div class="feature-layout">
      <nav class="feature-list" aria-label="模块列表">
        <button v-for="feature in visible.slice(page * 40, (page + 1) * 40)" :key="feature.name" class="feature-row" :class="{ selected: selected === feature.name }" @click="selected = feature.name"><span class="feature-dot" :class="{ on: feature.enabled > 0 }" /><span><strong>{{ title(feature.name) }}</strong><small>{{ props.meteor ? (feature.enabled ? '已启用' : '已关闭') : `已开启 ${feature.enabled} 个参数` }} · {{ feature.name }}</small></span></button>
        <p v-if="!visible.length" class="muted">没有匹配的模块</p>
        <div v-if="visible.length > 40" class="feature-pages"><button class="btn btn-ghost btn-sm" :disabled="page === 0" @click="page--">上一页</button><span>{{ page + 1 }} / {{ Math.ceil(visible.length / 40) }}</span><button class="btn btn-ghost btn-sm" :disabled="(page + 1) * 40 >= visible.length" @click="page++">下一页</button></div>
      </nav>
      <section v-if="current" class="feature-parameters">
        <header class="feature-title"><div><h3>{{ title(current.name) }}</h3><small class="muted">{{ props.meteor ? `${modules?.find(module => module.name === current!.name)?.category ?? ''} ${modules?.find(module => module.name === current!.name)?.addon ?? ''}` : current.name }}</small></div><label v-if="current.active" class="switch"><input type="checkbox" :checked="configEnabled(current.active)" :disabled="disabled" @change="toggle(current.active, $event)" /><span class="switch-ui" /></label></header>
        <div v-if="groups.length" class="group-tabs" role="tablist"><button v-for="group in groups" :key="group.key" class="group-tab" :class="{ active: activeGroup?.key === group.key }" @click="selectedGroup = group.key">{{ group.label }}</button></div>
        <div v-if="activeGroup" class="settings-panel"><div class="settings-heading"><strong>{{ activeGroup.label }}</strong><span class="muted">{{ settings.length }} 项</span></div><ClickUiSetting v-for="setting in settings" :key="setting.key" :node="setting.node" :label="setting.label" :slimefun="!meteor" :label-path="setting.path" :description="setting.description" :options="setting.options" :min="setting.min" :max="setting.max" :disabled="disabled" @change="emit('change')" /><p v-if="!settings.length" class="muted">这个参数组当前没有可视化字段。</p></div>
        <details class="advanced-config"><summary>查看完整配置结构</summary><ConfigNodeEditor :node="current.node" :label="current.name" :slimefun="!meteor" :label-path="meteor ? undefined : [current.name]" :disabled="disabled" :expanded-depth="2" @change="emit('change')" /></details>
      </section>
    </div>
  </div>
</template>
<style scoped>
.feature-heading,.feature-title,.feature-pages,.settings-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.feature-heading{padding:12px 0;font-size:var(--text-sm);color:var(--text-dim)}.feature-filter{display:flex;gap:6px;align-items:center}.feature-layout{display:grid;grid-template-columns:minmax(190px,250px) minmax(0,1fr);gap:16px}.feature-list{max-height:620px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-md);padding:6px;background:var(--card-2)}.feature-row{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;color:var(--text);text-align:left;padding:12px 10px;border-radius:var(--radius-sm);cursor:pointer}.feature-row:hover{background:var(--hover)}.feature-row.selected{background:var(--accent-soft);color:var(--accent)}.feature-row>span:last-child{display:grid;gap:5px;min-width:0;overflow-wrap:anywhere}.feature-row strong{font-size:var(--text-sm)}.feature-row small{font-size:12px;color:var(--text-dim)}.feature-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--text-dim)}.feature-dot.on{background:var(--success,#62d98b)}.feature-parameters{min-width:0;padding:16px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-content)}.feature-title h3{margin:0 0 5px;font-size:var(--text-md)}.feature-pages{flex-wrap:wrap;padding:10px 0}.group-tabs{display:flex;gap:7px;overflow-x:auto;padding:14px 0 10px;border-bottom:1px solid var(--border)}.group-tab{flex:none;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-2);color:var(--text-dim);padding:8px 12px;cursor:pointer}.group-tab:hover{color:var(--text);border-color:var(--border-strong)}.group-tab.active{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}.settings-panel{padding-top:6px}.settings-heading{padding:8px 0;color:var(--text-dim);font-size:var(--text-sm)}.advanced-config{margin-top:16px;padding-top:12px;border-top:1px solid var(--border);font-size:var(--text-sm)}.advanced-config summary{cursor:pointer;color:var(--accent)}@media(max-width:950px){.feature-layout{grid-template-columns:1fr}.feature-list{max-height:240px}}
</style>
