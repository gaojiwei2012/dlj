import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

// Keep the public companion plan in the future so this integration test does not expire.
const futurePlanDate = daysAhead => new Date(Date.now() + daysAhead*86400000).toISOString().slice(0,10)
test('注册 登录 签到 课程 计划 排行完整闭环',async t=>{
  const publicDepartDate=futurePlanDate(7),publicReturnDate=futurePlanDate(9)
  const dir=mkdtempSync(join(tmpdir(),'douliuji-')),port=3291
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DB_PATH:join(dir,'test.db'),INIT_ADMIN_PASSWORD:'admin-test-123',INIT_INVITE_CODE:'TEST-CODE'},stdio:'ignore'})
  t.after(()=>child.kill())
  for(let i=0;i<30;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)break}catch{}await new Promise(r=>setTimeout(r,50))}
  const call=async(path,options={})=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,options);return {r,d:await r.json()}}
  let x=await call('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:'测试用户',username:'tester',password:'testpass123',confirmPassword:'wrong',inviteCode:'TEST-CODE'})});assert.equal(x.r.status,400)
  x=await call('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:'测试用户',username:'tester',password:'testpass123',confirmPassword:'testpass123',inviteCode:'TEST-CODE'})});assert.equal(x.r.status,201);const userId=x.d.id
  x=await call('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'tester',password:'testpass123'})});assert.equal(x.r.status,200);const cookie=x.r.headers.get('set-cookie').split(';')[0]
  x=await call('/api/stays/check-in',{method:'POST',headers:{cookie}});assert.equal(x.r.status,201)
  x=await call('/api/dashboard',{headers:{cookie}});assert.equal(x.d.stats.effectiveDays,1)
  x=await call('/api/travel-plans',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({departDate:publicDepartDate,returnDate:publicReturnDate,isPublic:true,city:'广州',transport:'高铁'})});assert.equal(x.r.status,201);const publicPlanId=x.d.id
  x=await call('/api/companions',{headers:{cookie}});assert.equal(x.d.plans.length,1)
  x=await call('/api/rankings',{headers:{cookie}});assert.equal(x.d.rankings.some(r=>r.isMe),true)
  assert.equal(x.d.rankings.length<=3,true)
  const jsonHeaders={cookie,'content-type':'application/json'}
  x=await call('/api/stays',{method:'POST',headers:jsonHeaders,body:JSON.stringify({startDate:'2026-08-22',endDate:'2026-08-26'})});assert.equal(x.r.status,201)
  x=await call('/api/stays',{method:'POST',headers:jsonHeaders,body:JSON.stringify({startDate:'2026-09-15',endDate:'2026-09-18'})});assert.equal(x.r.status,201)
  x=await call('/api/stays',{headers:{cookie}});assert.equal(x.d.records[0].status,'OPEN');assert.equal(x.d.records[1].end_date,'2026-09-18');assert.equal(x.d.records[2].end_date,'2026-08-26')
  x=await call('/api/calendar?month=2026-08',{headers:{cookie}});assert.equal(x.d.month,'2026-08');assert.equal(x.d.days.length,31);assert.equal(x.d.days.find(day=>day.date==='2026-08-24').isPresent,true)
  x=await call('/api/calendar?month=2026-09',{headers:{cookie}});assert.equal(x.d.days.find(day=>day.date==='2026-09-16').isPresent,true)
  x=await call('/api/calendar?month=2026-13',{headers:{cookie}});assert.equal(x.r.status,400)
  x=await call('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'admin-test-123'})});assert.equal(x.r.status,200);const adminCookie=x.r.headers.get('set-cookie').split(';')[0]
  x=await call('/api/travel-plans',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({departDate:'2026-11-10',returnDate:'2026-11-12',isPublic:false,city:'上海',transport:'自驾',hasSeats:true,seatCount:2})});assert.equal(x.r.status,201);const privatePlanId=x.d.id
  x=await call('/api/companions',{headers:{cookie:adminCookie}});assert.equal(x.d.plans.some(p=>p.id===privatePlanId),false)
  x=await call('/api/travel-plans/'+publicPlanId,{method:'PATCH',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({departDate:publicDepartDate,returnDate:publicReturnDate,isPublic:false})});assert.equal(x.r.status,404)
  x=await call('/api/travel-plans/'+publicPlanId,{method:'PATCH',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({departDate:publicDepartDate,returnDate:publicReturnDate,isPublic:true,city:'广州',transport:'自驾',hasSeats:true,seatCount:7})});assert.equal(x.r.status,400)
  x=await call('/api/travel-plans/'+publicPlanId,{method:'PATCH',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({departDate:publicDepartDate,returnDate:publicReturnDate,isPublic:false})});assert.equal(x.r.status,200)
  x=await call('/api/companions',{headers:{cookie:adminCookie}});assert.equal(x.d.plans.length,0)
  x=await call('/api/travel-plans',{headers:{cookie}});assert.equal(x.d.plans.find(p=>p.id===publicPlanId).is_public,0);assert.equal(x.d.plans.find(p=>p.id===privatePlanId).city,null);assert.equal(x.d.plans.find(p=>p.id===privatePlanId).has_seats,0)
  x=await call('/api/admin/invite-codes',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({maxUses:1})});assert.equal(x.r.status,201);assert.match(x.d.code,/^MBA-[0-9A-F]{12}$/);const inviteId=x.d.id
  x=await call('/api/admin/invite-codes/'+inviteId,{method:'PATCH',headers:{cookie:adminCookie}});assert.equal(x.r.status,200)
  x=await call('/api/admin/courses',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({title:'组织行为与领导力',location:'澳门校区',startAt:'2026-09-26T09:00',endAt:'2026-09-27T16:30'})});assert.equal(x.r.status,201);const courseId=x.d.id
  x=await call('/api/courses',{headers:{cookie}});assert.equal(x.d.sessions[0].location,'澳门校区');assert.equal(x.d.sessions[0].start_at,'2026-09-26T09:00');assert.equal(x.d.sessions[0].dates.length,2);assert.equal('selected' in x.d.sessions[0].dates[0],false)
  x=await call('/api/course-entry',{headers:{cookie}});assert.equal(x.d.sessions[0].dates[0].selected,false);const selectedDateId=x.d.sessions[0].dates[0].id
  x=await call('/api/courses/'+courseId+'/attendance',{method:'PUT',headers:jsonHeaders,body:JSON.stringify({dateIds:[selectedDateId]})});assert.equal(x.r.status,200)
  x=await call('/api/course-entry',{headers:{cookie}});assert.deepEqual(x.d.sessions[0].dates.map(d=>d.selected),[true,false])
  x=await call('/api/dashboard',{headers:{cookie}});assert.equal(x.d.stats.dates.includes('2026-09-26'),false)
  x=await call('/api/calendar?month=2026-09',{headers:{cookie}});assert.equal(x.d.days.find(day=>day.date==='2026-09-26').isPresent,false);assert.equal(x.d.days.find(day=>day.date==='2026-09-26').isCourse,true)
  x=await call('/api/account',{method:'PATCH',headers:jsonHeaders,body:JSON.stringify({displayName:'新名字',currentPassword:'testpass123',newPassword:'newpass123',confirmPassword:'wrong'})});assert.equal(x.r.status,400)
  x=await call('/api/account',{method:'PATCH',headers:jsonHeaders,body:JSON.stringify({displayName:'新名字',currentPassword:'testpass123',newPassword:'newpass123',confirmPassword:'newpass123'})});assert.equal(x.r.status,200);assert.equal(x.d.user.displayName,'新名字')
  x=await call('/api/academic-years',{headers:{cookie}});const oldYear=x.d.years[0];assert.equal(oldYear.start_date,'2026-09-01')
  x=await call('/api/stays',{method:'POST',headers:jsonHeaders,body:JSON.stringify({startDate:'2027-08-30',endDate:'2027-09-02'})});assert.equal(x.r.status,400)
  x=await call('/api/admin/academic-years',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({startDate:'2027-09-01',endDate:'2028-08-31',targetDays:90})});assert.equal(x.r.status,201);const newYearId=x.d.id
  x=await call('/api/admin/academic-year',{method:'PUT',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({name:'冲突学年',startDate:'2027-08-31',endDate:'2028-08-31',targetDays:90})});assert.equal(x.r.status,409)
  x=await call('/api/admin/invalid-dates',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({startDate:'2028-09-01',endDate:'2028-09-02',reason:'越界'})});assert.equal(x.r.status,400)
  x=await call('/api/admin/invalid-dates',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({startDate:'2027-10-01',endDate:'2027-10-02',reason:'假期'})});assert.equal(x.r.status,201)
  x=await call('/api/admin/academic-year',{method:'PUT',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({name:'缩短学年',startDate:'2027-09-01',endDate:'2027-09-30',targetDays:90})});assert.equal(x.r.status,409)
  x=await call('/api/dashboard?yearId='+oldYear.id,{headers:{cookie}});assert.equal(x.d.stats.academicYear.id,oldYear.id);assert.equal(x.d.stats.dates.includes('2026-09-16'),true)
  x=await call('/api/dashboard?yearId='+newYearId,{headers:{cookie}});assert.deepEqual(x.d.stats.dates,[])
  x=await call('/api/dashboard',{headers:{cookie}});assert.equal(x.d.stats.academicYear.id,newYearId)
  x=await call('/api/admin/academic-years',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({startDate:'2027-08-01',endDate:'2028-07-31',targetDays:90})});assert.equal(x.r.status,409)
  x=await call('/api/admin/invite-codes',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({maxUses:3})});assert.equal(x.r.status,201);const batchCode=x.d.code
  for(let i=0;i<3;i++){x=await call('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:'同学'+i,username:'student'+i,password:'testpass123',confirmPassword:'testpass123',inviteCode:batchCode})});assert.equal(x.r.status,201)}
  x=await call('/api/rankings',{headers:{cookie}});assert.equal(x.d.rankings.length,3)
  x=await call('/api/rankings',{headers:{cookie:adminCookie}});assert.equal(x.d.rankings.length,5)
  x=await call('/api/admin/users/'+userId,{method:'PATCH',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({newPassword:'badpass123',confirmPassword:'badpass123'})});assert.equal(x.r.status,403)
  x=await call('/api/admin/users/'+userId,{method:'PATCH',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({newPassword:'resetpass123',confirmPassword:'wrong'})});assert.equal(x.r.status,400)
  x=await call('/api/admin/users/'+userId,{method:'PATCH',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({newPassword:'resetpass123',confirmPassword:'resetpass123'})});assert.equal(x.r.status,200)
  x=await call('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'tester',password:'newpass123'})});assert.equal(x.r.status,401)
})
