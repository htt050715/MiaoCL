<script setup lang="ts">
import ClientConfigsPanel from '../components/ClientConfigsPanel.vue'
import { store,selectedInstance,displayVersionName } from '../store'
import '../client-configs.css'
</script>
<template>
  <div class="page client-configs-page">
    <div class="page-head config-page-head"><div><h1 class="page-title">客户端参数</h1><p class="page-sub">{{ selectedInstance ? displayVersionName(selectedInstance) : '先选择游戏实例' }} · 按分类浏览模块与具体设置</p></div><button class="btn btn-ghost" data-design-nav @click="store.currentView='bridge'">返回 MOD 面板</button></div>
    <ClientConfigsPanel />
  </div>
</template>
<style scoped>
.client-configs-page{max-width:1480px;width:100%}.config-page-head{display:flex;flex-direction:row;justify-content:space-between;align-items:center;gap:16px;text-align:left;margin-bottom:16px}.config-page-head .page-title{font-size:var(--text-lg);margin:0 0 5px}.config-page-head .page-sub{margin:0}.config-page-head>.btn{flex:none}
</style>
