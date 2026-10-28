import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { beijingDate } from '../server/date-utils.mjs'

function shifted(days) {return beijingDate(new Date(Date.now()+days*864e5))}
function weekdayBefore(maxDays) {for(let n=maxDays;n<maxDays+14;n++){const d=shifted(-n),w=new Date(d+'T00:00:00Z').getUTCDay();if(w>0&&w<6)return d}throw Error('no weekday')}
const send=(cookie,data,method='POST')=>({method,headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)})

test('R002 private/public/overlapping plans, year filter and dashboard/API date-rule linkage',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'douliuji-r002-api-')),path=join(dir,'test.db'),port=3499
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:process.cwd(),stdio:'ignore',
    env:{...process.env,DB_PATH:path,PORT:String(port),NODE_ENV:'development',INIT_ADMIN_PASSWORD:'r002-admin-123',INIT_INVITE_CODE:'R002-CODE'}})
  let sql, closed=false
  child.once('close',()=>{closed=true})
  t.after(async()=>{
    if(sql)sql.close()
    if(!closed){const p=new Promise(resolve=>child.once('close',resolve));if(child.exitCode===null&&child.signalCode===null)child.kill();await p}
    rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100})
  })
  const base=`http://127.0.0.1:${port}`
  const call=async(p,options={})=>{const r=await fetch(base+p,options);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
  let ready=false
  for(let i=0;i<100;i++) {if(child.exitCode!==null)throw Error('server exited');try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,40))}
  assert.ok(ready)
  assert.equal((await call('/api/travel-plans/prediction')).status,401)
  let r=await call('/api/auth/register',send('',{username:'student-r002',password:'pass-r002-123',confirmPassword:'pass-r002-123',displayName:'计划测试',inviteCode:'R002-CODE'}));assert.equal(r.status,201)
  const student=(await call('/api/auth/login',send('',{username:'student-r002',password:'pass-r002-123'}))).cookie
  const admin=(await call('/api/auth/login',send('',{username:'admin',password:'r002-admin-123'}))).cookie
  assert.ok(student&&admin)
  // A second authenticated user must never receive the first user's plans or forecast.
  const invite=await call('/api/admin/invite-codes',send(admin,{maxUses:1}))
  assert.equal(invite.status,201)
  assert.equal((await call('/api/auth/register',send('',{username:'student-other',password:'pass-r002-456',confirmPassword:'pass-r002-456',displayName:'另一位学生',inviteCode:invite.data.code}))).status,201)
  const other=(await call('/api/auth/login',send('',{username:'student-other',password:'pass-r002-456'}))).cookie
  sql=new DatabaseSync(path)
  const past=weekdayBefore(3),extra=weekdayBefore(10),future=shifted(8)
  // Adjust only this disposable test DB, so this test works on any calendar month or academic boundary.
  sql.prepare('UPDATE academic_years SET start_date=?,end_date=? WHERE is_current=1').run(shifted(-30),shifted(45))
  const y=(await call('/api/academic-years',{headers:{cookie:student}})).data.years.find(x=>x.is_current)
  r=await call('/api/travel-plans',send(student,{departDate:past,returnDate:past,isPublic:false}));assert.equal(r.status,201);const planId=r.data.id
  r=await call('/api/travel-plans',send(student,{departDate:past,returnDate:past,isPublic:true,city:'深圳',transport:'待定'}));assert.equal(r.status,201)
  r=await call('/api/travel-plans',send(student,{departDate:future,returnDate:future,isPublic:false}));assert.equal(r.status,201)
  r=await call('/api/travel-plans',send(student,{departDate:'2020-01-01',returnDate:'2020-01-02',isPublic:false}));assert.equal(r.status,201)
  const all=(await call('/api/travel-plans',{headers:{cookie:student}})).data.plans
  assert.equal(all.length,4)
  const otherPrediction=(await call(`/api/travel-plans/prediction?yearId=${y.id}`,{headers:{cookie:other}})).data.prediction
  assert.equal(otherPrediction.forecast.totalPlannedDays,0)
  assert.equal((await call('/api/travel-plans',{headers:{cookie:other}})).data.plans.length,0)
  const scoped=(await call(`/api/travel-plans?yearId=${y.id}`,{headers:{cookie:student}})).data.plans
  assert.equal(scoped.length,3)
  assert.equal((await call('/api/travel-plans?yearId=999999',{headers:{cookie:student}})).status,404)
  r=await call(`/api/travel-plans/prediction?yearId=${y.id}`,{headers:{cookie:student}})
  assert.equal(r.status,200)
  assert.equal(r.data.prediction.forecast.totalPlannedDays,2)
  assert.equal(r.data.prediction.overview.totalPlannedDays, 2)
  assert.equal(r.data.prediction.overview.yearPlannedDays >= r.data.prediction.overview.monthPlannedDays, true)
  assert.equal(r.data.prediction.comparison.missedPlannedDays,1)
  assert.equal(r.data.prediction.comparison.plannedCompliantDaysToDate,1)
  assert.equal(r.data.prediction.dailyResults.find(d=>d.date===future).settlement,'FUTURE')
  assert.equal(r.data.prediction.perPlanForecast.length,3)
  // An unplanned, completed weekday contributes to extra compliant days.
  r=await call('/api/stays',send(student,{startAt:extra+'T09:00',endAt:extra+'T13:00'}));assert.equal(r.status,201)
  r=await call(`/api/travel-plans/prediction?yearId=${y.id}`,{headers:{cookie:student}})
  assert.equal(r.data.prediction.comparison.netDifferenceDays,0)
  assert.equal(r.data.prediction.comparison.extraCompliantDays,1)
  assert.equal(r.data.prediction.comparison.missedPlannedDays,1)
  assert.equal(r.data.prediction.comparison.mismatchDays,2)
  const dashboard=(await call(`/api/dashboard?yearId=${y.id}`,{headers:{cookie:student}})).data
  assert.deepEqual(dashboard.planPrediction.comparison,r.data.prediction.comparison)
  assert.deepEqual(dashboard.planPrediction.overview, r.data.prediction.overview)
  // Teacher calendar edits automatically affect plans and actuals with no stored summary to rebuild.
  r=await call('/api/admin/date-rules',send(admin,{date:past,type:'PUBLIC_HOLIDAY',reason:'测试节假日'}));assert.equal(r.status,201);const ruleId=r.data.rule.id
  r=await call(`/api/travel-plans/prediction?yearId=${y.id}`,{headers:{cookie:student}})
  assert.equal(r.data.prediction.dailyResults.find(d=>d.date===past).planStatus,'NON_COMPLIANT')
  assert.equal(r.data.prediction.comparison.missedPlannedDays,0)
  assert.equal(r.data.prediction.comparison.netDifferenceDays,1)
  assert.equal((await call('/api/admin/date-rules/'+ruleId,{method:'DELETE',headers:{cookie:admin}})).status,200)
  r=await call(`/api/travel-plans/prediction?yearId=${y.id}`,{headers:{cookie:student}})
  assert.equal(r.data.prediction.comparison.missedPlannedDays,1)
  assert.equal((await call('/api/travel-plans/'+planId,{method:'DELETE',headers:{cookie:student}})).status,200)
  r=await call(`/api/travel-plans/prediction?yearId=${y.id}`,{headers:{cookie:student}})
  assert.equal(r.data.prediction.forecast.totalPlannedDays,2) // overlapping second plan still covers past
  assert.equal((await call('/api/travel-plans/prediction?yearId=999999',{headers:{cookie:student}})).status,404)
})
