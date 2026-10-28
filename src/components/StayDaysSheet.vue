<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
const props = defineProps({
  type: { type: String, required: true },
  count: { type: Number, required: true },
  days: { type: Array, default: () => [] },
  yearName: { type: String, default: '' }
})
const emit = defineEmits(['close'])
const expandedDate = ref('')
const title = computed(() => props.type === 'COMPLIANT' ? '符合留服逗留（完全符合）' : '未完全符合留服逗留（部分符合）')
const reasons = {
  WEEKDAY_OVER_4H: '工作日逗留已满 4 小时',
  COURSE_WEEKEND_OVER_4H: '集中课程周末逗留已满 4 小时',
  UNDER_4_HOURS: '当日逗留不足 4 小时',
  ORDINARY_WEEKEND: '普通无课周末',
  HISTORICAL_TIME_MISSING: '历史记录缺少准确时间'
}
const groups = computed(() => {
  const byMonth = new Map()
  for (const day of props.days.filter(x => x.status === props.type && /^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((a, b) => b.date.localeCompare(a.date))) {
    const month = day.date.slice(0, 7)
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month).push(day)
  }
  return [...byMonth].map(([month, dates]) => ({ month, dates }))
})
const weekday = date => '日一二三四五六'[new Date(date + 'T00:00:00Z').getUTCDay()]
const duration = minutes => {
  if (!Number.isFinite(Number(minutes))) return '时长待补正'
  const value = Math.floor(Number(minutes))
  return Math.floor(value / 60) + ' 小时' + (value % 60 ? ' ' + value % 60 + ' 分钟' : '')
}
function closeOnEscape(event) { if (event.key === 'Escape') emit('close') }
let previousOverflow = ''
onMounted(() => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', closeOnEscape)
})
onUnmounted(() => {
  document.body.style.overflow = previousOverflow
  document.removeEventListener('keydown', closeOnEscape)
})
watch(() => props.type, () => { expandedDate.value = '' })
</script>
<template>
  <div class="stay-days-overlay" @click.self="emit('close')">
    <section class="stay-days-sheet" role="dialog" aria-modal="true" :aria-label="title">
      <div class="stay-days-handle" aria-hidden="true"></div>
      <header class="stay-days-head"><div><h2>{{ title }}</h2><p>{{ yearName }} · 共 {{ count }} 天</p></div><button class="stay-days-close" type="button" aria-label="关闭逗留日期明细" @click="emit('close')">×</button></header>
      <div class="stay-days-body">
        <p v-if="!groups.length" class="stay-days-empty">暂无该类逗留日期</p>
        <section v-for="group in groups" :key="group.month" class="stay-days-month">
          <h3>{{ group.month.replace('-', ' 年 ') }} 月 <span>{{ group.dates.length }} 天</span></h3>
          <div class="stay-days-list"><div v-for="day in group.dates" :key="day.date" class="stay-days-entry">
            <button type="button" :aria-expanded="expandedDate === day.date" @click="expandedDate = expandedDate === day.date ? '' : day.date"><span>{{ day.date.slice(5, 7) }} 月 {{ day.date.slice(8) }} 日 <small>周{{ weekday(day.date) }}</small></span><span class="stay-days-duration">{{ duration(day.stayMinutes) }} <span aria-hidden="true">{{ expandedDate === day.date ? '⌃' : '›' }}</span></span></button>
            <p v-if="expandedDate === day.date" class="stay-days-explanation">{{ reasons[day.reasonCode] || '按当日逗留记录计算' }}。该日累计实际逗留 {{ duration(day.stayMinutes) }}。</p>
          </div></div>
        </section>
      </div>
    </section>
  </div>
</template>
<style scoped>
.stay-days-overlay { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: flex-end; justify-content: center; background: rgb(19 47 43 / 43%); }
.stay-days-sheet { box-sizing: border-box; width: min(100%, 600px); max-height: min(78dvh, 760px); display: flex; flex-direction: column; overflow: hidden; border-radius: 26px 26px 0 0; background: #fff; box-shadow: 0 -12px 48px rgb(10 40 35 / 16%); padding-bottom: env(safe-area-inset-bottom); }
.stay-days-handle { flex: none; width: 56px; height: 5px; margin: 12px auto 0; border-radius: 5px; background: #cddbd5; }
.stay-days-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 21px 22px 16px; border-bottom: 1px solid #e4ece9; }
.stay-days-head h2 { margin: 0; font-size: clamp(18px, 4.6vw, 22px); line-height: 1.35; color: #183a36; }
.stay-days-head p { margin: 7px 0 0; color: #6f817d; font-size: 13px; }
.stay-days-close { flex: none; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: #eff5f2; color: #49635d; font-size: 27px; line-height: 1; }
.stay-days-body { overflow-y: auto; overscroll-behavior: contain; padding: 0 22px 22px; }
.stay-days-month h3 { margin: 23px 0 11px; display: flex; justify-content: space-between; font-size: 15px; color: #617873; font-weight: 600; }
.stay-days-month h3 span { font-weight: 500; }
.stay-days-list { border-radius: 16px; background: #f7faf8; padding: 0 14px; }
.stay-days-entry + .stay-days-entry { border-top: 1px solid #e2ebe6; }
.stay-days-entry button { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; min-height: 53px; padding: 8px 0; border: 0; background: transparent; color: #183a36; text-align: left; font: inherit; font-size: 15px; }
.stay-days-entry small { margin-left: 5px; font-size: 13px; color: #718580; }
.stay-days-duration { flex: none; color: #617873; font-size: 13px; white-space: nowrap; }
.stay-days-duration span { display: inline-block; min-width: 12px; margin-left: 5px; color: #0d766a; font-size: 18px; }
.stay-days-explanation { margin: -2px 0 13px; padding: 10px 12px; border-radius: 10px; background: #eaf5f0; color: #41645c; font-size: 13px; line-height: 1.5; }
.stay-days-empty { padding: 32px 0; color: #718580; text-align: center; }
@media (max-width: 400px) { .stay-days-head, .stay-days-body { padding-left: 17px; padding-right: 17px; } .stay-days-entry button { font-size: 14px; } .stay-days-duration { font-size: 12px; } }
</style>
