<script setup>
import {computed,onMounted,ref} from 'vue'
import StudentOverview from './components/admin/StudentOverview.vue'
import DateTime24 from './components/DateTime24.vue'
import PwaInstall from './components/PwaInstall.vue'
import StayDaysSheet from './components/StayDaysSheet.vue'
import StayRecordList from './components/StayRecordList.vue'
import {calculateHomeProgress} from './utils/home-progress.mjs'
import {calculateHomeMonthly} from './utils/home-monthly.mjs'
import {reconcileCalendarDays} from './utils/calendar-days.mjs'
import {groupStayRecords} from './utils/group-stay-records.mjs'
import {splitPlanByCourseDates} from '../shared/plan-segments.mjs'
const user=ref(),mode=ref('login'),tab=ref('home'),loading=ref(true),error=ref(''),notice=ref(''),announcement=ref(''),announcementForm=ref(''),dashboard=ref(),records=ref([]),courses=ref([]),rankings=ref([]),plans=ref([]),companions=ref([]),adminData=ref(),adminUsers=ref([]),codes=ref([]),modal=ref(''),calendarMonth=ref('')
const checkoutSuccess=ref(false),pwaOnboarding=ref(false)
const stayDetailsType=ref('')
const checkoutBusy=ref(false),calendarDays=ref([]),selectedCalendarDay=ref(null)
const recordComplianceDays=ref([])
const coursesLoading=ref(false),coursesLoaded=ref(false),coursesLoadError=ref('')
const form=ref({}),manual=ref({}),planForm=ref({isPublic:false,transport:'待定',hasSeats:false,contactType:'微信'}),yearForm=ref({}),courseForm=ref({}),codeForm=ref({maxUses:1}),accountForm=ref({}),resetForm=ref({}),resetTarget=ref(null),seatActionPlan=ref(null)
const academicYears=ref([]),selectedYearId=ref(''),newYearForm=ref({}),yearSaving=ref(false)
const selectedAcademicYear=computed(()=>academicYears.value.find(y=>String(y.id)===String(selectedYearId.value)))
const groupedRecords=computed(()=>groupStayRecords(records.value,recordComplianceDays.value,{
  today:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
  from:showAllRecords.value?null:selectedAcademicYear.value?.start_date,
  to:showAllRecords.value?null:selectedAcademicYear.value?.end_date
}))
const yearFormChanged=computed(()=>Boolean(selectedAcademicYear.value)&&(
  yearForm.value.name!==selectedAcademicYear.value.name||
  yearForm.value.startDate!==selectedAcademicYear.value.start_date||
  yearForm.value.endDate!==selectedAcademicYear.value.end_date||
  Number(yearForm.value.targetDays)!==Number(selectedAcademicYear.value.target_days)
))
function resetYearForm(){const y=selectedAcademicYear.value;yearForm.value=y?{name:y.name,startDate:y.start_date,endDate:y.end_date,targetDays:y.target_days}:{}}
const planPrediction=ref(),showAllPlans=ref(false),showAllRecords=ref(false)
const planCalendarMonth=ref(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date()))
const selectedPlanDate=ref('')
const planCalendarRules=ref({})
const planHoliday=date=>planCalendarRules.value[date]?.isPublicHoliday===true
const planCalendarOffset=computed(()=>(new Date(planCalendarMonth.value+'-01T00:00:00Z').getUTCDay()+6)%7)
const planCalendarDates=computed(()=>{const [year,month]=planCalendarMonth.value.split('-').map(Number);return Array.from({length:new Date(Date.UTC(year,month,0)).getUTCDate()},(_,i)=>planCalendarMonth.value+'-'+String(i+1).padStart(2,'0'))})
const planCalendarEntries=computed(()=>plans.value.flatMap(p=>(p.segments?.length?p.segments:[{startDate:p.depart_date,endDate:p.return_date,type:'SELF'}]).map(s=>({id:p.id,start:s.startDate,end:s.endDate,type:s.type}))))
const plansOnDate=date=>planCalendarEntries.value.filter(x=>x.start<=date&&date<=x.end)
function shiftPlanCalendar(offset){const [year,month]=planCalendarMonth.value.split('-').map(Number);planCalendarMonth.value=new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7);selectedPlanDate.value='';loadPlanCalendarRules()}
const adminStudentRevision=ref(0),adminStudentInDetail=ref(false)
const ruleYear=ref(Number(new Date(Date.now()+8*3600000).toISOString().slice(0,4))),dateRuleOverview=ref(),dateRuleForm=ref({type:'PUBLIC_HOLIDAY'})
const rangeSaveHint=ref(false),rangeOpen=ref(false),rangeMonth=ref(''),rangeStart=ref(''),rangeEnd=ref('')
const rangeMonthRules=ref(null),rangeMonthLoading=ref(false),rangeChecking=ref(false),planSaving=ref(false)
const rangeReview=ref(null),saveReview=ref(null),confirmedRange=ref(null),planRangeSegments=ref([])
const rangeRuleMap=computed(()=>Object.fromEntries((rangeMonthRules.value?.days??[]).map(day=>[day.date,day])))
const rangeDayInfo=date=>rangeRuleMap.value[date]
const existingPlansOnDate=date=>plans.value.filter(p=>Number(p.id)!==Number(planForm.value.id)&&p.depart_date<=date&&date<=p.return_date)
const rangeDayLabel=date=>date+(rangeDayInfo(date)?.isCourseDay?'，集中课程':'')+(rangeDayInfo(date)?.isPublicHoliday?'，澳门公共假期':'')+(existingPlansOnDate(date).length?'，已列入计划':'')
const flaggedKinds=[
  {kind:'PUBLIC_HOLIDAY',title:'澳门公共假期',description:'预计不符合，不能计入完全符合或部分符合天数'},
  {kind:'MANUAL_INVALID',title:'管理员设定的无效日期',description:'预计不符合，不能计入完全符合或部分符合天数'},
  {kind:'ORDINARY_WEEKEND',title:'普通无课周末',description:'即使按每天满4小时预测，仍只能记为部分符合'},
  {kind:'OUTSIDE_YEAR',title:'不在当前所选学年内',description:'不计入本学年的出行预测'}
]
const warningGroups=review=>flaggedKinds.map(group=>({...group,days:(review?.flagged??[]).filter(d=>d.kind===group.kind)})).filter(g=>g.days.length)
// Only explicit dates and their classifications constitute an acknowledgement.
const dateCheckFingerprint=result=>JSON.stringify(result.days.map(d=>[d.date,d.kind,d.reason,d.isCourseDay]))
const dateCheckQuery=(start,end)=>api('/travel-plans/date-check?'+new URLSearchParams({startDate:start,endDate:end,yearId:String(selectedYearId.value)}))
async function loadPlanCalendarRules(){
  const month=planCalendarMonth.value,yearId=String(selectedYearId.value)
  planCalendarRules.value={}
  try{
    const [year,number]=month.split('-').map(Number)
    const last=new Date(Date.UTC(year,number,0)).toISOString().slice(0,10)
    const result=await dateCheckQuery(month+'-01',last)
    if(month===planCalendarMonth.value&&yearId===String(selectedYearId.value))planCalendarRules.value=Object.fromEntries(result.days.map(day=>[day.date,day]))
  }catch(e){if(month===planCalendarMonth.value)msg('公共假期标记加载失败：'+e.message)}
}
function clearRangeReview(){rangeReview.value=null}
function acceptRange(start,end,checked){planForm.value.departDate=start;planForm.value.returnDate=end;planRangeSegments.value=splitPlanByCourseDates(start,end,checked.days.filter(d=>d.isCourseDay).map(d=>d.date));confirmedRange.value={start,end,yearId:String(selectedYearId.value),fingerprint:dateCheckFingerprint(checked)};rangeOpen.value=false;rangeReview.value=null;saveReview.value=null}
async function loadRangeMonth(month){
  rangeMonthRules.value=null;rangeMonthLoading.value=true
  try{
    const [year,number]=month.split('-').map(Number)
    const last=new Date(Date.UTC(year,number,0)).toISOString().slice(0,10)
    const result=await dateCheckQuery(month+'-01',last)
    if(rangeMonth.value===month)rangeMonthRules.value=result
  }catch(e){if(rangeMonth.value===month)msg('日期标记加载失败：'+e.message)}
  finally{if(rangeMonth.value===month)rangeMonthLoading.value=false}
}

const rangeOffset=computed(()=>rangeMonth.value?(new Date(rangeMonth.value+'-01T00:00:00Z').getUTCDay()+6)%7:0)
const rangeDates=computed(()=>{if(!rangeMonth.value)return [];const [year,month]=rangeMonth.value.split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate();return Array.from({length:days},(_,i)=>rangeMonth.value+'-'+String(i+1).padStart(2,'0'))})
function openRange(){rangeSaveHint.value=false;rangeStart.value=planForm.value.departDate||'';rangeEnd.value=planForm.value.returnDate||'';rangeMonth.value=(rangeStart.value||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date())).slice(0,7);rangeReview.value=null;saveReview.value=null;rangeOpen.value=true;loadRangeMonth(rangeMonth.value)}
function shiftRange(offset){const [year,month]=rangeMonth.value.split('-').map(Number);rangeMonth.value=new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7);clearRangeReview();loadRangeMonth(rangeMonth.value)}
function pickRange(date){clearRangeReview();if(!rangeStart.value||rangeEnd.value||date<rangeStart.value){rangeStart.value=date;rangeEnd.value=''}else rangeEnd.value=date}
async function applyRange(){
  if(!rangeStart.value||!rangeEnd.value)return msg('请选择出发和返回日期')
  rangeChecking.value=true
  const start=rangeStart.value,end=rangeEnd.value
  try{
    const overlap=plans.value.find(p=>Number(p.id)!==Number(planForm.value.id)&&p.depart_date<=end&&p.return_date>=start)
    if(overlap)return msg('日期与已有计划 '+overlap.depart_date+' 至 '+overlap.return_date+' 重叠，请重新选择')
    const check=await dateCheckQuery(start,end)
    if(start!==rangeStart.value||end!==rangeEnd.value)return
    if(check.flagged.length)rangeReview.value=check
    else acceptRange(start,end,check)
  }catch(e){msg('日期检查失败：'+e.message)}finally{rangeChecking.value=false}
}
function confirmRangeReview(){if(rangeReview.value)acceptRange(rangeReview.value.startDate,rangeReview.value.endDate,rangeReview.value)}
async function api(p,o={}){const r=await fetch('/api'+p,{cache:'no-store',headers:{'content-type':'application/json'},...o}),d=await r.json();if(!r.ok)throw Error(d.error||'操作失败');return d}
const msg=(x,ok=false)=>{(ok?notice:error).value=x;setTimeout(()=>{error.value='';notice.value=''},2600)}
async function loadYears(){academicYears.value=(await api('/academic-years')).years;if(!academicYears.value.some(y=>String(y.id)===String(selectedYearId.value)))selectedYearId.value=academicYears.value.find(y=>y.is_current)?.id||''}
async function core({includeRecords=true}={}){
  const [d,r,a]=await Promise.all([api('/dashboard?yearId='+selectedYearId.value),includeRecords?api('/stays'+(showAllRecords.value?'':'?yearId='+selectedYearId.value)):Promise.resolve(null),api('/announcement')])
  dashboard.value=d;planPrediction.value=d.planPrediction;announcement.value=a.content
  if(r){
    const earlier=showAllRecords.value?await Promise.all(academicYears.value.filter(y=>String(y.id)!==String(selectedYearId.value)).map(y=>api('/compliance?yearId='+y.id).then(x=>x.compliance.dailyResults))):[]
    records.value=r.records
    recordComplianceDays.value=[...d.compliance.dailyResults,...earlier.flat()]
  }
}
const homeLoadError=ref('')
async function loadInitialHome(){try{homeLoadError.value='';await loadYears();await core({includeRecords:false})}catch(e){homeLoadError.value=e.message||'首页数据加载失败'}}
async function boot(){const invite=new URLSearchParams(window.location.search).get('invite');if(invite){mode.value='register';form.value.inviteCode=invite}try{user.value=(await api('/auth/me')).user}catch{}finally{loading.value=false}if(user.value)await loadInitialHome()}
async function auth(){try{if(mode.value==='register'){if(form.value.password!==form.value.confirmPassword)throw Error('两次输入的密码不一致');await api('/auth/register',{method:'POST',body:JSON.stringify(form.value)});mode.value='login';return msg('注册成功，请登录',true)}user.value=(await api('/auth/login',{method:'POST',body:JSON.stringify(form.value)})).user;dashboard.value=null;tab.value='home';await loadInitialHome();if(dashboard.value)showFirstLoginPwaGuide()}catch(e){msg(e.message)}}
function showFirstLoginPwaGuide(){
  if(!/Android|iPad|iPhone|iPod/i.test(navigator.userAgent)||window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)return
  // Installation belongs to a device, so remember the first prompt per account on this device.
  const key='douliuji-pwa-guide-v1-'+String(user.value?.id||form.value.username)
  try{if(localStorage.getItem(key))return;localStorage.setItem(key,'seen')}catch{return}
  tab.value='home'
  pwaOnboarding.value=true
}
async function changeYear(){resetYearForm();try{await core();if(tab.value==='plans')await loadPlans();if(tab.value==='ranking')rankings.value=(await api('/rankings?yearId='+selectedYearId.value)).rankings;if(tab.value==='calendar'){await loadCalendar(academicYears.value.find(y=>String(y.id)===String(selectedYearId.value))?.start_date.slice(0,7))} }catch(e){msg(e.message)}}
async function loadCalendar(month=calendarMonth.value||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date())){const data=await api('/calendar?month='+month+'&yearId='+selectedYearId.value);calendarMonth.value=data.month;calendarDays.value=data.days;selectedCalendarDay.value=null}
async function shiftCalendar(offset){const [year,month]=calendarMonth.value.split('-').map(Number);const date=new Date(Date.UTC(year,month-1+offset,1));try{await loadCalendar(date.toISOString().slice(0,7))}catch(e){msg(e.message)}}
const calendarOffset=computed(()=>calendarMonth.value?(new Date(calendarMonth.value+'-01T00:00:00Z').getUTCDay()+6)%7:0)
// 日期标记以当前学年的历史记录为准，分类仍使用后端的每日合规计算。
const visibleCalendarDays=computed(()=>reconcileCalendarDays(calendarDays.value,records.value,dashboard.value?.compliance?.dailyResults,new Date(Date.now()+8*3600000).toISOString().slice(0,10)))
async function loadCourses(){coursesLoading.value=true;coursesLoadError.value='';try{courses.value=(await api('/courses')).sessions;coursesLoaded.value=true}catch(e){coursesLoadError.value=e.message||'课程加载失败'}finally{coursesLoading.value=false}}
async function go(x){stayDetailsType.value='';tab.value=x;if(x!=='admin')adminStudentInDetail.value=false;try{if(x==='home'||x==='records'||x==='calendar')await core({includeRecords:x!=='home'});if(x==='calendar'){const year=academicYears.value.find(y=>String(y.id)===String(selectedYearId.value));const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());calendarMonth.value=month;await loadCalendar(year&&(!month||month+'-31'<year.start_date||month+'-01'>year.end_date)?year.start_date.slice(0,7):month||undefined)}if(x==='courses')await loadCourses();if(x==='ranking')rankings.value=(await api('/rankings?yearId='+selectedYearId.value)).rankings;if(x==='plans')await loadPlans();if(x==='companions')await loadCompanions();if(x==='admin')await loadAdmin()}catch(e){msg(e.message)}}
async function loadCompanions(){companions.value=(await api('/companions')).plans}
async function loadPlans(){
  const query=showAllPlans.value?'':'?yearId='+selectedYearId.value
  const [list,forecast]=await Promise.all([api('/travel-plans'+query),api('/travel-plans/prediction?yearId='+selectedYearId.value),loadPlanCalendarRules()])
  plans.value=list.plans;planPrediction.value=forecast.prediction
}
const forecastForPlan=id=>planPrediction.value?.perPlanForecast.find(x=>Number(x.planId)===Number(id))
// 日历数据与逗留历史由不同接口提供；记录变更后必须同步刷新当前日历，避免旧标记残留。
async function refreshStayViews(){await core();if(tab.value==='calendar')await loadCalendar()}
async function checkOut(){if(checkoutBusy.value)return;checkoutBusy.value=true;try{await api('/stays/check-out',{method:'POST'});modal.value='';await refreshStayViews();notice.value='';checkoutSuccess.value=true;setTimeout(()=>{checkoutSuccess.value=false},1800)}catch(e){msg(e.message)}finally{checkoutBusy.value=false}}
async function post(p,data,method='POST'){try{await api(p,{method,body:data?JSON.stringify(data):undefined});modal.value='';await refreshStayViews();msg('已保存',true)}catch(e){msg(e.message)}}
async function remove(id){if(confirm('确定删除这条记录吗？')){await api('/stays/'+id,{method:'DELETE'});await refreshStayViews()}}
function beijingInput(iso){return iso?new Date(Date.parse(iso)+8*3600000).toISOString().slice(0,16):''}
const ruleNames={PUBLIC_HOLIDAY:'公共假期',MANUAL_INVALID:'无效逗留日期',WEEKEND:'普通周末',COURSE_DAY:'集中课程日'}
const statusNames={COMPLIANT:'完全符合',PARTIAL:'部分符合',NON_COMPLIANT:'不符合',NO_STAY:'无记录',TIME_UNKNOWN:'时长待补正',IN_PROGRESS:'进行中'}
const reasonNames={NO_STAY:'无实际签到记录',PUBLIC_HOLIDAY:'公共假期优先',MANUAL_INVALID:'无效逗留日期优先',UNDER_4_HOURS:'实际逗留未满4小时',WEEKDAY_OVER_4H:'工作日已满4小时',COURSE_WEEKEND_OVER_4H:'课程周末已满4小时',ORDINARY_WEEKEND:'普通周末默认只能部分符合',HISTORICAL_TIME_MISSING:'历史记录缺少可信的起止时间',OPEN_STAY_IN_PROGRESS:'正在打卡，当前结果未结算'}
function editRecord(r){if(r.status==='OPEN')return msg('进行中的签到请先签退');manual.value={id:r.id,startAt:beijingInput(r.check_in_at),endAt:beijingInput(r.check_out_at)};modal.value='edit'}
async function saveRecord(){if(!manual.value.startAt||!manual.value.endAt)return msg('请填写实际入澳与离澳时间（北京时间）');if(modal.value==='edit')return post('/stays/'+manual.value.id,manual.value,'PATCH');return post('/stays',manual.value)}
async function loadDateRules(){try{dateRuleOverview.value=await api('/admin/date-rules?year='+ruleYear.value);adminStudentRevision.value++}catch(e){msg(e.message)}}
// 公共假期、历史强制无效单日、无效逗留日期区间集中在一个管理入口。
// 原有记录保留各自 ID 与存储来源，不做破坏性迁移。
const dateExceptions=computed(()=>dateRuleOverview.value?.exceptionRecords??[])
function canEditDateException(x){
  if(x.type==='PUBLIC_HOLIDAY')return true
  const year=adminData.value?.academicYear
  return Boolean(year&&x.start_date>=year.start_date&&x.end_date<=year.end_date)
}
function resetDateException(){dateRuleForm.value={type:'PUBLIC_HOLIDAY'}}
function editDateException(x){
  dateRuleForm.value={id:x.id,sourceType:x.source_type,type:x.type,startDate:x.start_date,endDate:x.end_date,reason:x.reason}
}
function syncDateExceptionEnd(){
  const x=dateRuleForm.value
  if(x.sourceType==='MANUAL_RULE'||!x.endDate||x.endDate<x.startDate)x.endDate=x.startDate
}
async function saveDateException(){
  const x=dateRuleForm.value,start=x.startDate,end=x.endDate||start
  if(!start||!end||end<start)return msg('请选择正确的开始和结束日期')
  if(!String(x.reason||'').trim())return msg('请填写日期设置原因')
  const from=String(ruleYear.value)+'-01-01',to=String(ruleYear.value)+'-12-31'
  if(start>to||end<from)return msg('设置日期应与当前查看的公历年份有交集')
  const activeYear=adminData.value?.academicYear
  if(x.type==='MANUAL_INVALID'&&(!activeYear||start<activeYear.start_date||end>activeYear.end_date))return msg('无效逗留日期须位于当前启用学年内')
  if(x.sourceType==='MANUAL_RULE'&&start!==end)return msg('历史单日规则只能设置单日；如需设置区间，请先新建，再停用旧条目')
  const isRange=x.sourceType==='RANGE'||!x.id
  const url=isRange?(x.id?'/admin/invalid-dates/'+x.id:'/admin/invalid-dates'):
    (x.id?'/admin/date-rules/'+x.id:'/admin/date-rules')
  const payload=isRange?{startDate:start,endDate:end,type:x.type,reason:x.reason}:
    {date:start,type:x.type,reason:x.reason,status:'ACTIVE'}
  if(await adminSave(url,payload,x.id?'PATCH':'POST'))resetDateException()
}
async function disableDateException(x){
  if(!confirm('确定停用 '+x.start_date+(x.end_date!==x.start_date?' 至 '+x.end_date:'')+' 的'+ruleNames[x.type]+'？'))return
  const path=x.source_type==='RANGE'?'/admin/invalid-dates/'+x.id:'/admin/date-rules/'+x.id
  if(await adminSave(path,null,'DELETE')&&dateRuleForm.value.id===x.id&&dateRuleForm.value.sourceType===x.source_type)resetDateException()
}
async function syncWeekends(){if(!confirm('同步 '+ruleYear.value+' 年所有周六和周日？已有人工规则不会被覆盖。'))return;try{const data=await api('/admin/date-rules/sync-weekends',{method:'POST',body:JSON.stringify({year:ruleYear.value})});await loadDateRules();msg('已同步：新增 '+data.added+' 天；总周末 '+data.total+' 天',true)}catch(e){msg(e.message)}}
async function saveBackfill(){if(!manual.value.endAt)return msg('请填写准确的北京时间');await post('/stays/check-out/backfill',{endAt:manual.value.endAt})}
async function loadAdmin(){const [a,u,c,rules]=await Promise.all([api('/admin/config'),api('/admin/users'),api('/admin/invite-codes'),api('/admin/date-rules?year='+ruleYear.value)]);dateRuleOverview.value=rules;adminData.value=a;adminUsers.value=u.users;codes.value=c.codes;announcementForm.value=a.announcement;resetYearForm();adminStudentRevision.value++}
async function saveAnnouncement(){if(Array.from(announcementForm.value.trim()).length>140)return msg('公告最多140字');if(await adminSave('/admin/announcement',{content:announcementForm.value},'PUT'))announcement.value=announcementForm.value.trim()}
async function adminSave(p,data,method='POST'){try{await api(p,{method,body:data?JSON.stringify(data):undefined});await loadAdmin();await core();msg('后台配置已更新',true);return true}catch(e){msg(e.message);return false}}
async function saveAccount(){try{if(accountForm.value.newPassword!==accountForm.value.confirmPassword)throw Error('两次输入的新密码不一致');const data={displayName:accountForm.value.displayName};if(accountForm.value.newPassword||accountForm.value.currentPassword||accountForm.value.confirmPassword)Object.assign(data,{currentPassword:accountForm.value.currentPassword,newPassword:accountForm.value.newPassword,confirmPassword:accountForm.value.confirmPassword});user.value=(await api('/account',{method:'PATCH',body:JSON.stringify(data)})).user;accountForm.value={displayName:user.value.displayName};msg('账号设置已保存',true)}catch(e){msg(e.message)}}
async function generateInvite(){try{const result=await api('/admin/invite-codes',{method:'POST',body:JSON.stringify({maxUses:codeForm.value.maxUses})});await loadAdmin();msg('邀请码已生成：'+result.code,true)}catch(e){msg(e.message)}}
async function deleteInvite(x){
  if(!confirm('确定删除邀请码 '+x.code+' 吗？删除后该码立即失效，已注册的账号不受影响。'))return
  await adminSave('/admin/invite-codes/'+x.id,null,'DELETE')
}
async function deleteUser(x){
  if(!confirm('确定删除人员“'+x.display_name+'”（'+x.username+'）吗？该账号将立即无法登录，相关公开计划和预约会取消；历史逗留数据保留用于审计及备份。'))return
  await adminSave('/admin/users/'+x.id,null,'DELETE')
}
async function copyInvite(code){try{const link=new URL(window.location.origin+window.location.pathname);link.searchParams.set('invite',code);await navigator.clipboard.writeText(link.toString());msg('注册链接已复制',true)}catch{msg('复制失败，请重试')}}async function resetUserPassword(){try{if(resetForm.value.newPassword!==resetForm.value.confirmPassword)throw Error('两次输入的新密码不一致');if(await adminSave('/admin/users/'+resetTarget.value.id,{...resetForm.value,reason:'管理员重置密码'},'PATCH')){modal.value='';resetForm.value={}}}catch(e){msg(e.message)}}
async function saveYear(){
  const original=selectedAcademicYear.value
  if(!original||yearSaving.value)return
  const x={...yearForm.value,name:String(yearForm.value.name||'').trim()}
  if(!x.name||!x.startDate||!x.endDate||x.startDate>x.endDate||!Number.isInteger(Number(x.targetDays))||Number(x.targetDays)<1)return msg('请检查学年名称、起止日期及目标天数')
  if(!yearFormChanged.value)return
  const changesDates=x.startDate!==original.start_date||x.endDate!==original.end_date
  const message=`确定保存“${original.name}”的修改吗？\n${original.start_date} 至 ${original.end_date} → ${x.startDate} 至 ${x.endDate}\n目标天数：${original.target_days} → ${x.targetDays}\n${changesDates?'学年范围发生变化，现有逗留记录不会被删除，但符合天数及计划预测会按新日期范围重新计算。':'现有学生逗留记录不会被删除。'}\n此操作不会自动启用该学年。`
  if(!confirm(message))return
  const id=original.id
  yearSaving.value=true
  try{
    await api('/admin/academic-years/'+id,{method:'PATCH',body:JSON.stringify(x)})
    await loadYears();await loadAdmin();await core()
    if(tab.value==='admin')adminStudentRevision.value++
    msg('所选学年已更新',true)
  }catch(e){msg(e.message)}finally{yearSaving.value=false}
}
async function createYear(){try{const y=await api('/admin/academic-years',{method:'POST',body:JSON.stringify(newYearForm.value)});await loadYears();selectedYearId.value=y.id;await loadAdmin();await core();newYearForm.value={};msg('新学年已启用',true)}catch(e){if(e.message?.startsWith('该学年已存在')){await loadYears();const existing=academicYears.value.find(y=>y.start_date===newYearForm.value.startDate&&y.end_date===newYearForm.value.endDate);if(existing){selectedYearId.value=existing.id;await loadAdmin();await core()}}msg(e.message)}}
async function activateSelectedYear(){
  const y=academicYears.value.find(y=>String(y.id)===String(selectedYearId.value))
  if(!y)return msg('请先选择要启用的学年')
  if(!confirm(`确定启用“${y.name}”（${y.start_date} 至 ${y.end_date}）吗？\n这会改变全站默认学年及后台课程、日期规则的管理范围。`))return
  try{await api('/admin/academic-years/'+y.id+'/activate',{method:'PATCH'});await loadYears();await loadAdmin();await core();msg('已启用学年：'+y.name,true)}
  catch(e){msg(e.message)}
}
function editCourse(x){courseForm.value={id:x.id,title:x.title,location:x.location,instructor:x.instructor||'',startAt:x.start_at,endAt:x.end_at}}
async function saveCourse(){if(String(selectedYearId.value)!==String(adminData.value?.academicYear?.id))return msg('页面所选学年不是后台当前启用学年。请先点击上方“启用所选学年”后发布');const x=courseForm.value,id=x.id;if(await adminSave(id?'/admin/courses/'+id:'/admin/courses',x,id?'PATCH':'POST'))courseForm.value={}}
async function disableCourse(id){if(await adminSave('/admin/courses/'+id,null,'DELETE')&&courseForm.value.id===id)courseForm.value={}}
async function deleteCourse(x){if(!confirm(`确定删除集中课程“${x.title}”吗？删除后，前台课程和对应日期标记将不再显示；历史操作记录保留。`))return;try{await api('/admin/courses/'+x.id+'?action=delete',{method:'DELETE'});if(courseForm.value.id===x.id)courseForm.value={};await loadAdmin();await core();msg('课程已删除',true)}catch(e){msg(e.message)}}
function editPlan(plan){planRangeSegments.value=plan.segments||[];planForm.value={id:plan.id,departDate:plan.depart_date,returnDate:plan.return_date,isPublic:Boolean(plan.is_public),city:plan.city||'',transport:plan.transport||'待定',hasSeats:Boolean(plan.has_seats),seatCount:plan.seat_capacity??plan.seat_count??null,contactType:plan.contact_type||'微信',contactValue:plan.contact_value||'',activeReservations:plan.active_reservations||0};rangeOpen.value=false;rangeReview.value=null;saveReview.value=null;confirmedRange.value=null;modal.value='plan'}
async function commitPlan(){
  if(planSaving.value)return
  planSaving.value=true
  try{
    const id=planForm.value.id
    await api(id?'/travel-plans/'+id:'/travel-plans',{method:id?'PATCH':'POST',body:JSON.stringify(planForm.value)})
    planForm.value={isPublic:false,transport:'待定',hasSeats:false,contactType:'微信'}
    planRangeSegments.value=[]
    confirmedRange.value=null;saveReview.value=null;modal.value='';await go('plans');msg('出行计划已保存',true)
  }catch(e){msg(e.message)}finally{planSaving.value=false}
}
async function savePlan(){
  if(planSaving.value||rangeChecking.value)return
  if(rangeOpen.value){rangeSaveHint.value=true;return msg('请先点击「确定日期」，再保存计划')}
  const start=planForm.value.departDate,end=planForm.value.returnDate
  if(!start||!end)return msg('请先选择出行日期')
  planSaving.value=true
  try{
    const check=await dateCheckQuery(start,end)
    if(start!==planForm.value.departDate||end!==planForm.value.returnDate)return
    planRangeSegments.value=splitPlanByCourseDates(start,end,check.days.filter(d=>d.isCourseDay).map(d=>d.date))
    const hasConfirmed=confirmedRange.value?.start===start&&confirmedRange.value?.end===end&&
      confirmedRange.value?.yearId===String(selectedYearId.value)&&confirmedRange.value?.fingerprint===dateCheckFingerprint(check)
    if(check.flagged.length&&!hasConfirmed){saveReview.value=check;return}
  }catch(e){msg('保存前日期检查失败：'+e.message);return}
  finally{planSaving.value=false}
  await commitPlan()
}
async function confirmSaveReview(){
  const review=saveReview.value
  if(!review)return
  if(review.startDate!==planForm.value.departDate||review.endDate!==planForm.value.returnDate){
    saveReview.value=null
    return msg('计划日期已修改，请重新检查后保存')
  }
  saveReview.value=null
  await commitPlan()
}
async function unpublishPlan(plan){try{await api('/travel-plans/'+plan.id,{method:'PATCH',body:JSON.stringify({departDate:plan.depart_date,returnDate:plan.return_date,isPublic:false})});await go('plans');msg('已取消公开',true)}catch(e){msg(e.message)}}
async function deletePlan(id){if(confirm((plans.value.find(p=>p.id===id)?.active_reservations||0)>0?'该计划已有预约。请先与预约人线下沟通；删除后这些预约会取消。确定删除？':'确定删除这条计划吗？')){await api('/travel-plans/'+id,{method:'DELETE'});await go('plans')}}
function openSeatAction(plan,kind){seatActionPlan.value=plan;modal.value=kind}
async function reserveCompanionSeat(){try{await api('/travel-plans/'+seatActionPlan.value.id+'/reservations',{method:'POST'});modal.value='';seatActionPlan.value=null;await loadCompanions();msg('预约成功，发布者联系方式已显示',true)}catch(e){msg(e.message)}}
async function cancelCompanionSeat(){try{await api('/travel-plans/'+seatActionPlan.value.id+'/reservations/me',{method:'DELETE'});modal.value='';seatActionPlan.value=null;await loadCompanions();msg('已取消预约并释放座位',true)}catch(e){msg(e.message)}}
async function undoCheckOut(x){if(!confirm('确定撤销 '+x.display_name+' 最近一次签退吗？撤销后会恢复为未签退状态。'))return;await adminSave('/admin/users/'+x.id+'/undo-check-out',null,'POST')}
async function manageUser(x,kind){const data={reason:'管理员维护'};if(kind==='name'){const v=prompt('修改姓名',x.display_name);if(!v)return;data.displayName=v}if(kind==='password'){resetTarget.value=x;resetForm.value={};modal.value='reset-password';return}if(kind==='status')data.status=x.status==='ACTIVE'?'DISABLED':'ACTIVE';await adminSave('/admin/users/'+x.id,data,'PATCH')}
async function logout(){await api('/auth/logout',{method:'POST'});user.value=null}
const homeProgress=computed(()=>calculateHomeProgress(dashboard.value?.compliance,dashboard.value?.stats?.targetDays))
const homeMonthly=computed(()=>calculateHomeMonthly(dashboard.value?.compliance,dashboard.value?.planPrediction))
onMounted(boot)
</script>
<template>
<main v-if="loading" class="loading">正在打开逗留记…</main>
<main v-else-if="!user" class="auth-page"><div class="auth-shell"><section class="brand"><img class="logo" src="/icon-192.png" alt="逗留记图标" width="64" height="64"><h1>逗留记</h1><p>步履有迹，逗留有期，求知无涯。</p></section><div class="auth-panel"><section class="auth-card"><div class="seg"><button :class="{active:mode==='login'}" @click="mode='login'">登录</button><button :class="{active:mode==='register'}" @click="mode='register'">邀请码注册</button></div><label v-if="mode==='register'">姓名<input v-model="form.displayName"></label><label>登录账号<input v-model="form.username"></label><label>密码<input type="password" v-model="form.password"></label><label v-if="mode==='register'">确认密码<input type="password" v-model="form.confirmPassword"></label><label v-if="mode==='register'">邀请码<input v-model="form.inviteCode"></label><p v-if="error" class="error">{{error}}</p><button class="primary" @click="auth">{{mode==='login'?'登录':'注册'}}</button><p class="auth-caption">记录逗留，掌握进度。</p></section></div></div></main>
<main v-else class="app-shell" :class="{'admin-shell':tab==='admin'}"><header><div><label v-if="tab==='home'" class="year-picker">学年<select v-model="selectedYearId" @change="changeYear"><option v-for="year in academicYears" :key="year.id" :value="year.id">{{year.name}}</option></select></label><h1>{{tab==='home'?'你好，'+(user.displayName||user.display_name):{records:'逗留记录',courses:'课程安排',calendar:'逗留日历',ranking:'逗留排行',plans:'计划出行',companions:'寻搭子',account:'账号设置',admin:'管理员后台'}[tab]}}</h1></div><div class="header-actions"><button v-if="dashboard?.openStay" class="pending-reminder" type="button" aria-label="查看未签退提醒" title="有未签退记录" @click="modal='reminder'"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 1.5M5 3 2.5 5.5M19 3l2.5 2.5"/></svg><span class="pending-badge"></span></button></div></header>
<section v-if="tab==='home'&&!dashboard" class="home-loading" role="status"><p v-if="homeLoadError">{{homeLoadError}}</p><p v-else>正在加载首页数据…</p><button v-if="homeLoadError" class="secondary" @click="loadInitialHome">重试</button></section>
<template v-if="tab==='home'&&dashboard"><section v-if="announcement" class="announcement-card" aria-label="公告"><div class="announcement-heading"><span class="announcement-icon">公告</span><strong>最新公告</strong></div><p>{{announcement}}</p></section><section class="progress-card" aria-label="本学年逗留统计">
  <h2 class="progress-title">已逗留天数<sup class="metric-asterisk" aria-label="查看统计说明">*</sup></h2>
  <div class="progress-total">
    <strong>{{homeProgress.days}}<small> 天</small></strong>
    <span>完全符合与部分符合的累计天数</span>
  </div>
  <div class="progress-breakdown" aria-label="逗留分类天数">
    <button class="progress-metric" type="button" aria-label="查看完全符合的具体逗留日期" @click="stayDetailsType='COMPLIANT'">
      <span>符合留服逗留 <small>（完全符合）<sup class="metric-asterisk" aria-label="查看统计说明">*</sup></small></span>
      <strong>{{dashboard.compliance.compliantDays}}<small> 天</small></strong>
      <em class="metric-view">查看日期 ›</em>
    </button>
    <button class="progress-metric" type="button" aria-label="查看部分符合的具体逗留日期" @click="stayDetailsType='PARTIAL'">
      <span>未完全符合留服逗留 <small>（部分符合）<sup class="metric-asterisk" aria-label="查看统计说明">*</sup></small></span>
      <strong>{{dashboard.compliance.partialDays}}<small> 天</small></strong>
      <em class="metric-view">查看日期 ›</em>
    </button>
  </div>
  <details class="progress-note" aria-label="逗留天数计算规则">
    <summary>统计说明<span class="progress-note-chevron" aria-hidden="true"></span></summary>
    <ol>
      <li><b>符合留服逗留（完全符合）：</b>所选学年内，当天在澳门累计逗留至少 4 小时，并且属于普通工作日或已安排集中课程的周末；澳门公共假期、管理员设定的无效逗留日期不计入。</li>
      <li><b>未完全符合留服逗留（部分符合）：</b>已确认有实际逗留，但当日累计不足 4 小时，或虽然达到 4 小时、却属于未设置为有效日的普通周末；公共假期和管理员设定的无效日期同样不计入。</li>
      <li><b>已逗留天数：</b>完全符合天数 + 部分符合天数。同一天最多计入 1 天，不重复累加。</li>
    </ol>
    
  </details>
</section><section class="status-card"><div><span class="dot" :class="{on:dashboard.openStay}"></span><strong>{{dashboard.openStay?'当前在澳门':'当前不在澳门'}}</strong><p>{{dashboard.openStay?'签到日期 '+(dashboard.openStay.check_in_at?beijingInput(dashboard.openStay.check_in_at).replace('T',' '):dashboard.openStay.start_date):'到达后点击签到即可'}}</p></div><button v-if="!dashboard.openStay" class="check" @click="modal='confirm-check-in'">签到</button><div v-else class="actions"><button class="check checkout" :disabled="checkoutBusy" @click="checkOut">{{checkoutBusy?'签退中…':'签退'}}</button><button class="secondary" @click="manual={endAt:beijingInput(new Date().toISOString())};modal='backfill'">补录签退</button></div></section><div class="quick"><button @click="manual={startAt:'',endAt:''};modal='manual'"><b>＋</b>手动补录</button><button @click="go('plans')"><b>行</b>计划出行</button><button @click="go('companions')"><b>伴</b>寻搭子</button><button @click="go('records')"><b>⌁</b>历史记录</button></div><section class="plan-summary home-plan-summary monthly-travel" aria-label="本月出行"><div class="monthly-travel-head"><h3>本月出行</h3><span>{{homeMonthly.monthLabel}}</span></div><div class="monthly-travel-row"><span>计划出行</span><strong>{{homeMonthly.plannedDays}}<small>天</small></strong></div><div class="monthly-travel-row monthly-travel-actual"><div class="monthly-travel-total"><span>实际逗留</span><strong>{{homeMonthly.actualDays}}<small>天</small></strong></div><div class="monthly-travel-progress" role="progressbar" :aria-valuenow="homeMonthly.actualDays" :aria-valuemax="Math.max(homeMonthly.plannedDays,homeMonthly.actualDays,1)" :aria-label="'本月实际逗留 '+homeMonthly.actualDays+' 天，计划出行 '+homeMonthly.plannedDays+' 天'"><div class="monthly-travel-progress-fill" :style="{width:(homeMonthly.plannedDays?Math.min(100,homeMonthly.actualDays/homeMonthly.plannedDays*100):0)+'%'}"></div></div><div class="monthly-travel-details"><span>完全符合 <b>{{homeMonthly.compliantDays}}天</b></span><span>部分符合 <b>{{homeMonthly.partialDays}}天</b></span></div></div></section></template>
<template v-if="tab==='records'"><div class="section-bar"><h2>{{showAllRecords?'所有历史逗留记录':'本学年逗留记录'}}</h2><button class="secondary compact" @click="showAllRecords=!showAllRecords;core()">{{showAllRecords?'仅显示本学年':'查看全部历史'}}</button></div><StayRecordList :groups="groupedRecords" @edit="editRecord" @delete="remove"/></template>
<template v-if="tab==='calendar'"><div class="calendar-title"><button class="secondary" aria-label="上个月" @click="shiftCalendar(-1)">‹</button><h2>{{calendarMonth.replace('-','年')}}月</h2><button class="secondary" aria-label="下个月" @click="shiftCalendar(1)">›</button></div><div class="calendar-legend" aria-label="逗留日历图例"><span class="legend-effective"><i aria-hidden="true"></i>完全符合</span><span class="legend-partial"><i aria-hidden="true"></i>部分符合</span><span class="legend-holiday"><i aria-hidden="true">假</i>澳门公共假期</span></div><section class="calendar-grid"><b v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{day}}</b><span v-for="n in calendarOffset" :key="'blank'+n"></span><button v-for="day in visibleCalendarDays" :key="day.date" type="button" class="calendar-day" :class="{effective:day.complianceStatus==='COMPLIANT',invalid:day.complianceStatus==='NON_COMPLIANT',partial:day.complianceStatus==='PARTIAL',pending:['TIME_UNKNOWN','IN_PROGRESS'].includes(day.complianceStatus),'outside-year':!day.inAcademicYear,selected:selectedCalendarDay?.date===day.date}" :aria-label="day.date+' '+(!day.inAcademicYear?'学年外':statusNames[day.complianceStatus]||'未结算')+(day.isCourse?' 课程':'')+(day.inAcademicYear&&day.ruleDetails?.some(r=>r.type==='PUBLIC_HOLIDAY')?' 澳门公共假期':'')+(day.isPresent?' 实际逗留':'')" @click="selectedCalendarDay=day"><span class="day-number">{{Number(day.date.slice(-2))}}</span><i v-if="day.isPresent" class="stay-mark"></i><span v-if="day.isCourse" class="course-mark">课</span><span v-if="day.inAcademicYear&&day.ruleDetails?.some(r=>r.type==='PUBLIC_HOLIDAY')" class="holiday-mark" aria-hidden="true">假</span></button></section><p v-if="selectedCalendarDay?.inAcademicYear" class="calendar-detail">{{selectedCalendarDay.date}} · {{selectedCalendarDay.isPresent&&selectedCalendarDay.complianceStatus==='NO_STAY'?'有签到记录（时长为零）':statusNames[selectedCalendarDay.complianceStatus]||'尚未结算'}}<span v-if="selectedCalendarDay.isCourse"> · 课程</span><span> · {{selectedCalendarDay.isPresent?'实际逗留':'无逗留记录'}}</span><span v-if="selectedCalendarDay.complianceStatus"> · 实际{{Math.floor(selectedCalendarDay.stayMinutes)}}分钟 · {{reasonNames[selectedCalendarDay.reasonCode]||''}}</span><span v-if="selectedCalendarDay.ruleDetails?.length"> · 日期规则：{{selectedCalendarDay.ruleDetails.map(r=>ruleNames[r.type]||r.type).join('、')}} {{selectedCalendarDay.ruleDetails.map(r=>r.reason).filter(Boolean).join('；')}}</span><span v-if="selectedCalendarDay.isInvalidDate&&selectedCalendarDay.invalidReason"> · {{selectedCalendarDay.invalidReason}}</span></p><p v-else-if="selectedCalendarDay" class="calendar-detail">{{selectedCalendarDay.date}} · 非学年内</p><h2>所有逗留记录</h2><StayRecordList :groups="groupedRecords" @edit="editRecord" @delete="remove"/></template>
<template v-if="tab==='courses'"><section class="course-list"><div v-if="coursesLoading" class="course-loading" role="status" aria-live="polite"><div class="course-placeholder" aria-hidden="true"><span></span><span></span><span></span><span></span></div><p>正在加载课程安排…</p></div><div v-else-if="coursesLoadError" class="course-loading" role="alert"><p>课程加载失败：{{coursesLoadError}}</p><button class="secondary" @click="loadCourses">重试</button></div><template v-else><article v-for="(s,index) in courses" :key="s.id" class="course-card"><p>第 {{index+1}} 次集中课</p><h3>{{s.title}}</h3><p v-if="s.instructor">导师：{{s.instructor}}</p><p>地点：{{s.location||'未填写'}}</p><p v-if="s.start_at&&s.end_at">{{s.start_at.replace('T',' ')}} 至 {{s.end_at.replace('T',' ')}}</p><p v-else>{{s.dates.map(d=>d.course_date).join('、')}}</p></article><p v-if="coursesLoaded&&!courses.length" class="empty-card">管理员还没有发布课程安排</p><p v-if="coursesLoaded" class="course-note">课程信息供日常查询使用。如有调课、时间或地点变动，请以学校正式通知为准。</p></template></section></template>
<template v-if="tab==='ranking'"><section class="ranking-list"><article v-for="r in rankings" :key="r.id" :class="{me:r.isMe}"><b>{{r.rank}}</b><div><strong>{{r.displayName}} <small v-if="r.isMe">我</small></strong><p>实际{{r.actualDays}}天 · 扣除{{r.invalidDays}}天</p></div><span>{{r.effectiveDays}}天</span></article></section></template>
<section v-if="tab==='account'" class="admin-card account-card"><label>姓名<input v-model="accountForm.displayName" maxlength="40"></label><label>当前密码（修改密码时填写）<input type="password" v-model="accountForm.currentPassword"></label><label>新密码（至少8位）<input type="password" v-model="accountForm.newPassword"></label><label>确认新密码<input type="password" v-model="accountForm.confirmPassword"></label><button class="primary" @click="saveAccount">保存设置</button><button v-if="user.role==='ADMIN'" class="secondary account-admin" @click="go('admin')">管理员后台</button><button class="secondary account-logout" @click="logout">退出登录</button><div class="account-doc-links"><a href="/docs/version.html">版本说明 <span aria-hidden="true">›</span></a><a href="/docs/guide.html">使用说明 <span aria-hidden="true">›</span></a></div></section>
<template v-if="tab==='plans'"><section class="section-bar plans-header"><button class="primary compact plan-add-button" @click="planForm={isPublic:false,transport:'待定',hasSeats:false,contactType:'微信'};planRangeSegments=[];rangeOpen=false;rangeReview=null;saveReview=null;confirmedRange=null;modal='plan'">新增计划</button></section>
<section v-if="planPrediction" class="plan-summary">
  <h3>出行计划统计</h3>
  
  <div class="plan-metrics">
    <div><span>已计划</span><strong>{{planPrediction.overview.totalPlannedDays}}天</strong></div>
    <div><span>本年计划</span><strong>{{planPrediction.overview.yearPlannedDays}}天</strong></div>
    <div><span>本月计划</span><strong>{{planPrediction.overview.monthPlannedDays}}天</strong></div>
    <div><span>实际出行天数</span><strong>{{dashboard?.stats?.actualDays ?? 0}}天</strong></div>
  </div>
</section>
<section class="plan-calendar-card" aria-label="出行日历"><div class="plan-calendar-heading"><h3>出行日历</h3><div class="plan-calendar-switch"><button type="button" class="secondary" aria-label="上个月" @click="shiftPlanCalendar(-1)">‹</button><strong>{{planCalendarMonth.replace('-','年')}}月</strong><button type="button" class="secondary" aria-label="下个月" @click="shiftPlanCalendar(1)">›</button></div></div><div class="plan-calendar-legend"><span class="plan-day-swatch"></span>已计划出行<span class="plan-holiday-swatch">假</span>澳门公共假期</div><div class="plan-calendar-grid"><b v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{day}}</b><span v-for="n in planCalendarOffset" :key="'plan-blank'+n"></span><button v-for="date in planCalendarDates" :key="date" type="button" :class="{'is-planned':plansOnDate(date).length>0,'is-selected':selectedPlanDate===date}" :aria-label="date+(planHoliday(date)?'，澳门公共假期':'')+(plansOnDate(date).length?'，已计划出行':'，无计划')" @click="selectedPlanDate=date"><span>{{Number(date.slice(-2))}}</span><small v-if="planHoliday(date)" class="plan-holiday-mark" aria-hidden="true">假</small><i v-if="plansOnDate(date).length" aria-hidden="true"></i></button></div><p v-if="selectedPlanDate" class="plan-calendar-detail">{{selectedPlanDate}}<span v-if="planHoliday(selectedPlanDate)"> · 澳门公共假期</span> · {{plansOnDate(selectedPlanDate).length?plansOnDate(selectedPlanDate).map(x=>x.type==='COURSE'?'课程安排':'自行安排').filter((v,i,a)=>a.indexOf(v)===i).join('、'):'无出行计划'}}</p></section>
<div class="section-bar"><h3>我的出行计划</h3><button class="secondary compact" @click="showAllPlans=!showAllPlans;loadPlans()">{{showAllPlans?'仅显示当前学年':'查看全部历史计划'}}</button></div><section class="plan-list"><article v-for="p in plans" :key="p.id" class="course-card"><div class="plan-entry-main"><div v-for="(segment,index) in p.segments" :key="p.id+'-'+index" class="plan-title-line plan-segment-line"><span class="plan-type-label" :class="segment.type==='COURSE'?'plan-type-course':'plan-type-self'">{{segment.type==='COURSE'?'课程安排':'自行安排'}}</span><strong>{{segment.startDate}} 至 {{segment.endDate}}</strong></div><p v-if="p.is_public">已公开寻搭子 · {{p.city}} · {{p.transport}}</p><p v-if="p.is_public&&p.transport==='自驾'&&p.has_seats" class="seat-owner-summary">座位：剩余 {{p.remaining_seats}} / 共 {{p.seat_capacity}} · 已预约 {{p.active_reservations}} 人</p></div><span class="row-actions"><button @click="editPlan(p)">修改</button><button v-if="p.is_public" @click="unpublishPlan(p)">取消公开</button><button class="danger" @click="deletePlan(p.id)">删除</button></span></article><p v-if="!plans.length" class="empty-card">当前筛选范围内还没有出行计划</p></section></template>
<template v-if="tab==='companions'"><p class="page-note">公开计划均可浏览；仅“自驾且提供座位”的计划可直接预约。预约成功后才向预约人展示发布者联系方式，取消预约后系统不再下发该联系方式。</p><section class="plan-list companion-list"><article v-for="p in companions" :key="p.id" class="course-card companion-card"><div class="companion-main"><strong>{{p.display_name}} · {{p.depart_date}}出发</strong><p>{{p.city}} · {{p.transport}} · {{p.return_date}}返回</p><p v-if="p.transport==='自驾'&&p.has_seats" class="seat-summary">座位：剩余 {{p.remaining_seats}} / 共 {{p.seat_capacity}}<span v-if="p.is_full" class="seat-full"> · 已满</span></p><p v-if="p.is_reserved_by_me" class="reservation-ok">✓ 已预约</p><p v-if="p.contact" class="contact-card">发布者联系方式：<strong>{{p.contact.type}} · {{p.contact.value}}</strong></p><p v-else-if="p.reservation_unavailable_reason" class="page-note">{{p.reservation_unavailable_reason}}</p></div><div class="companion-actions"><span v-if="p.is_owner" class="owner-badge">这是你的计划</span><button v-else-if="p.is_reserved_by_me" class="secondary compact" @click="openSeatAction(p,'cancel-seat')">取消预约</button><button v-else-if="p.can_reserve" class="primary compact" @click="openSeatAction(p,'reserve-seat')">预约座位</button><span v-else-if="p.transport==='自驾'&&p.has_seats&&p.is_full" class="seat-full">已满</span></div></article><p v-if="!companions.length" class="empty-card">暂时没有公开计划</p></section></template>
<template v-if="tab==='admin'&&adminData"><section class="admin-grid"><article class="admin-card wide"><StudentOverview :year-id="selectedYearId" :refresh-key="adminStudentRevision" @detail-change="adminStudentInDetail=$event" /></article></section><section v-show="!adminStudentInDetail" class="admin-grid"><article class="admin-card wide"><h3>首页公告</h3><label>公告内容（最多140字）<textarea v-model="announcementForm" maxlength="140" rows="3" placeholder="输入公告内容，留空并保存可撤下公告"></textarea></label><div class="announcement-editor-actions"><small>{{Array.from(announcementForm).length}}/140 字</small><button class="primary compact" @click="saveAnnouncement">保存公告</button></div></article><div class="admin-section-heading wide"><h2>学年管理</h2><p>编辑已有学年或创建新学年，两项操作互不影响。</p></div><article class="admin-card academic-year-card academic-year-edit-card"><h3>编辑所选学年</h3><p class="page-note academic-year-context">正在编辑：<strong>{{selectedAcademicYear?.name||'未选择学年'}}</strong>（{{selectedAcademicYear?.is_current?'当前启用':'仅编辑，不切换启用状态'}}）</p><label>名称<input v-model="yearForm.name" maxlength="60"></label><div class="two"><label>开始日期<input type="date" v-model="yearForm.startDate"></label><label>结束日期<input type="date" v-model="yearForm.endDate"></label></div><label>目标天数<input type="number" min="1" step="1" v-model.number="yearForm.targetDays"></label><p class="page-note academic-year-hint">可修正创建时填错的日期。保存后统计及计划预测会按新范围重新计算，逗留记录不删除；不能与其他学年重叠，也不能排除已有有效课程或无效日期。</p><div class="row-actions academic-year-footer"><button class="primary compact" :disabled="!yearFormChanged||yearSaving" @click="saveYear">{{yearSaving?'正在保存…':'保存学年修改'}}</button><button class="secondary compact" :disabled="!yearFormChanged||yearSaving" @click="resetYearForm">取消修改</button></div></article><article class="admin-card academic-year-card academic-year-create-card"><h3>启用与新建学年</h3><div class="academic-year-current"><span>当前启用学年</span><strong>{{adminData.academicYear.name}}</strong><small>{{adminData.academicYear.start_date}} 至 {{adminData.academicYear.end_date}}</small><small>课程发布及日期管理以该学年范围为准。</small></div><div v-if="String(selectedYearId)!==String(adminData.academicYear.id)" class="academic-year-switch"><p>顶部选中的是 {{academicYears.find(y=>String(y.id)===String(selectedYearId))?.name||'其他学年'}}，尚未启用。</p><button class="secondary compact" @click="activateSelectedYear">启用所选学年</button></div><h4 class="academic-year-subtitle">创建新学年</h4><div class="two"><label>开始日期<input type="date" v-model="newYearForm.startDate"></label><label>结束日期<input type="date" v-model="newYearForm.endDate"></label></div><label>目标天数<input type="number" min="1" v-model="newYearForm.targetDays"></label><div class="academic-year-footer"><button class="primary compact" @click="createYear">创建并设为当前学年</button></div></article><article class="admin-card wide date-rules-card"><h3>公共假期与无效逗留日期</h3>
<p class="page-note">统一在这里新增、修改或停用公共假期、强制无效日和无效逗留日期。两类日期均不计入符合天数，即使当天有集中课程也不会覆盖。其他周末只有安排了集中课程才具备完全符合资格。</p>
<div class="date-rules-toolbar"><label>查看公历年份<input type="number" min="1900" max="2099" v-model.number="ruleYear" @change="loadDateRules"></label><button class="secondary compact" @click="syncWeekends">同步本年度周末</button><span v-if="dateRuleOverview">已同步 {{dateRuleOverview.syncedWeekends}} / {{dateRuleOverview.totalWeekends}} 个周末（仅日历记录，不赋予有效资格）</span></div>
<div class="date-rule-form"><label>日期类型<select v-model="dateRuleForm.type" :disabled="Boolean(dateRuleForm.id)" @change="syncDateExceptionEnd"><option value="PUBLIC_HOLIDAY">澳门公共假期</option><option value="MANUAL_INVALID">无效逗留日期</option></select></label><label>开始日期<input type="date" v-model="dateRuleForm.startDate" @change="syncDateExceptionEnd"></label><label>结束日期<input type="date" v-model="dateRuleForm.endDate" :disabled="dateRuleForm.sourceType==='MANUAL_RULE'"></label><label>原因<input v-model="dateRuleForm.reason" maxlength="120" placeholder="例如：澳门法定假日／学校指定无效日"></label><button class="primary compact" @click="saveDateException">{{dateRuleForm.id?'保存修改':'新增日期'}}</button><button v-if="dateRuleForm.id" class="secondary compact" @click="resetDateException">取消修改</button></div>
<p class="page-note" v-if="dateRuleForm.type==='MANUAL_INVALID'">无效逗留日期支持单日或日期区间，必须位于当前启用学年 {{adminData.academicYear.start_date}} 至 {{adminData.academicYear.end_date}} 之内。历史单日规则修改时不能改成区间；如需改为区间，请新增后停用旧记录。</p>
<div class="date-rules-list" v-if="dateRuleOverview"><div class="date-rules-row" v-for="x in dateExceptions" :key="x.source_type+'-'+x.id"><div><strong>{{x.start_date}}{{x.end_date!==x.start_date?' 至 '+x.end_date:''}}</strong><p>{{ruleNames[x.type]}} · {{x.reason}}</p><small v-if="!canEditDateException(x)">其他学年的历史无效日（仅查看）</small></div><div class="row-actions" v-if="canEditDateException(x)"><button class="secondary compact" @click="editDateException(x)">修改</button><button class="secondary compact" @click="disableDateException(x)">停用</button></div></div><p v-if="!dateExceptions.length" class="page-note date-exceptions-empty">所选年份暂未设置公共假期或无效日期</p></div>
<details class="date-rule-details" v-if="dateRuleOverview"><summary>查看全年周末、集中课程及每日判定明细</summary><div class="date-rules-list"><div v-for="day in dateRuleOverview.dates" :key="day.date" class="date-rules-row"><div><strong>{{day.date}}（{{day.weekday}}）</strong><p>{{day.effect}} <small v-if="day.isCourseDay">· 集中课程日</small> <small v-if="day.hasSyncedWeekend">· 周末已同步</small></p><small v-if="day.ruleDetails?.length">{{day.ruleDetails.map(r=>(ruleNames[r.type]||r.type)+' ['+r.source+']'+(r.reason?'：'+r.reason:'')).join('；')}}</small></div></div></div></details></article><article class="admin-card"><h3>集中课程</h3><p class="page-note">当前启用学年：{{adminData.academicYear.name}}（{{adminData.academicYear.start_date}} 至 {{adminData.academicYear.end_date}}）</p><label>课程名称<input v-model="courseForm.title"></label><label>上课地点<input v-model="courseForm.location"></label><label>导师信息<input v-model="courseForm.instructor" maxlength="80" placeholder="选填"/></label><label>开始日期和时间<DateTime24 v-model="courseForm.startAt" /></label><label>结束日期和时间<DateTime24 v-model="courseForm.endAt" /></label><div class="row-actions"><button class="primary compact" @click="saveCourse">{{courseForm.id?'保存修改':'发布'}}</button><button v-if="courseForm.id" class="secondary compact" @click="courseForm={}">取消修改</button></div><div class="mini-list course-admin-list"><div v-for="x in adminData.courses.filter(c=>c.status!=='DELETED')" :key="x.id"><span>{{x.title}} · {{x.location||'未填写地点'}}<small v-if="x.status!=='ACTIVE'"> · 已停用</small><small v-if='x.instructor'> · 导师：{{x.instructor}}</small><small v-if="x.start_at">{{x.start_at.replace('T',' ')}} 至 {{x.end_at.replace('T',' ')}}</small></span><span class="row-actions"><button v-if="x.status==='ACTIVE'" @click="editCourse(x)">修改</button><button v-if="x.status==='ACTIVE'" @click="disableCourse(x.id)">停用</button><button class="danger-action" @click="deleteCourse(x)">删除</button></span></div></div></article><article class="admin-card"><h3>邀请码</h3><label>使用次数<input type="number" min="1" max="100" v-model="codeForm.maxUses"></label><button class="primary compact" @click="generateInvite">自动生成</button><div class="mini-list"><div v-for="x in codes" :key="x.id"><span>{{x.code}} · {{x.used_count}}/{{x.max_uses}} · {{x.status==='ACTIVE'?'可用':'已停用'}}</span><span class="row-actions"><button @click="copyInvite(x.code)">复制</button><button v-if="x.status==='ACTIVE'" @click="adminSave('/admin/invite-codes/'+x.id,null,'PATCH')">停用</button><button class="danger-action" @click="deleteInvite(x)">删除</button></span></div></div></article><article class="admin-card wide"><div class="section-bar"><h3>全部人员</h3><div><a class="secondary link" href="/api/admin/export?type=summary">导出统计</a><a class="secondary link" href="/api/admin/export?type=details">导出明细</a></div></div><div class="user-table"><div v-for="x in adminUsers" :key="x.id"><span><strong>{{x.display_name}}</strong><small>{{x.username}} · {{x.role}} · {{x.status}}</small></span><b>{{x.stats.effectiveDays}}/{{x.stats.targetDays}}天</b><span class="row-actions"><button @click="manageUser(x,'name')">改姓名</button><button @click="manageUser(x,'password')">重置密码</button><button @click="manageUser(x,'status')">{{x.status==='ACTIVE'?'停用':'启用'}}</button><button v-if="x.lastCheckIn?.status==='CLOSED'" @click="undoCheckOut(x)">撤销签退</button><button v-if="x.role==='USER'" class="danger-action" @click="deleteUser(x)">删除</button></span></div></div></article></section></template>
<p v-if="error" class="toast error">{{error}}</p><p v-if="notice" class="toast success">{{notice}}</p><div v-if="checkoutSuccess" class="checkout-success" role="status" aria-live="assertive"><span class="checkout-success-icon">✓</span><strong>签退成功</strong><span>本次逗留已记录</span></div><StayDaysSheet v-if="stayDetailsType&&dashboard?.compliance" :type="stayDetailsType" :count="stayDetailsType==='COMPLIANT'?dashboard.compliance.compliantDays:dashboard.compliance.partialDays" :days="dashboard.compliance.dailyResults||[]" :year-name="selectedAcademicYear?.name||''" @close="stayDetailsType=''"/>
<nav><button :class="{active:tab==='home'}" @click="go('home')">首页</button><button :class="{active:tab==='calendar'}" @click="go('calendar')">日历</button><button :class="{active:tab==='courses'}" @click="go('courses')">课程</button><button :class="{active:tab==='account'}" @click="accountForm={displayName:user.displayName||user.display_name};go('account')">我的</button></nav>
<PwaInstall :open="pwaOnboarding" @close="pwaOnboarding=false" />
<div v-if="modal" class="overlay" @click.self="modal='';seatActionPlan=null"><section class="modal"><h3>{{modal==='confirm-check-in'?'确认签到':modal==='reminder'?'未签退提醒':modal==='reset-password'?'重置 '+resetTarget?.display_name+' 的密码':modal==='backfill'?'补录签退':modal==='reserve-seat'?'确认预约座位':modal==='cancel-seat'?'取消座位预约':modal==='plan'?(planForm.id?'修改出行计划':'新增出行计划'):modal==='edit'?'修改逗留记录':'手动补录'}}</h3>
<template v-if="modal==='confirm-check-in'"><p>确认今天已抵达澳门并开始记录逗留？</p><button class="primary" @click="post('/stays/check-in')">确认签到</button></template>
<template v-else-if="modal==='reminder'"><p>您有未签退记录，点击下方按钮即可完成签退。</p><button class="check checkout" :disabled="checkoutBusy" @click="checkOut">{{checkoutBusy?'签退中…':'立即签退'}}</button></template>
<template v-else-if="modal==='reset-password'"><label>新密码（至少8位）<input type="password" v-model="resetForm.newPassword"></label><label>确认新密码<input type="password" v-model="resetForm.confirmPassword"></label><button class="primary" @click="resetUserPassword">确认重置</button></template>
<template v-else-if="modal==='backfill'"><label>实际离澳日期及时间（北京时间）<DateTime24 v-model="manual.endAt" /></label><p class="page-note">补签退必须提供真实离澳时间，不能使用当前保存时间冒充实际离澳。</p><button class="primary" @click="saveBackfill">保存</button></template>
<template v-else-if="modal==='reserve-seat'"><p v-if="seatActionPlan"><strong>{{seatActionPlan.display_name}}</strong> · {{seatActionPlan.depart_date}} 至 {{seatActionPlan.return_date}}</p><p v-if="seatActionPlan" class="page-note">当前剩余 {{seatActionPlan.remaining_seats}} 个座位。预约成功后无需发布者审批，并会向你显示发布者联系方式。</p><button class="primary" @click="reserveCompanionSeat">确认预约</button></template>
<template v-else-if="modal==='cancel-seat'"><p v-if="seatActionPlan">确认取消 {{seatActionPlan.display_name}} 的座位预约？</p><p class="page-note">取消后座位会立即释放，系统也不会继续向你展示该计划的发布者联系方式。</p><button class="primary" @click="cancelCompanionSeat">确认取消预约</button></template>
<template v-else-if="modal==='plan'"><label>出行日期范围<button type="button" class="range-trigger" @click="openRange">{{planForm.departDate&&planForm.returnDate?planForm.departDate+' 至 '+planForm.returnDate:'选择出发和返回日期'}} <span>▾</span></button></label><div v-if="!rangeOpen&&planRangeSegments.length&&planForm.departDate&&planForm.returnDate" class="plan-auto-preview"><div v-for="(segment,index) in planRangeSegments" :key="index" class="plan-title-line plan-segment-line"><span class="plan-type-label" :class="segment.type==='COURSE'?'plan-type-course':'plan-type-self'">{{segment.type==='COURSE'?'课程安排':'自行安排'}}</span><span>{{segment.startDate}} 至 {{segment.endDate}}</span></div></div><div v-if="rangeOpen" class="range-picker">
  <template v-if="!rangeReview">
    <div class="range-head"><button type="button" aria-label="上个月" @click="shiftRange(-1)">‹</button><strong>{{rangeMonth.replace('-','年')}}月</strong><button type="button" aria-label="下个月" @click="shiftRange(1)">›</button></div>
    <p class="range-hint">{{rangeStart?(rangeEnd?'已选 '+rangeStart+' 至 '+rangeEnd:'已选出发 '+rangeStart+'，请选择返回日期'):'请选择出发日期'}}</p>
    <div class="range-legend" aria-label="日历图例"><span><i class="mark-holiday" aria-hidden="true"></i>澳门公共假期</span><span><i class="course-mark" aria-hidden="true">课</i>集中课程</span><span><i class="mark-planned" aria-hidden="true"></i>已列入计划</span></div>
    <p v-if="rangeMonthLoading" class="range-status">正在同步管理员日期规则…</p>
    <p v-else-if="!rangeMonthRules" class="range-status">日期标记加载失败，<button type="button" class="secondary compact" @click="loadRangeMonth(rangeMonth)">重试</button></p>
    <div class="range-grid"><b v-for="w in ['一','二','三','四','五','六','日']" :key="w">{{w}}</b><span v-for="n in rangeOffset" :key="'range-blank-'+n"></span><button v-for="date in rangeDates" :key="date" type="button" :class="{edge:date===rangeStart||date===rangeEnd,between:rangeEnd&&date>rangeStart&&date<rangeEnd,holiday:rangeDayInfo(date)?.isPublicHoliday,planned:existingPlansOnDate(date).length}" :aria-label="rangeDayLabel(date)" :title="rangeDayLabel(date)" :disabled="rangeMonthLoading||!rangeMonthRules" @click="pickRange(date)">{{Number(date.slice(-2))}}<span class="range-day-tags"><small v-if="rangeDayInfo(date)?.isCourseDay" class="course-mark" aria-hidden="true">课</small><small v-if="rangeDayInfo(date)?.isPublicHoliday" class="range-day-tag">假</small></span><i v-if="existingPlansOnDate(date).length" class="range-planned-dot" aria-hidden="true"></i></button></div>
  </template>
  <div v-else class="plan-date-review" role="alert" aria-label="计划日期风险提示">
    <h4>请核对以下日期</h4>
    <p>所选 {{rangeReview.startDate}} 至 {{rangeReview.endDate}} 中，有 {{rangeReview.flagged.length}} 天不能预测为完全符合：</p>
    <div v-for="group in warningGroups(rangeReview)" :key="group.kind" class="review-group"><strong>{{group.title}} · {{group.days.length}} 天</strong><p>{{group.description}}</p><ul><li v-for="day in group.days" :key="day.date">{{day.date}}<span v-if="day.reason">（{{day.reason}}）</span></li></ul></div>
    <p class="range-explain">本提示基于管理员目前配置，实际认定仍以适用规定及真实签到记录为准。</p>
  </div>
  <div class="range-actions" v-if="rangeReview"><button type="button" class="secondary compact" @click="rangeReview=null">返回修改</button><button type="button" class="primary compact" @click="confirmRangeReview">确认使用这些日期</button></div>
  <div v-else class="range-actions"><p v-if="rangeSaveHint||(rangeStart&&rangeEnd)" class="range-save-hint" role="alert">请先点击「确定日期」，再保存计划。</p><button type="button" class="secondary compact" @click="rangeOpen=false">取消</button><button type="button" class="primary compact" :disabled="!rangeStart||!rangeEnd||rangeChecking||rangeMonthLoading||!rangeMonthRules" @click="applyRange">{{rangeChecking?'检查中…':'确定日期'}}</button></div>
</div><label class="switch"><input type="checkbox" v-model="planForm.isPublic">公开寻搭子</label><template v-if="planForm.isPublic"><label>出发城市<input v-model="planForm.city"></label><label>交通方式<select v-model="planForm.transport"><option>飞机</option><option>高铁</option><option>轮船</option><option>自驾</option><option>待定</option></select></label><template v-if="planForm.transport==='自驾'"><label class="switch"><input type="checkbox" v-model="planForm.hasSeats">提供可预约座位</label><template v-if="planForm.hasSeats"><label>可预约座位总数<input type="number" min="1" max="6" v-model="planForm.seatCount"></label><p v-if="planForm.activeReservations" class="page-note">当前已有 {{planForm.activeReservations}} 个有效预约；座位总数不能低于已预约人数，也不能在预约仍有效时取消公开或关闭座位。</p><label>联系方式类型<select v-model="planForm.contactType"><option>微信</option><option>手机号</option><option>其他</option></select></label><label>联系方式<input v-model="planForm.contactValue" maxlength="80" placeholder="预约成功后仅向已预约用户显示"></label></template></template></template><div v-if="saveReview" class="plan-date-review" role="alert" aria-label="保存计划前的日期提示"><h4>请确认出行计划中的特殊日期</h4><p>当前日期规则与上次确认的结果不同，或者您尚未确认以下 {{saveReview.flagged.length}} 天：</p><div v-for="group in warningGroups(saveReview)" :key="group.kind" class="review-group"><strong>{{group.title}} · {{group.days.length}} 天</strong><p>{{group.description}}</p><ul><li v-for="day in group.days" :key="day.date">{{day.date}}<span v-if="day.reason">（{{day.reason}}）</span></li></ul></div><p class="range-explain">此提示不代表政府或学校已认可这些日期。</p><div class="range-actions"><button type="button" class="secondary compact" @click="saveReview=null;openRange()">修改日期</button><button type="button" class="primary compact" :disabled="planSaving" @click="confirmSaveReview">确认并保存计划</button></div></div><button v-else class="primary" :disabled="planSaving||rangeChecking||rangeOpen" @click="savePlan">{{planSaving?'正在检查…':'保存计划'}}</button></template>
<template v-else><p class="page-note">请填写真实时间（北京时间，24小时制）。历史仅有日期的记录可以在此补正；缺少准确时间时将保持待补正，不会自动算满4小时。</p><label>入澳日期及时间<DateTime24 v-model="manual.startAt" /></label><label>离澳日期及时间<DateTime24 v-model="manual.endAt" /></label><button class="primary" @click="saveRecord">保存</button></template><button class="ghost full" @click="modal='';seatActionPlan=null">取消</button></section></div></main>
</template>
