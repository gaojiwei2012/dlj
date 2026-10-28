<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps({ yearId: {type: [String, Number], required: true}, refreshKey: {type: Number, default: 0} })
const emit = defineEmits(['detail-change'])
const students = ref([]), academicYear = ref(null), listLoading = ref(false), detailLoading = ref(false)
const selectedId = ref(null), detail = ref(null), error = ref('')
const query = ref(''), accountStatus = ref('ALL')
let listToken = 0, detailToken = 0

async function request(path) {
  const response = await fetch('/api' + path, {headers: {'content-type':'application/json'}})
  const data = await response.json()
  if (!response.ok) throw Error(data.error || '数据加载失败')
  return data
}
async function loadList() {
  const token = ++listToken, year = props.yearId
  if (!year) return
  listLoading.value = true; error.value = ''
  try {
    const response = await request('/admin/students?yearId=' + encodeURIComponent(year))
    if (token !== listToken || year !== props.yearId) return
    students.value = response.students; academicYear.value = response.academicYear
  } catch (e) { if (token === listToken) error.value = e.message }
  finally { if (token === listToken) listLoading.value = false }
}
async function loadDetail(id = selectedId.value) {
  const token = ++detailToken, year = props.yearId
  if (!id || !year) return
  detailLoading.value = true; error.value = ''
  try {
    const response = await request('/admin/students/' + id + '?yearId=' + encodeURIComponent(year))
    if (token !== detailToken || year !== props.yearId || selectedId.value !== id) return
    detail.value = response
  } catch (e) { if (token === detailToken) error.value = e.message }
  finally { if (token === detailToken) detailLoading.value = false }
}
function openDetail(id) { selectedId.value = id; detail.value = null; emit('detail-change', true); loadDetail(id) }
function closeDetail() { detailToken++; selectedId.value = null; detail.value = null; detailLoading.value = false; error.value = ''; emit('detail-change', false) }
watch(() => props.yearId, () => { closeDetail(); loadList() })
watch(() => props.refreshKey, () => { loadList(); if (selectedId.value) loadDetail(selectedId.value) })
onMounted(() => { emit('detail-change', false); loadList() })

const filteredStudents = computed(() => students.value.filter(s => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (needle && !(s.display_name + ' ' + s.username).toLocaleLowerCase().includes(needle)) return false
  return accountStatus.value === 'ALL' || s.status === accountStatus.value
}))
const openCount = computed(() => students.value.filter(s => s.openStay).length)
// Across students: a natural date is counted once PER student, not once globally.
const compliantSum = computed(() => students.value.reduce((sum, s) => sum + s.compliance.compliantDays, 0))
const partialSum = computed(() => students.value.reduce((sum, s) => sum + s.compliance.partialDays, 0))
const combinedSum = computed(() => compliantSum.value + partialSum.value)
// For a class-wide ratio the denominator is the SUM of the students' annual targets,
// not one student's 90-day target. Search/filtering does not alter the class summary.
const targetSum = computed(() => students.value.reduce((sum, s) => sum + s.targetDays, 0))
const actualDays = computed(() => [...(detail.value?.compliance.dailyResults || [])].filter(d => d.hasStay || d.inProgress).reverse())
const statusLabels = { COMPLIANT:'完全符合', PARTIAL:'部分符合', NON_COMPLIANT:'不符合', NO_STAY:'无记录',
  IN_PROGRESS:'正在签到', TIME_UNKNOWN:'时长待补正' }
const ruleLabels = { PUBLIC_HOLIDAY:'公共假期', MANUAL_INVALID:'无效逗留日期', WEEKEND:'普通周末', COURSE_DAY:'课程日' }
const reasonLabels = { NO_STAY:'无实际签到记录', PUBLIC_HOLIDAY:'公共假期优先', MANUAL_INVALID:'无效逗留日期优先',
  UNDER_4_HOURS:'实际不足四小时', WEEKDAY_OVER_4H:'普通工作日已满四小时',
  COURSE_WEEKEND_OVER_4H:'课程周末已满四小时',
  ORDINARY_WEEKEND:'普通周末最多部分符合', HISTORICAL_TIME_MISSING:'历史时间待补正',
  OPEN_STAY_IN_PROGRESS:'正在签到，尚未结算' }
const minutes = value => `${Math.floor(value ?? 0)} 分钟`
function timeInBeijing(iso) {
  if (!iso) return '时刻未记录／待补正'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '时间格式不正确'
  return new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(date)
}
</script>

<template>
  <div class="r004">
    <template v-if="!selectedId">
      <div class="r004-heading">
        <div><h3>学生综合总览</h3><p class="r004-note">基于所选学年汇总全体学生的实际逗留情况；只统计学生账号（USER），账号维护请使用原有「全部人员」入口。</p></div>
        <button type="button" class="r004-button" @click="loadList" :disabled="listLoading">刷新统计</button>
      </div>
      <div class="r004-summary">
        <div><small>学生总数</small><strong>{{students.length}}</strong></div>
        <div><small>当前正在签到</small><strong>{{openCount}}</strong></div>
        <div><small>统计学年</small><strong class="r004-year-name">{{academicYear?.name || '—'}}</strong></div>
      </div>

      <p v-if="listLoading" role="status">正在加载学生统计……</p>
      <p v-if="error" role="alert" class="r004-error">{{error}}</p>
    </template>

    <template v-else>
      <div class="r004-heading"><div><button class="r004-back" type="button" @click="closeDetail">← 返回学生总览</button><h3>学生综合详情</h3></div><button class="r004-button" type="button" @click="loadDetail()" :disabled="detailLoading">刷新详情</button></div>
      <p v-if="detailLoading && !detail" role="status">正在加载学生详情……</p>
      <p v-if="error" role="alert" class="r004-error">{{error}}</p>
      <template v-if="detail">
        <div class="r004-person"><div><h4>{{detail.student.display_name}}</h4><small>{{detail.student.username}} · {{detail.student.status==='ACTIVE'?'已启用':'已停用'}} · {{detail.academicYear.name}}</small><small>{{detail.student.openStay?'● 目前有未签退签到':'目前没有未签退签到'}}<template v-if="detail.student.lastCheckIn"> · 最近签到 {{detail.student.lastCheckIn.start_date}}</template></small></div><small>按北京时间统计 · 数据刷新时点 {{timeInBeijing(detail.asOf)}}</small></div>
        <h4 class="r004-subtitle">实际逗留合规</h4>
        <div class="r004-metrics">
          <div><small>完全符合</small><strong class="r004-ratio">{{detail.compliance.compliantDays}}<span> / {{detail.targetDays}}</span></strong><small>天 / 学年目标</small></div>
          <div><small>部分符合</small><strong class="r004-ratio">{{detail.compliance.partialDays}}<span> / {{detail.targetDays}}</span></strong><small>天 / 学年目标</small></div>
          <div><small>累计符合（完全＋部分）</small><strong class="r004-ratio">{{detail.compliantAndPartialDays}}<span> / {{detail.targetDays}}</span></strong><small>天 / 学年目标</small></div>
          <div><small>不符合</small><strong>{{detail.compliance.nonCompliantDays}} 天</strong><small>{{minutes(detail.compliance.nonCompliantMinutes)}}</small></div>
          <div><small>待补正 / 进行中</small><strong>{{detail.compliance.timeUnknownDays}} / {{detail.compliance.inProgressDays}} 天</strong></div>
          <div><small>学年目标</small><strong>{{detail.targetDays}} 天</strong><small>三项比值使用相同分母；部分符合仍单独标识</small></div>
        </div>
        <h4 class="r004-subtitle">每日实际合规详情</h4>
        <p class="r004-note">只显示发生过实际逗留或正在签到的自然日；规则原因来自统一的日级合规结果。</p>
        <div class="r004-list-scroll"><div v-for="day in actualDays" :key="day.date" class="r004-day"><b>{{day.date}}</b><div><strong>{{statusLabels[day.status] || day.status}}</strong> · {{minutes(day.stayMinutes)}}<small>判定依据：{{reasonLabels[day.reasonCode] || day.reasonCode}}</small><small>命中日期规则：{{day.matchedRules?.length ? day.matchedRules.map(r=>ruleLabels[r] || r).join('、') : '无特殊日期规则'}}</small><small v-if="day.ruleDetails?.length">规则说明：{{day.ruleDetails.map(r=>(ruleLabels[r.type]||r.type)+(r.reason?'（'+r.reason+'）':'')).join('、')}}</small></div></div><p v-if="!actualDays.length" class="r004-empty">该学年目前没有实际逗留记录。</p></div>
        <h4 class="r004-subtitle">当前学年相关签到／签退历史</h4>
        <div class="r004-list-scroll"><div v-for="record in detail.stayRecords" :key="record.id" class="r004-record"><strong>{{record.start_date}} 至 {{record.end_date||'进行中'}} · {{record.status==='OPEN'?'正在签到':'已签退'}}</strong><small>来源：{{record.source}} · 入澳 {{timeInBeijing(record.check_in_at)}} · 离澳 {{timeInBeijing(record.check_out_at)}}</small></div><p v-if="!detail.stayRecords.length" class="r004-empty">无当前学年相关签到记录。</p></div>
        <p class="r004-note">修改姓名、重置密码、停用账号及撤销最近签退，请返回原有「全部人员」操作区。本页只读，不修改学生原始记录。</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.r004 { min-width:0; color:#17312e; }
.r004 h3,.r004 h4 { margin:0; }
.r004 button { font:inherit; }
.r004-heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; margin-bottom:15px; }
.r004-heading h3 { font-size:21px; }
.r004-note { margin:7px 0 16px; color:#5a746d; font-size:13px; line-height:1.65; }
.r004-button { border:1px solid #d0e1dc; padding:10px 13px; border-radius:10px; background:#f4faf7; color:#086b5d; white-space:nowrap; }
.r004-button:disabled { opacity:.5; }
.r004-button.primary-action { background:#0f766e; color:#fff; border-color:#0f766e; }
.r004-back { border:0; background:transparent; color:#0f766e; padding:6px 0 12px; font-weight:700; }
.r004-summary,.r004-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:12px 0 20px; }
.r004-summary>div,.r004-metrics>div { display:flex; flex-direction:column; gap:7px; min-width:0; border-radius:12px; background:#f1f8f5; padding:14px; }
.r004-summary strong,.r004-metrics strong { font-size:22px; overflow-wrap:anywhere; }
.r004-summary .r004-ratio,.r004-metrics .r004-ratio,.r004-cell .r004-ratio { font-variant-numeric:tabular-nums; white-space:nowrap; overflow-wrap:normal; }
.r004-ratio span { color:#6c807a; font-size:.76em; font-weight:500; }
.r004-summary small,.r004-metrics small,.r004-cell small,.r004-person small { color:#627972; font-size:12px; line-height:1.55; }
.r004-summary .r004-year-name { font-size:15px; }
.r004-filters { display:grid; grid-template-columns:minmax(180px,1.4fr) minmax(135px,1fr); gap:12px; }
.r004-filters label { margin:0; min-width:0; font-size:13px; }
.r004-filters input,.r004-filters select { min-width:0; padding:10px 12px; }
.r004-table-wrap { border:1px solid #dbe7e3; border-radius:12px; overflow:hidden; }
.r004-table-head,.r004-student-row { display:grid; grid-template-columns:minmax(150px,1.4fr) repeat(3,minmax(115px,1fr)) minmax(94px,.7fr); gap:12px; align-items:center; padding:12px; }
.r004-table-head { background:#edf6f2; color:#49695e; font-size:12px; font-weight:700; }
.r004-student-row { border-top:1px solid #e2ebe7; font-size:13px; }
.r004-student-row:first-of-type { border-top:0; }
.r004-cell { display:flex; flex-direction:column; gap:4px; min-width:0; overflow-wrap:anywhere; }
.r004-cell strong { font-size:14px; }
.r004-cell-label { display:none; }
.r004-identity strong { font-size:15px; }
.r004-open { color:#0d7967 !important; }
.r004-empty { padding:12px; color:#71837f; font-size:13px; }
.r004-error { background:#fff0ee; color:#a33228; padding:10px; border-radius:10px; }
.r004-person { display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; align-items:start; background:#edf6f2; border-radius:12px; padding:15px; }
.r004-person>div { display:flex; flex-direction:column; gap:6px; }
.r004-person h4 { font-size:20px; }
.r004-subtitle { font-size:17px; margin:23px 0 9px !important; }
.r004-list-scroll { border:1px solid #e0eae6; border-radius:12px; max-height:360px; overflow:auto; }
.r004-day,.r004-record { padding:12px; border-bottom:1px solid #e0eae6; font-size:13px; line-height:1.6; }
.r004-day:last-child,.r004-record:last-child { border-bottom:0; }
.r004-day { display:grid; grid-template-columns:115px minmax(0,1fr); gap:12px; }
.r004-day>div { display:flex; flex-direction:column; gap:3px; min-width:0; overflow-wrap:anywhere; }
.r004-day small,.r004-record small { display:block; color:#647c75; line-height:1.6; font-size:12px; }
@media(max-width:980px){
 .r004-table-head { display:none; }
 .r004-student-row { grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; gap:12px; }
 .r004-identity { grid-column:1/-1; padding-bottom:8px; border-bottom:1px dashed #dce8e2; }
 .r004-cell-label { display:block; font-weight:700; }
 .r004-row-action { grid-column:1/-1; align-items:stretch; }
}
@media(max-width:600px){
 .r004-summary,.r004-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
 .r004-filters { grid-template-columns:1fr; }
 .r004-student-row { grid-template-columns:1fr; }
 .r004-identity,.r004-row-action { grid-column:auto; }
 .r004-day { grid-template-columns:1fr; }
}
</style>
