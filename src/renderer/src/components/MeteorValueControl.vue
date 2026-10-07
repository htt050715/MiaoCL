<script setup lang="ts">
import {computed,ref} from 'vue'
import {designIdentity} from '@shared/visualDesign'
import type {ConfigNode} from '@shared/clientConfigs'
import {configChild} from '@shared/configFeatures'
const props=defineProps<{node:ConfigNode;kind?:string;disabled?:boolean}>()
const emit=defineEmits<{change:[]}>()
const field=(key:string)=>configChild(props.node,key)
const color=computed(()=>['r','g','b'].every(k=>field(k))&&!!field('a'))
const bindKey=computed(()=>field('value')?'value':'key')
const keybind=computed(()=>props.kind==='KeybindSetting'&&!!field(bindKey.value))
const position=computed(()=>!color.value&&!keybind.value&&['x','y','z'].every(k=>field(k)))
const stringList=computed(()=>props.node.type==='list'&&(props.node.elementType===8||!!props.node.children?.length&&props.node.children.every(c=>c.node.type==='string')))
const newItem=ref('')
function addItem(){const value=newItem.value.trim();if(!value||props.disabled)return;props.node.children??=[];props.node.children.push({key:String(props.node.children.length),node:{type:'string',value}});newItem.value='';emit('change')}
function removeItem(index:number){if(props.disabled)return;props.node.children?.splice(index,1);props.node.children?.forEach((c,i)=>c.key=String(i));emit('change')}
const supported=computed(()=>color.value||keybind.value||position.value||stringList.value)
defineExpose({supported})
const hex=computed(()=> '#'+['r','g','b'].map(k=>Number(field(k)?.value??0).toString(16).padStart(2,'0')).join(''))
function set(key:string,value:number|boolean){const node=field(key);if(!node)return;node.value=node.type==='byte'?Number(value):value;emit('change')}
function setColor(value:string){['r','g','b'].forEach((k,i)=>set(k,parseInt(value.slice(1+i*2,3+i*2),16)))}
const listening=ref(false)
const glfw:Record<string,number>={Space:32,Escape:256,Enter:257,Tab:258,Backspace:259,Insert:260,Delete:261,ArrowRight:262,ArrowLeft:263,ArrowDown:264,ArrowUp:265,PageUp:266,PageDown:267,Home:268,End:269,ShiftLeft:340,ControlLeft:341,AltLeft:342,ShiftRight:344,ControlRight:345,AltRight:346,Semicolon:59,Equal:61,Comma:44,Minus:45,Period:46,Slash:47,Backquote:96,BracketLeft:91,Backslash:92,BracketRight:93,Quote:39}
function capture(event:KeyboardEvent){if(!listening.value)return;event.preventDefault();event.stopPropagation();if(event.code==='Escape'){listening.value=false;return}const code=/^Key[A-Z]$/.test(event.code)?event.code.charCodeAt(3):/^Digit\d$/.test(event.code)?event.code.charCodeAt(5):/^F\d+$/.test(event.code)?289+Number(event.code.slice(1)):glfw[event.code];if(code===undefined)return;set(bindKey.value,code);set('isKey',true);set('modifiers',(event.shiftKey?1:0)|(event.ctrlKey?2:0)|(event.altKey?4:0)|(event.metaKey?8:0));listening.value=false}
const binding=computed(()=>{const code=Number(field(bindKey.value)?.value??-1);if(code<0)return'未绑定';if(field('isKey')?.value===0)return`鼠标 ${code+1}`;return code>=65&&code<=90||code>=48&&code<=57?String.fromCharCode(code):Object.entries(glfw).find(([,v])=>v===code)?.[0]??(code>=290&&code<=314?`F${code-289}`:`按键 ${code}`)})
const bindingLabel=computed(()=>{if(Number(field(bindKey.value)?.value??-1)<0)return binding.value;const modifiers=Number(field('modifiers')?.value??0);return [[2,'Ctrl'],[1,'Shift'],[4,'Alt'],[8,'Super']].filter(([bit])=>modifiers&Number(bit)).map(([,label])=>label).concat(binding.value).join(' + ')})
</script>
<template>
  <div v-if="color" class="meteor-color-control"><input type="color" :value="hex" :disabled="disabled" aria-label="选择颜色" @input="setColor(($event.target as HTMLInputElement).value)"/><label class="alpha-control">透明度<input type="range" min="0" max="255" :value="field('a')?.value??255" :disabled="disabled" @input="set('a',Number(($event.target as HTMLInputElement).value))"/><output>{{field('a')?.value}}</output></label><label v-if="field('rainbow')" class="rainbow-control"><input type="checkbox" :checked="field('rainbow')?.value===1||field('rainbow')?.value===true" :disabled="disabled" @change="set('rainbow',($event.target as HTMLInputElement).checked)"/> 彩虹色</label></div>
  <div v-else-if="keybind" class="meteor-key-control"><button class="btn btn-ghost btn-sm" :class="{listening}" :disabled="disabled" @click="listening=!listening" @keydown="capture" @blur="listening=false">{{listening?'按下快捷键（Esc 取消）':bindingLabel}}</button><button class="btn btn-ghost btn-sm" :disabled="disabled" @click="set(bindKey,-1);set('modifiers',0)">清除</button></div>
  <div v-else-if="position" class="meteor-position-control"><label v-for="axis in ['x','y','z']" :key="axis" :data-design-key="designIdentity(axis)">{{axis.toUpperCase()}}<input class="input" type="number" :step="field(axis)?.type==='int'?1:'any'" :value="field(axis)?.value" :disabled="disabled" @input="set(axis,Number(($event.target as HTMLInputElement).value))"/></label></div>
  <div v-else-if="stringList" class="meteor-list-control"><div class="list-chips"><span v-for="(entry,index) in node.children" :key="index" class="list-chip"><input :value="entry.node.value" :disabled="disabled" aria-label="列表条目" @change="entry.node.value=($event.target as HTMLInputElement).value;emit('change')"/><button class="btn btn-ghost btn-sm" :disabled="disabled" aria-label="移除此条目" @click="removeItem(index)">×</button></span><small v-if="!node.children?.length" class="muted">未选择任何条目</small></div><div class="list-add"><input v-model="newItem" class="input" placeholder="添加条目或注册表 ID" :disabled="disabled" @keydown.enter.prevent="addItem"/><button class="btn btn-ghost btn-sm" :disabled="disabled||!newItem.trim()" @click="addItem">添加</button></div></div>
</template>
<style scoped>
.meteor-color-control,.meteor-key-control,.meteor-position-control{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.meteor-color-control>input{width:38px;height:32px;padding:2px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-2)}.alpha-control,.rainbow-control{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text-dim)}.alpha-control input{width:80px;accent-color:var(--accent)}.alpha-control output{min-width:24px}.meteor-key-control .listening{border-color:var(--accent);color:var(--accent)}.meteor-position-control label{display:flex;gap:4px;align-items:center;font-size:12px;color:var(--text-dim)}.meteor-position-control .input{width:76px;min-width:0}
.meteor-list-control{width:100%;min-width:190px}.list-chips{display:flex;flex-wrap:wrap;gap:5px;max-height:180px;overflow:auto}.list-chip{display:flex;align-items:center;background:var(--hover);border:1px solid var(--border);border-radius:var(--radius-sm);padding-left:6px}.list-chip>input{border:0;color:var(--text);background:transparent;width:160px;min-width:0;font-size:12px;padding:5px}.list-chip>.btn{padding:3px 6px}.list-add{display:flex;gap:6px;margin-top:8px}.list-add>.input{min-width:0;flex:1}
</style>
