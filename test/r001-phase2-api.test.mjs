import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'

const send = (cookie, data, method='POST') => ({method,headers:{cookie,'content-type':'application/json'},body:JSON.stringify(data)})

test('R001 phase 2: teacher rules, year sync, audit, accurate backfill, student dashboard/calendar', async t => {
  const dir=mkdtempSync(join(tmpdir(),'douliuji-r001-phase2-'))
  const dbPath=join(dir,'test.db'), port=3398
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:process.cwd(),
    env:{...process.env,DB_PATH:dbPath,PORT:String(port),INIT_ADMIN_PASSWORD:'admin-test-123',INIT_INVITE_CODE:'R001-PHASE2'},stdio:'ignore'})
  let sql
  let childClosed = false
  child.once('close', () => { childClosed = true })
  t.after(async () => {
    // Close the parent connection and wait for the server process before cleanup.
    if (sql) sql.close()
    if (!childClosed) {
      const closed = new Promise(resolve => child.once('close', resolve))
      if (child.exitCode === null && child.signalCode === null) child.kill()
      await closed
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  const base=`http://127.0.0.1:${port}`
  let ready=false
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error('server exited')
    try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,35))
  }
  assert.ok(ready)
  const call=async(path,options={})=>{const r=await fetch(base+path,options);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
  const admin=(await call('/api/auth/login',send('',{username:'admin',password:'admin-test-123'}))).cookie
  assert.ok(admin)
  assert.equal((await call('/api/auth/register',send('',{username:'student2',password:'testpass999',confirmPassword:'testpass999',displayName:'同学',inviteCode:'R001-PHASE2'}))).status,201)
  const student=(await call('/api/auth/login',send('',{username:'student2',password:'testpass999'}))).cookie
  assert.ok(student)
  const studentId=(await call('/api/auth/me',{headers:{cookie:student}})).data.user.id
  assert.equal((await call('/api/admin/date-rules?year=2026')).status,401)
  assert.equal((await call('/api/admin/date-rules?year=2026',{headers:{cookie:student}})).status,403)
  assert.equal((await call('/api/admin/date-rules',send(student,{date:'2026-09-26',type:'VALID_WEEKEND',reason:'补课'}))).status,403)
  assert.equal((await call('/api/admin/date-rules?year=2100',{headers:{cookie:admin}})).status,400)
  let r=await call('/api/admin/date-rules/sync-weekends',send(admin,{year:2026}))
  assert.equal(r.status,200);assert.equal(r.data.total,104);assert.equal(r.data.added,104)
  r=await call('/api/admin/date-rules/sync-weekends',send(admin,{year:2026}))
  assert.equal(r.status,200);assert.equal(r.data.added,0)
  let overview=(await call('/api/admin/date-rules?year=2026',{headers:{cookie:admin}})).data
  assert.equal(overview.syncedWeekends,104)
  assert.equal(overview.dates.find(d=>d.date==='2026-09-26').effect,'普通周末：最多部分符合')
  assert.equal((await call('/api/admin/date-rules',send(admin,{date:'2026-09-25',type:'VALID_WEEKEND',reason:'无效测试'}))).status,400)
  assert.equal((await call('/api/admin/date-rules',send(admin,{date:'2026-09-25',type:'WEEKEND',reason:'伪造周末'}))).status,400)
  // Precise timezone-qualified record, first a Friday and then a Saturday.
  r=await call('/api/stays',send(student,{startAt:'2026-09-25T09:00',endAt:'2026-09-25T13:00'}))
  assert.equal(r.status,201);assert.equal(r.data.timeUnknown,false)
  r=await call('/api/stays',send(student,{startAt:'2026-09-26T09:00',endAt:'2026-09-26T13:00'}))
  assert.equal(r.status,201)
  r=await call('/api/stays',send(student,{startAt:'2026-09-26T09:00',endAt:'2026-09-27T25:00'}))
  assert.equal(r.status,400)
  r=await call('/api/stays',send(student,{startAt:'2026-09-26T13:00',endAt:'2026-09-26T09:00'}))
  assert.equal(r.status,400)
  r=await call('/api/compliance',{headers:{cookie:student}})
  assert.equal(r.data.compliance.compliantDays,1)
  assert.equal(r.data.compliance.dailyResults.find(d=>d.date==='2026-09-26').status,'PARTIAL')
  // 旧的有效周末数据保留供审计，但新接口禁止新增，旧数据也不再改变资格。
  r=await call('/api/admin/date-rules',send(admin,{date:'2026-09-26',type:'VALID_WEEKEND',reason:'补课'}))
  assert.equal(r.status,400)
  sql=new DatabaseSync(dbPath)
  const validRuleId=Number(sql.prepare(`INSERT INTO date_rules(rule_date,type,source,reason,created_by,created_at,updated_at)
    VALUES('2026-09-26','VALID_WEEKEND','MANUAL','旧补课设定',1,?,?)`).run(new Date().toISOString(),new Date().toISOString()).lastInsertRowid)
  r=await call('/api/compliance',{headers:{cookie:student}})
  assert.equal(r.data.compliance.compliantDays,1)
  assert.equal(r.data.compliance.dailyResults.find(d=>d.date==='2026-09-26').status,'PARTIAL')
  // 周末集中课程才是唯一的完全符合授权。
  const published=await call('/api/admin/courses',send(admin,{title:'周末集中课程',location:'澳门',startAt:'2026-09-26T09:00',endAt:'2026-09-26T16:00'}))
  assert.equal(published.status,201)
  const courseId=published.data.id
  r=await call('/api/compliance',{headers:{cookie:student}})
  assert.equal(r.data.compliance.compliantDays,2)
  assert.equal(r.data.compliance.dailyResults.find(d=>d.date==='2026-09-26').reasonCode,'COURSE_WEEKEND_OVER_4H')
  // Dynamic dashboard/calendar consume the same calculator without stale cache.
  r=await call('/api/dashboard',{headers:{cookie:student}})
  assert.equal(r.data.compliance.compliantDays,2)
  r=await call('/api/calendar?month=2026-09',{headers:{cookie:student}})
  assert.equal(r.data.days.find(d=>d.date==='2026-09-26').complianceStatus,'COMPLIANT')
  r=await call('/api/admin/date-rules',send(admin,{date:'2026-09-26',type:'PUBLIC_HOLIDAY',reason:'假期'}))
  assert.equal(r.status,201);const holidayId=r.data.rule.id
  r=await call('/api/compliance',{headers:{cookie:student}})
  assert.equal(r.data.compliance.dailyResults.find(d=>d.date==='2026-09-26').status,'NON_COMPLIANT')
  assert.equal(r.data.compliance.compliantDays,1)
  r=await call('/api/admin/date-rules/sync-weekends',send(admin,{year:2026}))
  assert.equal(r.data.added,0)
  overview=(await call('/api/admin/date-rules?year=2026',{headers:{cookie:admin}})).data
  assert.equal(overview.dates.find(d=>d.date==='2026-09-26').isValidWeekend,undefined)
  assert.equal(overview.dates.find(d=>d.date==='2026-09-26').effect,'公共假期：强制不符合')
  r=await call(`/api/admin/date-rules/${holidayId}`,send(admin,{date:'2026-09-26',type:'PUBLIC_HOLIDAY',reason:'已确认节假日'},'PATCH'))
  assert.equal(r.status,200);assert.equal(r.data.rule.reason,'已确认节假日')
  r=await call(`/api/admin/date-rules/${holidayId}`,{method:'DELETE',headers:{cookie:admin}})
  assert.equal(r.status,200)
  assert.equal((await call(`/api/admin/date-rules/${holidayId}`,{method:'DELETE',headers:{cookie:admin}})).status,409)
  r=await call('/api/compliance',{headers:{cookie:student}})
  assert.equal(r.data.compliance.compliantDays,2)
  // 撤销旧“有效周末”不影响课程；撤销课程则立即降级为部分符合。
  r=await call(`/api/admin/date-rules/${validRuleId}`,{method:'DELETE',headers:{cookie:admin}})
  assert.equal(r.status,200)
  assert.equal((await call('/api/compliance',{headers:{cookie:student}})).data.compliance.compliantDays,2)
  assert.equal((await call('/api/admin/courses/'+courseId,{method:'DELETE',headers:{cookie:admin}})).status,200)
  assert.equal((await call('/api/compliance',{headers:{cookie:student}})).data.compliance.compliantDays,1)
  assert.equal((await call('/api/admin/date-rules',send(admin,{date:'2026-09-26',type:'VALID_WEEKEND',reason:'另一次补课'}))).status,400)
  assert.equal((await call('/api/admin/courses',send(admin,{title:'周末集中课程再发布',location:'澳门',startAt:'2026-09-26T09:00',endAt:'2026-09-26T16:00'}))).status,201)
  assert.equal((await call('/api/compliance',{headers:{cookie:student}})).data.compliance.compliantDays,2)
  assert.ok(sql.prepare("SELECT count(*) n FROM audit_logs WHERE entity_type='date_rule'").get().n>=6)
  assert.equal(sql.prepare('SELECT check_in_at FROM stay_records WHERE user_id=? ORDER BY id LIMIT 1').get(studentId).check_in_at,'2026-09-25T01:00:00.000Z')
  // A date-only PATCH from an older client must not discard valid instants when dates do not change.
  const first=sql.prepare("SELECT id FROM stay_records WHERE user_id=? AND start_date='2026-09-25'").get(studentId)
  r=await call(`/api/stays/${first.id}`,send(student,{startDate:'2026-09-25',endDate:'2026-09-25'},'PATCH'))
  assert.equal(r.status,200)
  assert.equal(sql.prepare('SELECT check_in_at FROM stay_records WHERE id=?').get(first.id).check_in_at,'2026-09-25T01:00:00.000Z')
  assert.equal((await call('/api/compliance',{headers:{cookie:student}})).data.compliance.compliantDays,2)

  // Date-only V1 calls remain accepted, but cannot silently earn 4 hours.
  r=await call('/api/stays',send(student,{startDate:'2026-09-28',endDate:'2026-09-28'}))
  assert.equal(r.status,201);assert.equal(r.data.timeUnknown,true)
  assert.equal((await call('/api/compliance',{headers:{cookie:student}})).data.compliance.timeUnknownDays,1)
  const old=sql.prepare("SELECT id FROM stay_records WHERE user_id=? AND start_date='2026-09-28'").get(studentId)
  r=await call(`/api/stays/${old.id}`,send(student,{startAt:'2026-09-28T09:00',endAt:'2026-09-28T13:00'},'PATCH'))
  assert.equal(r.status,200)
  assert.equal((await call('/api/compliance',{headers:{cookie:student}})).data.compliance.timeUnknownDays,0)
  assert.equal((await call('/api/compliance',{headers:{cookie:student}})).data.compliance.compliantDays,3)
  // Backfill: server stores selected actual exit instant, not current timestamp.
  r=await call('/api/stays/check-in',send(student,{}));assert.equal(r.status,201)
  const open=sql.prepare("SELECT id FROM stay_records WHERE user_id=? AND status='OPEN'").get(studentId)
  sql.prepare("UPDATE stay_records SET check_in_at='2026-09-24T01:00:00.000Z',start_date='2026-09-24' WHERE id=?").run(open.id)
  r=await call('/api/stays/check-out/backfill',send(student,{endAt:'2026-09-24T13:00'}))
  assert.equal(r.status,200);assert.equal(r.data.timeUnknown,false)
  assert.equal(sql.prepare('SELECT check_out_at FROM stay_records WHERE id=?').get(open.id).check_out_at,'2026-09-24T05:00:00.000Z')

  // 合并管理：旧的单日 MANUAL_INVALID 和新添加的区间在同一管理列表出现，可独立编辑、停用。
  r=await call('/api/admin/date-rules',send(admin,{date:'2026-11-15',type:'MANUAL_INVALID',reason:'历史单日强制无效'}))
  assert.equal(r.status,201)
  const oldInvalidId=r.data.rule.id
  r=await call('/api/admin/invalid-dates',send(admin,{startDate:'2026-11-16',endDate:'2026-11-17',reason:'多日不计入'}))
  assert.equal(r.status,201)
  r=await call('/api/admin/config',{headers:{cookie:admin}})
  const legacyRow=r.data.invalidRanges.find(x=>x.id===oldInvalidId&&x.source_type==='MANUAL_RULE')
  const rangeRow=r.data.invalidRanges.find(x=>x.start_date==='2026-11-16'&&x.source_type==='RANGE')
  assert.equal(legacyRow.reason,'历史单日强制无效')
  assert.equal(legacyRow.end_date,'2026-11-15')
  assert.ok(rangeRow)
  // 公共假期、旧单日无效日、新无效区间均由同一个年份管理接口返回，供前端一张卡片编辑。
  r=await call('/api/admin/date-rules',send(admin,{date:'2026-11-14',type:'PUBLIC_HOLIDAY',reason:'澳门假期'}))
  assert.equal(r.status,201)
  const combinedHolidayId=r.data.rule.id
  r=await call('/api/admin/date-rules?year=2026',{headers:{cookie:admin}})
  let unified=r.data.exceptionRecords
  const holidayRecord=unified.find(x=>x.source_type==='MANUAL_RULE'&&x.type==='PUBLIC_HOLIDAY'&&x.start_date==='2026-11-14')
  const singleRecord=unified.find(x=>x.source_type==='MANUAL_RULE'&&x.type==='MANUAL_INVALID'&&x.id===oldInvalidId)
  const intervalRecord=unified.find(x=>x.source_type==='RANGE'&&x.id===rangeRow.id)
  assert.equal(holidayRecord.id,combinedHolidayId)
  assert.equal(holidayRecord.end_date,'2026-11-14')
  assert.equal(singleRecord.reason,'历史单日强制无效')
  assert.equal(intervalRecord.end_date,'2026-11-17')
  assert.ok(intervalRecord.academic_year_id)
  assert.deepEqual(unified.map(x=>x.start_date),[...unified.map(x=>x.start_date)].sort())
  r=await call('/api/admin/date-rules/'+combinedHolidayId,send(admin,{date:'2026-11-14',type:'PUBLIC_HOLIDAY',reason:'已确认澳门假期'},'PATCH'))
  assert.equal(r.status,200)
  assert.equal((await call('/api/admin/date-rules/'+combinedHolidayId,{method:'DELETE',headers:{cookie:admin}})).status,200)
  r=await call('/api/admin/date-rules?year=2026',{headers:{cookie:admin}})
  assert.equal(r.data.exceptionRecords.some(x=>x.id===combinedHolidayId&&x.type==='PUBLIC_HOLIDAY'),false)
  assert.equal((await call('/api/admin/invalid-dates',send(admin,{startDate:'2026-11-15',endDate:'2026-11-15',reason:'重复'}))).status,409)
  assert.equal((await call('/api/admin/date-rules',send(admin,{date:'2026-11-16',type:'MANUAL_INVALID',reason:'重复'}))).status,409)
  r=await call('/api/admin/date-rules/'+oldInvalidId,send(admin,{date:'2026-11-15',type:'MANUAL_INVALID',reason:'更新后的单日原因'},'PATCH'))
  assert.equal(r.status,200)
  r=await call('/api/admin/courses',send(admin,{title:'周末补课',location:'澳门',startAt:'2026-11-15T09:00',endAt:'2026-11-15T16:00'}))
  assert.equal(r.status,201)
  const ruleCheckPath='/api/travel-plans/date-check?startDate=2026-11-15&endDate=2026-11-17'
  r=await call(ruleCheckPath,{headers:{cookie:student}})
  assert.deepEqual(r.data.days.map(x=>x.kind),['MANUAL_INVALID','MANUAL_INVALID','MANUAL_INVALID'])
  assert.equal(r.data.days[0].reason,'更新后的单日原因')
  r=await call('/api/calendar?month=2026-11',{headers:{cookie:student}})
  assert.equal(r.data.days.find(x=>x.date==='2026-11-15').isInvalidDate,true)
  assert.equal(r.data.days.find(x=>x.date==='2026-11-15').isCourse,true)
  assert.equal((await call('/api/admin/date-rules/'+oldInvalidId,{method:'DELETE',headers:{cookie:admin}})).status,200)
  r=await call(ruleCheckPath,{headers:{cookie:student}})
  assert.equal(r.data.days[0].kind,'COURSE_DAY') // 停用无效日后，已发布课程使周末恢复资格
  assert.equal(r.data.days[1].kind,'MANUAL_INVALID')
  assert.equal((await call('/api/admin/invalid-dates/'+rangeRow.id,{method:'DELETE',headers:{cookie:admin}})).status,200)
  r=await call('/api/admin/config',{headers:{cookie:admin}})
  assert.equal(r.data.invalidRanges.some(x=>x.start_date==='2026-11-15'||x.start_date==='2026-11-16'),false)
})
