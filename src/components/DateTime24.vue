<script setup>
import {computed,ref} from 'vue'

const props=defineProps({modelValue:{type:String,default:''}})
const emit=defineEmits(['update:modelValue'])
const open=ref(false),selectedDate=ref(''),hour=ref(''),minute=ref(''),error=ref(''),month=ref('')
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const displayed=computed(()=>props.modelValue?props.modelValue.slice(0,10)+' '+props.modelValue.slice(11,16):'选择日期与时间')
const monthOffset=computed(()=>month.value?(new Date(month.value+'-01T00:00:00Z').getUTCDay()+6)%7:0)
const dates=computed(()=>{if(!month.value)return[];const [y,m]=month.value.split('-').map(Number);return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>month.value+'-'+String(i+1).padStart(2,'0'))})
function show(){selectedDate.value=props.modelValue?.slice(0,10)||'';hour.value=props.modelValue?.slice(11,13)||'';minute.value=props.modelValue?.slice(14,16)||'';month.value=(selectedDate.value||today()).slice(0,7);error.value='';open.value=true}
function shift(offset){const [y,m]=month.value.split('-').map(Number);month.value=new Date(Date.UTC(y,m-1+offset,1)).toISOString().slice(0,7)}
function quick(value){[hour.value,minute.value]=value.split(':');error.value=''}
function confirm(){
  const h=hour.value.trim().padStart(2,'0'),m=minute.value.trim().padStart(2,'0')
  if(!selectedDate.value){error.value='请选择日期';return}
  if(!hour.value.trim()||!minute.value.trim()){error.value='请填写完整的时间';return}
  if(!/^([01]\d|2[0-3])$/.test(h)||!/^[0-5]\d$/.test(m)){error.value='请输入 00:00—23:59 之间的时间';return}
  emit('update:modelValue',`${selectedDate.value}T${h}:${m}`)
  open.value=false
}
</script>

<template>
  <button type="button" class="datetime24-trigger" :class="{'is-empty':!modelValue}" @click="show">{{displayed}}<span aria-hidden="true">▾</span></button>
  <Teleport to="body">
    <div v-if="open" class="datetime24-overlay" @click.self="open=false" @keydown.esc="open=false">
      <section class="datetime24-sheet" role="dialog" aria-modal="true" aria-label="选择日期与时间">
        <div class="datetime24-sheet-head"><div><h3>选择日期与时间</h3><p>北京时间 · 24小时制</p></div><button type="button" aria-label="关闭" @click="open=false">×</button></div>
        <div class="datetime24-month"><button type="button" aria-label="上个月" @click="shift(-1)">‹</button><strong>{{month.replace('-','年')}}月</strong><button type="button" aria-label="下个月" @click="shift(1)">›</button></div>
        <div class="datetime24-calendar"><b v-for="d in ['一','二','三','四','五','六','日']" :key="d">{{d}}</b><span v-for="n in monthOffset" :key="'blank'+n"></span><button v-for="date in dates" :key="date" type="button" :class="{selected:selectedDate===date}" :aria-label="date" :aria-pressed="selectedDate===date" @click="selectedDate=date;error=''">{{Number(date.slice(-2))}}</button></div>
        <div class="datetime24-time-label">时间 <small>直接输入时、分</small></div>
        <div class="datetime24-inputs"><input v-model="hour" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="时" aria-label="小时，00至23" @input="error=''"/><span>:</span><input v-model="minute" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="分" aria-label="分钟，00至59" @input="error=''"/></div>
        <div class="datetime24-quick"><button v-for="time in ['09:00','12:00','18:00']" :key="time" type="button" @click="quick(time)">{{time}}</button></div>
        <p v-if="error" class="datetime24-error" role="alert">{{error}}</p>
        <div class="datetime24-footer"><button type="button" class="secondary" @click="open=false">取消</button><button type="button" class="primary" @click="confirm">确定</button></div>
      </section>
    </div>
  </Teleport>
</template>
