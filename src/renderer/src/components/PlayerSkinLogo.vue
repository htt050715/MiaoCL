<script setup lang="ts">
import {ref,watch} from 'vue'
import {getSkinAvatar} from '../api'
import {store} from '../store'
import SkinViewer3D from './SkinViewer3D.vue'
const src=ref('');let epoch=0
watch(()=>store.selectedAccount,async()=>{const request=++epoch;src.value='';try{const next=await getSkinAvatar();if(request===epoch)src.value=next??''}catch{}},{immediate:true})
</script>
<template><div class="player-skin-logo" aria-label="当前玩家的皮肤小人"><SkinViewer3D :src="src" animation="idle"/></div></template>
<style scoped>
.player-skin-logo{position:absolute;inset:0;width:48px;height:72px;-webkit-app-region:no-drag}.player-skin-logo :deep(.viewer3d){height:72px;min-height:0;--sv3d-height:72px;background:transparent}
</style>
