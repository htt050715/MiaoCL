<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { IPC, type FabricLoaderChoices, type InstalledVersion } from '@shared/types'
import SelectMenu from './SelectMenu.vue'
import { errText } from '../api'

const props = defineProps<{ source: InstalledVersion }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done'): void }>()
const choices = ref<FabricLoaderChoices>(), selected = ref(''), loading = ref(true), busy = ref(false), error = ref('')
const target = { id: props.source.id, folder: props.source.folder }
const options = computed(() => choices.value?.versions.map(value => ({ value, label: value + (value === choices.value?.currentVersion ? '（当前）' : '') })) ?? [])
let disposed = false
onUnmounted(() => { disposed = true })
async function load() {
  loading.value = true; error.value = ''
  try {
    const result = await window.kamucl.invoke(IPC.fabricLoaderChoices, target) as FabricLoaderChoices
    if (!disposed) { choices.value = result; selected.value = result.currentVersion }
  } catch (e) { if (!disposed) error.value = errText(e) }
  finally { if (!disposed) loading.value = false }
}
async function apply() {
  if (!selected.value || selected.value === choices.value?.currentVersion || busy.value) return
  busy.value = true; error.value = ''
  try {
    await window.kamucl.invoke(IPC.fabricLoaderChange, target, selected.value)
    if (!disposed) { emit('done'); emit('close') }
  } catch (e) { if (!disposed) error.value = errText(e) }
  finally { if (!disposed) busy.value = false }
}
onMounted(load)
</script>

<template>
  <Teleport to="body">
    <div class="modal-mask" data-ui="games:fabric-loader-dialog" @pointerdown.self="!busy && emit('close')">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="fabric-loader-title" @keydown.esc.stop="!busy && emit('close')">
        <h3 id="fabric-loader-title" class="modal-title">Fabric Loader 版本管理</h3>
        <p class="muted instance-name">{{ source.id }}</p>
        <p v-if="loading" class="muted">正在查询 Fabric 官方版本…</p>
        <template v-if="choices">
          <p class="muted">Minecraft {{ choices.mcVersion }} · 当前 Loader {{ choices.currentVersion }}</p>
          <label for="fabric-loader-version">目标 Loader 版本</label>
          <SelectMenu id="fabric-loader-version" v-model="selected" :options="options" :disabled="busy" placeholder="请选择版本" />
          <p class="muted">选择新版或旧版，退出游戏后切换，下次启动生效。切换前自动备份实例描述文件，保留模组、配置与存档。</p>
          <p class="muted">部分模组要求最低 Loader 版本，降级前请核对模组要求。</p>
          <p v-if="!choices.versions.length" class="muted">官方暂未提供此 Minecraft 版本的 Loader。</p>
        </template>
        <p v-if="error" class="loader-error" role="alert">{{ error }}</p>
        <div class="modal-actions">
          <button v-if="!choices && !loading" class="btn btn-ghost" @click="load">重试</button>
          <button class="btn btn-ghost" :disabled="busy" @click="emit('close')">取消</button>
          <button class="btn btn-gold" :disabled="loading || busy || !selected || selected === choices?.currentVersion" @click="apply">{{ busy ? '正在下载并切换…' : '确认切换' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.modal{width:min(480px,calc(100vw - 48px));max-height:calc(100vh - 48px);overflow:auto}
.muted{margin:10px 0;font-size:var(--text-sm);line-height:1.7;overflow-wrap:anywhere}
.instance-name{margin-top:4px}label{display:block;margin:18px 0 8px;font-size:var(--text-sm)}
.select-menu-btn{width:100%}.loader-error{color:var(--danger);font-size:var(--text-sm);line-height:1.7;overflow-wrap:anywhere}
</style>
