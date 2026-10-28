import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { beijingDate } from '../server/date-utils.mjs'

const shift = n => beijingDate(new Date(Date.now() + n * 864e5))
function weekdayBefore(first) {
  for(let i=first;i<first+12;i++) {
    const date=shift(-i),w=new Date(date+'T00:00:00Z').getUTCDay()
    if(w>0&&w<6)return date
  }
  throw Error('未找到工作日')
}
const send=(cookie,data)=>({method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)})

test('R004 admin actual-day overview/detail, combined classified days, years, rights and rule updates',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'douliuji-r004-')),databasePath=join(directory,'isolated.db'),port=3599
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:process.cwd(),stdio:'ignore',
    env:{...process.env,INIT_ADMIN_USER:'admin',DB_PATH:databasePath,PORT:String(port),NODE_ENV:'development',INIT_ADMIN_PASSWORD:'r004-admin-test',INIT_INVITE_CODE:'r004-invite'}})
  let db,closed=false
  child.once('close',()=>{closed=true})
  t.after(async()=>{
    if(db)db.close()
    if(!closed){const wait=new Promise(resolve=>child.once('close',resolve));if(child.exitCode===null&&child.signalCode===null)child.kill();await wait}
    rmSync(directory,{recursive:true,force:true,maxRetries:20,retryDelay:100})
  })
  const origin=`http://127.0.0.1:${port}`
  const call=async(path,options={})=>{const response=await fetch(origin+path,options);return {status:response.status,
    body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}}
  let ready=false
  for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('test server exited');try{if((await fetch(origin+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,40))}
  assert.ok(ready,'服务健康检查通过')
  const admin=(await call('/api/auth/login',send('',{username:'admin',password:'r004-admin-test'}))).cookie
  assert.ok(admin)
  assert.equal((await call('/api/admin/students')).status,401,'匿名用户不能读取学生统计')
  const invite=await call('/api/admin/invite-codes',send(admin,{maxUses:2}))
  assert.equal(invite.status,201)
  for(const [username,name] of [['r004-student-a','学生甲'],['r004-student-b','学生乙']]) {
    assert.equal((await call('/api/auth/register',send('',{username,password:'student-test-123',
      confirmPassword:'student-test-123',displayName:name,inviteCode:invite.body.code}))).status,201)
  }
  const cookieA=(await call('/api/auth/login',send('',{username:'r004-student-a',password:'student-test-123'}))).cookie
  const cookieB=(await call('/api/auth/login',send('',{username:'r004-student-b',password:'student-test-123'}))).cookie
  assert.ok(cookieA&&cookieB)
  db=new DatabaseSync(databasePath)
  // Academic-year bounds are extended ONLY inside this disposable test database.
  db.prepare('UPDATE academic_years SET start_date=?,end_date=? WHERE is_current=1').run(shift(-50),shift(45))
  const year=db.prepare('SELECT * FROM academic_years WHERE is_current=1').get()
  const oldYearId=Number(db.prepare('INSERT INTO academic_years(name,start_date,end_date,target_days,is_current) VALUES(?,?,?,?,0)')
    .run('2020历史学年','2020-01-01','2020-12-31',90).lastInsertRowid)
  const idA=db.prepare('SELECT id FROM users WHERE username=?').get('r004-student-a').id
  const idB=db.prepare('SELECT id FROM users WHERE username=?').get('r004-student-b').id
  const planned=weekdayBefore(6),extra=weekdayBefore(14),future=shift(8)
  assert.notEqual(planned,extra)
  assert.equal((await call('/api/travel-plans',send(cookieA,{departDate:planned,returnDate:planned,isPublic:false}))).status,201)
  assert.equal((await call('/api/travel-plans',send(cookieA,{departDate:future,returnDate:future,isPublic:false}))).status,201)
  assert.equal((await call('/api/stays',send(cookieA,{startAt:planned+'T09:00',endAt:planned+'T12:59'}))).status,201)
  assert.equal((await call('/api/stays',send(cookieA,{startAt:extra+'T09:00',endAt:extra+'T13:00'}))).status,201)
  const path=`/api/admin/students?yearId=${year.id}`
  assert.equal((await call(path,{headers:{cookie:cookieA}})).status,403,'普通学生不能访问总览')
  assert.equal((await call(`/api/admin/students/${idB}?yearId=${year.id}`,{headers:{cookie:cookieA}})).status,403,'普通学生不能查询其他学生详情')
  assert.equal((await call(`/api/admin/students/${idB}?yearId=${year.id}`)).status,401)
  assert.equal((await call('/api/admin/students?yearId=999999',{headers:{cookie:admin}})).status,404)
  assert.equal((await call(`/api/admin/students/${idB}?yearId=999999`,{headers:{cookie:admin}})).status,404)
  assert.equal((await call('/api/admin/students/999999',{headers:{cookie:admin}})).status,404)
  assert.equal((await call('/api/admin/students/abc',{headers:{cookie:admin}})).status,404)
  const listResponse=await call(path,{headers:{cookie:admin}})
  assert.equal(listResponse.status,200)
  const list=listResponse.body.students
  assert.deepEqual(new Set(list.map(s=>s.username)),new Set(['r004-student-a','r004-student-b']))
  assert.ok(list.every(s=>s.role==='USER'&&!('password_hash' in s)))
  const a=list.find(s=>s.id===idA),b=list.find(s=>s.id===idB)
  assert.equal(a.targetDays,year.target_days)
  assert.equal(a.compliance.compliantDays,1)
  assert.equal(a.compliance.partialDays,1)
  assert.equal(a.compliantAndPartialDays,2,'合计仅包含完全符合及部分符合')
  assert.equal(a.remainingDays,year.target_days-1)
  assert.equal('planPrediction' in a,false,'老师端列表不下发计划预测/净差异')
  assert.equal(b.compliance.compliantDays,0)
  assert.equal(b.compliantAndPartialDays,0)
  assert.equal((await call('/api/stays/check-in',send(cookieB,{}))).status,201)
  const live=(await call(path,{headers:{cookie:admin}})).body.students.find(s=>s.id===idB)
  assert.equal(live.openStay.status,'OPEN','总览展示其他学生正在签到')
  assert.equal((await call(`/api/admin/students/${idB}?yearId=${year.id}`,{headers:{cookie:admin}})).body.compliance.inProgressDays,1)
  assert.ok(!('dailyResults' in a.compliance),'列表不重复下发全年明细')
  const detailResponse=await call(`/api/admin/students/${idA}?yearId=${year.id}`,{headers:{cookie:admin}})
  assert.equal(detailResponse.status,200)
  const detail=detailResponse.body
  assert.equal(detail.student.id,idA)
  assert.ok(!('password_hash' in detail.student))
  assert.ok(detail.stayRecords.length>=2)
  assert.equal(detail.compliantAndPartialDays,2)
  assert.equal('plans' in detail,false,'老师端详情不下发出行计划')
  assert.equal('planPrediction' in detail,false,'老师端详情不下发预测/偏差')
  const ownDashboard=(await call(`/api/dashboard?yearId=${year.id}`,{headers:{cookie:cookieA}})).body
  const {asOf: _staffAsOf,academicYear: _staffYear,...adminCompliance}=detail.compliance
  const {asOf: _selfAsOf,academicYear: _selfYear,...selfCompliance}=ownDashboard.compliance
  assert.deepEqual(adminCompliance,selfCompliance,'老师端与学生端必须使用相同的 R001 日级数据')
  assert.ok(ownDashboard.planPrediction,'R002 学生端仍然保留预测/偏差能力')
  assert.equal(detail.compliance.dailyResults.find(d=>d.date===planned).status,'PARTIAL')
  // Teacher changes actual classifications without modifying source stays or student R002 features.
  const before=db.prepare('SELECT id,check_in_at,check_out_at,start_date,end_date FROM stay_records WHERE user_id=? ORDER BY id').all(idA)
  const rule=await call('/api/admin/date-rules',send(admin,{date:extra,type:'PUBLIC_HOLIDAY',reason:'R004-复用验证'}))
  assert.equal(rule.status,201)
  const changed=(await call(`/api/admin/students/${idA}?yearId=${year.id}`,{headers:{cookie:admin}})).body
  assert.equal(changed.compliance.compliantDays,0)
  assert.equal(changed.compliance.nonCompliantDays,1)
  assert.equal(changed.compliance.partialDays,1)
  assert.equal(changed.compliantAndPartialDays,1,'强制不符合日期不纳入两类合计')
  assert.equal(changed.remainingDays,year.target_days,'目标仍然只按完全符合计数')
  assert.deepEqual(db.prepare('SELECT id,check_in_at,check_out_at,start_date,end_date FROM stay_records WHERE user_id=? ORDER BY id').all(idA),before)
  assert.equal((await call(`/api/admin/date-rules/${rule.body.rule.id}`,{method:'DELETE',headers:{cookie:admin}})).status,200)
  const restored=(await call(`/api/admin/students/${idA}?yearId=${year.id}`,{headers:{cookie:admin}})).body
  assert.equal(restored.compliance.compliantDays,1)
  assert.equal(restored.compliantAndPartialDays,2)
  const plannedRule=await call('/api/admin/date-rules',send(admin,{date:planned,type:'PUBLIC_HOLIDAY',reason:'R004-计划规则验证'}))
  assert.equal(plannedRule.status,201)
  const nowTeacher=(await call(`/api/admin/students/${idA}?yearId=${year.id}`,{headers:{cookie:admin}})).body
  assert.equal(nowTeacher.compliance.dailyResults.find(d=>d.date===planned).status,'NON_COMPLIANT')
  assert.equal(nowTeacher.compliantAndPartialDays,1)
  assert.equal((await call(`/api/travel-plans/prediction?yearId=${year.id}`,{headers:{cookie:cookieA}})).status,200,
    '改动 R004 投影不影响学生端 R002 预测接口')
  assert.equal((await call(`/api/admin/date-rules/${plannedRule.body.rule.id}`,{method:'DELETE',headers:{cookie:admin}})).status,200)
  // Non-current year is independently selectable, does not silently read the current year.
  const pastYear=(await call(`/api/admin/students/${idA}?yearId=${oldYearId}`,{headers:{cookie:admin}})).body
  assert.equal(pastYear.compliance.compliantDays,0)
  assert.equal(pastYear.compliantAndPartialDays,0)
  assert.equal(pastYear.stayRecords.length,0)
  // Disabled student remains visible to ADMIN; deactivated accounts cannot obtain private results.
  db.prepare("UPDATE users SET status='DISABLED' WHERE id=?").run(idB)
  const afterDisable=(await call(path,{headers:{cookie:admin}})).body.students.find(s=>s.id===idB)
  assert.equal(afterDisable.status,'DISABLED')
  assert.equal((await call(path,{headers:{cookie:cookieB}})).status,401)
})
