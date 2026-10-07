<script setup lang="ts">
import {launcherIdentity} from '../launcherIdentity'
import SkinViewer3D from './SkinViewer3D.vue'
</script>
<template><div class="player-skin-logo" :aria-label="launcherIdentity.username+' 的皮肤小人'"><SkinViewer3D :src="launcherIdentity.skin" :variant="launcherIdentity.variant" :cape="launcherIdentity.cape" animation="idle"/></div></template>
<style scoped>
.player-skin-logo{position:absolute;inset:0;width:48px;height:72px;-webkit-app-region:no-drag}.player-skin-logo :deep(.viewer3d){height:72px;min-height:0;--sv3d-height:72px;background:transparent}
</style>
