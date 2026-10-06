<script setup lang="ts">
import { computed } from 'vue'
import type { ConfigNode } from '@shared/clientConfigs'
import SelectMenu from './SelectMenu.vue'
import ConfigNodeEditor from './ConfigNodeEditor.vue'

const props = defineProps<{
  node: ConfigNode
  label: string
  description?: string
  options?: string[]
  min?: number
  max?: number
  disabled?: boolean
}>()
const emit = defineEmits<{ change: [] }>()
const numeric = computed(() => ['byte', 'short', 'int', 'long', 'float', 'double', 'number'].includes(props.node.type))
const boolean = computed(() => props.node.type === 'boolean' || props.node.type === 'byte' && [0, 1].includes(Number(props.node.value)))
const choices = computed(() => props.options?.length ? props.options : props.node.options)
const hasRange = computed(() => numeric.value && Number.isFinite(props.min) && Number.isFinite(props.max) && Number(props.max) > Number(props.min))
const text = computed(() => String(props.node.value ?? ''))
const isKeybind = computed(() => /^hotkey:/i.test(text.value) || /按键|快捷键|keybind|hotkey/i.test(props.label))
const isColor = computed(() => /color|颜色/i.test(props.label) || /wrapcolor/i.test(text.value))
const color = computed(() => { const match = text.value.match(/#([0-9a-f]{6})/i); return match ? `#${match[1]}` : '#ffffff' })
function update(value: string | number | boolean) {
  if (boolean.value) props.node.value = props.node.type === 'byte' ? Number(value) : Boolean(value)
  else if (numeric.value) props.node.value = props.node.type === 'long' ? String(value) : Number(value)
  else props.node.value = String(value)
  emit('change')
}
function updateColor(value: string) {
  if (/^nbt:[^:]+:/.test(text.value)) { const prefix = text.value.slice(0, text.value.indexOf(':', 4) + 1); props.node.value = `${prefix}${JSON.stringify(value)}` } else props.node.value = value
  emit('change')
}
function displayChoice(value: string) { return value.replace(/^enum:[^:]+:/, '').replaceAll('_', ' ') }
</script>
<template>
  <div class="click-setting" :class="{ 'click-setting-compound': !!node.children }">
    <div class="click-setting-copy"><strong>{{ label }}</strong><small v-if="description" class="muted">{{ description }}</small><small v-if="isKeybind" class="muted">点击输入框后按下快捷键</small></div>
    <div class="click-setting-control">
      <label v-if="boolean" class="switch" :title="label"><input type="checkbox" :checked="node.value === true || node.value === 1" :disabled="disabled" @change="update(($event.target as HTMLInputElement).checked)" /><span class="switch-ui" /></label>
      <SelectMenu v-else-if="choices?.length" :model-value="String(node.value ?? '')" :options="choices.map(value => ({ value, label: displayChoice(value) }))" :disabled="disabled" @change="value => update(value)" />
      <template v-else-if="hasRange"><input class="click-slider" type="range" :min="min" :max="max" :step="node.type === 'float' || node.type === 'double' ? 'any' : 1" :value="Number(node.value)" :disabled="disabled" @input="update(Number(($event.target as HTMLInputElement).value))" /><output class="click-number">{{ node.value }}</output></template>
      <input v-else-if="isColor" class="click-color" type="color" :value="color" :disabled="disabled" :title="label" @input="updateColor(($event.target as HTMLInputElement).value)" />
      <input v-else-if="numeric" class="input click-input click-number-input" type="number" :value="node.value ?? 0" :disabled="disabled" @input="update(Number(($event.target as HTMLInputElement).value))" />
      <input v-else-if="isKeybind" class="input click-input" :value="node.value ?? ''" :disabled="disabled" @change="update(($event.target as HTMLInputElement).value)" />
      <textarea v-else-if="typeof node.value === 'string' && String(node.value).length > 120" class="input click-input click-textarea" :value="node.value ?? ''" :disabled="disabled" rows="2" @change="update(($event.target as HTMLTextAreaElement).value)" />
      <input v-else-if="!node.children" class="input click-input" :value="node.value ?? ''" :disabled="disabled" @change="update(($event.target as HTMLInputElement).value)" />
      <details v-else class="click-compound"><summary>展开 {{ node.children.length }} 项</summary><ConfigNodeEditor :node="node" :label="label" :disabled="disabled" :expanded-depth="2" @change="emit('change')" /></details>
    </div>
  </div>
</template>
<style scoped>
.click-setting{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:58px;padding:12px 0;border-bottom:1px solid color-mix(in srgb,var(--border) 65%,transparent)}.click-setting-copy{display:flex;flex-direction:column;gap:4px;min-width:0}.click-setting-copy strong{font-size:var(--text-sm);font-weight:650;overflow-wrap:anywhere}.click-setting-copy small{font-size:12px;line-height:1.45}.click-setting-control{display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:190px;max-width:55%}.click-setting-control :deep(.select-menu-btn){min-width:150px}.click-slider{width:170px;accent-color:var(--accent)}.click-number{width:58px;color:var(--text-dim);text-align:right;font-variant-numeric:tabular-nums}.click-input{width:220px;min-width:150px}.click-number-input{width:130px}.click-color{width:38px;height:30px;padding:2px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-2);cursor:pointer}.click-textarea{resize:vertical}.click-compound{width:100%;max-width:440px}.click-compound summary{cursor:pointer;color:var(--accent);font-size:var(--text-sm)}@media(max-width:720px){.click-setting{align-items:flex-start;flex-direction:column}.click-setting-control{width:100%;max-width:none;justify-content:flex-start}.click-input{width:100%}}
</style>
