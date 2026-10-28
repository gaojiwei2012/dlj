<script setup>
import {onMounted,onUnmounted,ref} from 'vue'
import {takeInstallPrompt,subscribeInstall} from '../utils/pwa-install.mjs'

defineProps({open:{type:Boolean,default:false}})
const emit=defineEmits(['close'])

const installed=ref(false),showHelp=ref(false),busy=ref(false)
const ios=typeof navigator!=='undefined'&&/iPad|iPhone|iPod/.test(navigator.userAgent)
function updateInstalled(){installed.value=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;if(installed.value)emit('close')}
async function install(){
  updateInstalled()
  if(installed.value)return
  const prompt=takeInstallPrompt()
  if(!prompt){showHelp.value=true;return}
  busy.value=true
  try{
    await prompt.prompt()
    const choice=await prompt.userChoice
    if(choice?.outcome==='accepted')emit('close')
    else showHelp.value=true
  }catch{
    showHelp.value=true
  }finally{busy.value=false}
}
let unsubscribe
onMounted(()=>{updateInstalled();unsubscribe=subscribeInstall(updateInstalled)})
onUnmounted(()=>unsubscribe?.())
</script>

<template>
  <div v-if="open&&!installed" class="pwa-onboarding" role="dialog" aria-modal="true" aria-labelledby="pwa-onboarding-title">
    <div class="pwa-onboarding-card">
      <div class="pwa-onboarding-icon" aria-hidden="true">↓</div>
      <h2 id="pwa-onboarding-title">添加到手机桌面</h2>
      <p>下次打开逗留记，一点就到。<br>无需每次输入网址。</p>
      <div v-if="showHelp" class="pwa-onboarding-help" role="status">
        <strong>手动添加到主屏幕</strong>
        <p v-if="ios">请使用 Safari 打开本页，点击底部“分享”，选择“添加到主屏幕”。</p>
        <p v-else>请使用 Chrome 打开本页，点击右上角“⋮”，选择“添加到主屏幕”或“安装应用”。</p>
      </div>
      <button v-else type="button" class="pwa-onboarding-action" :disabled="busy" @click="install">{{busy?'正在打开安装界面…':'添加到主屏幕'}}</button>
      <button type="button" class="pwa-onboarding-skip" @click="emit('close')">{{showHelp?'知道了':'暂不添加'}}</button>
    </div>
  </div>
</template>
