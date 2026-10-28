<script setup>
defineProps({ groups: { type: Array, default: () => [] } })
defineEmits(['edit', 'delete'])
const labels = { COMPLIANT:'完全符合留服要求',PARTIAL:'部分符合留服要求',NON_COMPLIANT:'不符合留服要求',TIME_UNKNOWN:'时长待补正',IN_PROGRESS:'进行中，尚未结算',NO_STAY:'未形成有效逗留',OUTSIDE_YEAR:'学年外，未计入' }
const weekday = date => '日一二三四五六'[new Date(date + 'T00:00:00Z').getUTCDay()]
const compactDate = date => date?.replaceAll('-', '.') || ''
const shortDate = date => date?.slice(5).replace('-', '/') || ''
const localTime = iso => iso ? new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '时间待补正'
</script>
<template>
  <section class="stay-record-list" aria-label="逗留记录">
    <article v-for="group in groups" :key="group.key" class="stay-record-card">
      <header class="record-head">
        <div class="record-dates"><strong>{{ compactDate(group.startDate) }}<template v-if="group.endDate !== group.startDate"> — {{ compactDate(group.endDate) }}</template></strong><span v-if="group.endDate === group.startDate">周{{ weekday(group.startDate) }}</span></div>
        <span class="record-day-count">{{ group.days }} 天</span>
      </header>
      <div class="record-verdict" :class="'verdict-' + group.status.toLowerCase()"><i aria-hidden="true"></i>{{ labels[group.status] || '待判定' }}</div>
      <div class="record-times" aria-label="本段逗留起止时间">
        <div class="record-time-cell"><span>最早入澳</span><strong>{{ group.startTime || '— — : — —' }}</strong><small v-if="group.endDate !== group.startDate">{{ shortDate(group.startDate) }}</small></div>
        <span class="record-time-arrow" aria-hidden="true">→</span>
        <div class="record-time-cell"><span>最晚离澳</span><strong :class="{pending:group.open}">{{ group.open ? '未签退' : group.endTime || '— — : — —' }}</strong><small v-if="group.endDate !== group.startDate">{{ shortDate(group.endDate) }}</small></div>
      </div>
      <p v-if="group.timeUnknown && group.status !== 'TIME_UNKNOWN'" class="record-hint">部分原始记录的时间待补正，请核对明细。</p>
      <div v-if="group.records.length === 1" class="record-footer"><span>{{ group.records[0].source === 'MANUAL' ? '手动补录' : '签到记录' }}</span><div class="record-actions"><button v-if="group.records[0].status !== 'OPEN'" type="button" @click="$emit('edit', group.records[0])">修改</button><button type="button" class="danger" @click="$emit('delete', group.records[0].id)">删除</button></div></div>
      <details v-else class="record-details"><summary><span>查看及管理 {{ group.records.length }} 条原始记录</span><span class="record-chevron" aria-hidden="true">⌄</span></summary>
        <div v-for="record in group.records" :key="record.id" class="record-source"><span class="record-source-type">{{ record.source === 'MANUAL' ? '手动补录' : '签到记录' }}</span><p>{{ localTime(record.check_in_at) }}<br>至 {{ record.status === 'OPEN' ? '未签退' : localTime(record.check_out_at) }}</p><div class="record-actions"><button v-if="record.status !== 'OPEN'" type="button" @click="$emit('edit', record)">修改</button><button type="button" class="danger" @click="$emit('delete', record.id)">删除</button></div></div>
      </details>
    </article>
    <p v-if="!groups.length" class="empty-card">还没有逗留记录</p>
  </section>
</template>
<style scoped>
.stay-record-list{display:grid;gap:13px}
.stay-record-card{min-width:0;overflow:hidden;padding:18px 18px 0;border:1px solid #dce8e3;border-radius:20px;background:#fff;box-shadow:0 5px 20px rgb(18 62 51 / 4%)}
.record-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:0}
.record-dates{display:flex;flex-direction:column;min-width:0;gap:3px}
.record-dates strong{color:#193c36;font-size:17px;line-height:1.35;font-weight:740;overflow-wrap:anywhere}
.record-dates>span{color:#8a9b96;font-size:12px}
.record-day-count{flex:none;padding:5px 10px;border-radius:999px;background:#e6f3ee;color:#0f766e;font-size:13px;font-weight:750;line-height:1.25}
.record-verdict{display:inline-flex;align-items:center;gap:7px;margin-top:15px;color:#087a57;font-size:14px;font-weight:720}
.record-verdict i{width:8px;height:8px;border-radius:50%;background:currentColor}
.verdict-partial{color:#ad720e}
.verdict-non_compliant,.verdict-time_unknown{color:#b75a43}
.verdict-in_progress,.verdict-no_stay,.verdict-outside_year{color:#74857f}
.record-times{display:grid;grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr);align-items:center;gap:8px;margin:16px 0 18px;padding:14px 15px;border-radius:14px;background:#f4f8f6}
.record-time-cell{min-width:0;display:flex;flex-direction:column;gap:3px}
.record-time-cell>span{color:#778c85;font-size:12px}
.record-time-cell strong{color:#1b3d37;font-size:clamp(16px,5vw,22px);font-variant-numeric:tabular-nums;white-space:nowrap;line-height:1.3}
.record-time-cell strong.pending{color:#a66332;font-size:16px}
.record-time-cell small{color:#718781;font-size:11px}
.record-time-arrow{color:#9cb1a9;font-size:18px;text-align:center}
.record-hint{margin:-8px 0 14px;color:#a26032;font-size:12px;line-height:1.5}
.record-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:51px;border-top:1px solid #edf1ef;color:#8b9a95;font-size:12px}
.record-actions{display:flex;gap:4px;flex:none}
.record-actions button{border:0;padding:7px 10px;background:none;color:#0d766a;font:inherit;font-size:13px;font-weight:650}
.record-actions .danger{color:#b15c4b}
.record-details{border-top:1px solid #edf1ef}
.record-details summary{display:flex;align-items:center;justify-content:space-between;min-height:50px;color:#0d766a;cursor:pointer;font-size:13px;font-weight:680;list-style:none}
.record-details summary::-webkit-details-marker{display:none}
.record-chevron{font-size:20px;line-height:1;transition:transform .15s}
.record-details[open] .record-chevron{transform:rotate(180deg)}
.record-source{padding:11px 0;border-top:1px solid #edf1ef}
.record-source-type{color:#647e74;font-size:12px;font-weight:650}
.record-source p{margin:5px 0 0;color:#506a63;font-size:13px;line-height:1.6}
.record-source .record-actions{justify-content:flex-end}
@media(max-width:380px){.stay-record-card{padding-left:15px;padding-right:15px}.record-dates strong{font-size:15px}.record-times{padding:12px;gap:4px}.record-time-cell strong{font-size:17px}}
</style>
