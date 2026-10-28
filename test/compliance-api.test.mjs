import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('R001 只读接口鉴权、真实记录、旧无效日及新日期规则联动', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'douliuji-r001-api-'))
  const dbPath = join(dir, 'test.db'), port = 3297
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: {...process.env, PORT: String(port), DB_PATH: dbPath,
      INIT_ADMIN_PASSWORD: 'admin-test-123', INIT_INVITE_CODE: 'TEST-CODE'},
    stdio: 'ignore'
  })
  let sql
  let childClosed = false
  child.once('close', () => { childClosed = true })
  t.after(async () => {
    // Windows will not remove SQLite files until every handle has been released.
    if (sql) sql.close()
    if (!childClosed) {
      const closed = new Promise(resolve => child.once('close', resolve))
      if (child.exitCode === null && child.signalCode === null) child.kill()
      await closed
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  const base = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`服务器提前退出：${child.exitCode}`)
    try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  assert.equal(ready, true, 'API 服务未能在临时数据库上启动')
  const call = async(path, options = {}) => {
    const response = await fetch(base + path, options)
    return {status: response.status, headers: response.headers, data: await response.json()}
  }
  const send = (cookie, body) => ({ method: 'POST',
    headers: {'content-type':'application/json', cookie}, body: JSON.stringify(body) })
  let result = await call('/api/compliance')
  assert.equal(result.status, 401)
  result = await call('/api/auth/register', send('', {displayName:'学生', username:'student',
    password:'testpass123', confirmPassword:'testpass123', inviteCode:'TEST-CODE'}))
  assert.equal(result.status, 201)
  const studentId = result.data.id
  result = await call('/api/auth/login', send('', {username:'student', password:'testpass123'}))
  const userCookie = result.headers.get('set-cookie').split(';')[0]
  result = await call('/api/compliance', {headers:{cookie:userCookie}})
  assert.equal(result.status, 200)
  assert.equal(result.data.compliance.compliantDays, 0)
  assert.equal(result.data.compliance.thresholdMinutes, 240)
  result = await call('/api/compliance?yearId=9999', {headers:{cookie:userCookie}})
  assert.equal(result.status, 404)

  // A V1 date-only manual record is intentionally not credited as four hours.
  result = await call('/api/stays', send(userCookie, {startDate:'2026-09-23', endDate:'2026-09-23'}))
  assert.equal(result.status, 201)
  result = await call('/api/compliance', {headers:{cookie:userCookie}})
  assert.equal(result.data.compliance.timeUnknownDays, 1)
  assert.equal(result.data.compliance.compliantDays, 0)

  sql = new DatabaseSync(dbPath)
  const now = new Date().toISOString()
  sql.prepare(`INSERT INTO stay_records(user_id,check_in_at,check_out_at,start_date,end_date,
    source,status,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,'CHECK_IN','CLOSED',?,?,?)`).run(studentId,
      '2026-09-26T01:00:00Z', '2026-09-26T05:00:00Z',
      '2026-09-26', '2026-09-26', studentId, now, now)
  sql.prepare(`INSERT INTO date_rules(rule_date,type,source,reason,created_at,updated_at)
    VALUES('2026-09-26','VALID_WEEKEND','MANUAL','补课',?,?)`).run(now, now)
  result = await call('/api/compliance', {headers:{cookie:userCookie}})
  const saturday = result.data.compliance.dailyResults.find(day => day.date === '2026-09-26')
  assert.equal(saturday.status, 'PARTIAL')
  assert.equal(saturday.stayMinutes, 240)
  assert.equal(result.data.compliance.compliantDays, 0)

  sql.prepare(`INSERT INTO date_rules(rule_date,type,source,reason,created_at,updated_at)
    VALUES('2026-09-26','PUBLIC_HOLIDAY','MANUAL','人工节假日',?,?)`).run(now, now)
  result = await call('/api/compliance', {headers:{cookie:userCookie}})
  assert.equal(result.data.compliance.dailyResults.find(day => day.date === '2026-09-26').status, 'NON_COMPLIANT')
  assert.equal(result.data.compliance.compliantDays, 0)
  assert.equal(result.data.compliance.nonCompliantDays, 1)

  result = await call('/api/auth/login', send('', {username:'admin', password:'admin-test-123'}))
  const adminCookie = result.headers.get('set-cookie').split(';')[0]
  result = await call('/api/admin/invalid-dates', send(adminCookie,
    {startDate:'2026-09-23', endDate:'2026-09-23', reason:'历史无效日'}))
  assert.equal(result.status, 201)
  result = await call('/api/compliance', {headers:{cookie:userCookie}})
  assert.equal(result.data.compliance.timeUnknownDays, 0)
  assert.equal(result.data.compliance.nonCompliantDays, 2)
  assert.equal(result.data.compliance.dailyResults.find(day => day.date === '2026-09-23').reasonCode, 'MANUAL_INVALID')
})
