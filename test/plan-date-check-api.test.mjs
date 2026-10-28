import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port}
const weekend=date=>[0,6].includes(new Date(date+'T00:00:00Z').getUTCDay())

test('student date-check follows invalid days and actual course weekends, never effective-weekend grants',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'plan-dates-')),port=await freePort()
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,DB_PATH:join(dir,'test.db'),PORT:String(port),NODE_ENV:'development',INIT_ADMIN_PASSWORD:'plan-calendar-admin-safe',INIT_INVITE_CODE:'PLAN-CALENDAR-CODE'}})
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const closed=new Promise(r=>child.once('close',r));child.kill();await closed}rmSync(dir,{recursive:true,force:true,maxRetries:15,retryDelay:100})})
  const base=`http://127.0.0.1:${port}`
  async function call(path,method='GET',cookie='',data){const res=await fetch(base+path,{method,headers:{cookie,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
  let ready=false
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('server quit');try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,35))}
  assert.ok(ready,'server starts')
  const admin=(await call('/api/auth/login','POST','',{username:'admin',password:'plan-calendar-admin-safe'})).cookie
  assert.ok(admin,'administrator logged in')
  assert.equal((await call('/api/travel-plans/date-check?startDate=2026-10-01&endDate=2026-10-02')).status,401)
  assert.equal((await call('/api/auth/register','POST','',{username:'student',displayName:'日期标记测试',password:'password123',confirmPassword:'password123',inviteCode:'PLAN-CALENDAR-CODE'})).status,201)
  const student=(await call('/api/auth/login','POST','',{username:'student',password:'password123'})).cookie
  assert.ok(student)
  const years=(await call('/api/academic-years','GET',student)).data.years
  const year=years.find(y=>y.is_current)
  const yyyy=year.start_date.slice(0,4)
  const mm=`${yyyy}-10`
  const days=Array.from({length:31},(_,i)=>`${mm}-${String(i+1).padStart(2,'0')}`)
  const holiday=days.find(d=>!weekend(d))
  const invalid=days.find(d=>!weekend(d)&&d!==holiday)
  const weekends=days.filter(weekend)
  const [courseWeekend,ordinaryWeekend,formerValidWeekend]=weekends.slice(0,3)
  const params=new URLSearchParams({startDate:days[0],endDate:days[30],yearId:String(year.id)})
  const apiPath='/api/travel-plans/date-check?'+params.toString()
  const initial=await call(apiPath,'GET',student)
  assert.equal(initial.status,200)
  assert.equal(initial.data.days.length,31)
  assert.equal(initial.data.days.find(d=>d.date===courseWeekend).kind,'ORDINARY_WEEKEND')
  assert.equal((await call('/api/admin/date-rules','POST',admin,{date:holiday,type:'PUBLIC_HOLIDAY',reason:'澳门公共假期测试'})).status,201)
  assert.equal((await call('/api/admin/date-rules','POST',admin,{date:invalid,type:'MANUAL_INVALID',reason:'管理员关闭'})).status,201)
  assert.equal((await call('/api/admin/date-rules','POST',admin,{date:formerValidWeekend,type:'VALID_WEEKEND',reason:'旧入口停用'})).status,400)
  const course=await call('/api/admin/courses','POST',admin,{title:'周末课程',location:'澳门',startAt:courseWeekend+'T09:00',endAt:courseWeekend+'T16:00'})
  assert.equal(course.status,201)
  const checked=await call(apiPath,'GET',student)
  assert.equal(checked.status,200)
  const dates=Object.fromEntries(checked.data.days.map(day=>[day.date,day]))
  assert.equal(dates[holiday].kind,'PUBLIC_HOLIDAY')
  assert.equal(dates[holiday].reason,'澳门公共假期测试')
  assert.equal(dates[invalid].kind,'MANUAL_INVALID')
  assert.equal(dates[courseWeekend].kind,'COURSE_DAY')
  assert.equal(dates[courseWeekend].isCourseDay,true)
  assert.equal(dates[ordinaryWeekend].kind,'ORDINARY_WEEKEND')
  assert.equal(dates[formerValidWeekend].kind,'ORDINARY_WEEKEND')
  assert.ok(checked.data.flagged.some(d=>d.date===holiday))
  assert.ok(checked.data.flagged.some(d=>d.date===ordinaryWeekend))
  assert.ok(!checked.data.flagged.some(d=>d.date===courseWeekend))
  assert.ok(checked.data.flagged.some(d=>d.date===formerValidWeekend))
  // A public holiday still overrides an otherwise eligible weekend course.
  const added=await call('/api/admin/date-rules','POST',admin,{date:courseWeekend,type:'PUBLIC_HOLIDAY',reason:'假期优先'})
  assert.equal(added.status,201)
  const override=await call(apiPath,'GET',student)
  assert.equal(override.data.days.find(d=>d.date===courseWeekend).kind,'PUBLIC_HOLIDAY')
  const bad=await call('/api/travel-plans/date-check?startDate=not-a-date&endDate=2026-10-12','GET',student)
  assert.equal(bad.status,400)
  assert.equal((await call('/api/travel-plans/date-check?startDate=2026-10-12&endDate=2026-10-11','GET',student)).status,400)
  const beyond=await call('/api/travel-plans/date-check?startDate=2026-01-01&endDate=2030-01-01','GET',student)
  assert.equal(beyond.status,400)
  const selectedBeforeYear=await call('/api/travel-plans/date-check?'+new URLSearchParams({startDate:`${yyyy}-08-31`,endDate:`${yyyy}-09-02`,yearId:String(year.id)}),'GET',student)
  assert.equal(selectedBeforeYear.status,200)
  assert.equal(selectedBeforeYear.data.days[0].kind,'OUTSIDE_YEAR')
})
