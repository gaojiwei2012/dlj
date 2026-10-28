import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('R003 self-drive reservations: privacy, reserve/cancel, capacity guards and last-seat concurrency', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'douliuji-r003-'))
  const dbPath = join(dir, 'test.db')
  const port = 3397
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, INIT_ADMIN_USER: 'admin', INIT_ADMIN_PASSWORD: 'admin-test-123', INIT_INVITE_CODE: 'BOOT-CODE' },
    stdio: 'ignore'
  })
  t.after(() => child.kill())
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break } catch {}
    await new Promise(r => setTimeout(r, 50))
  }
  const call = async (path, options = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, options)
    return { r, d: await r.json() }
  }
  const login = async (username, password = 'testpass123') => {
    const x = await call('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
    assert.equal(x.r.status, 200)
    return x.r.headers.get('set-cookie').split(';')[0]
  }
  const send = (cookie, data) => ({ headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(data) })

  const admin = await login('admin', 'admin-test-123')
  let x = await call('/api/admin/invite-codes', { method: 'POST', ...send(admin, { maxUses: 4 }) })
  assert.equal(x.r.status, 201)
  const code = x.d.code
  for (const [displayName, username] of [['发布者', 'driver'], ['乘客A', 'riderA'], ['乘客B', 'riderB'], ['旁观者', 'viewer']]) {
    x = await call('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName, username, password: 'testpass123', confirmPassword: 'testpass123', inviteCode: code }) })
    assert.equal(x.r.status, 201)
  }
  const driver = await login('driver')
  const riderA = await login('riderA')
  const riderB = await login('riderB')
  const viewer = await login('viewer')

  // Contact is mandatory only for publicly reservable self-drive seats.
  x = await call('/api/travel-plans', { method: 'POST', ...send(driver, { departDate: '2099-10-10', returnDate: '2099-10-12', isPublic: true, city: '广州', transport: '自驾', hasSeats: true, seatCount: 3 }) })
  assert.equal(x.r.status, 400)

  x = await call('/api/travel-plans', { method: 'POST', ...send(driver, { departDate: '2099-10-10', returnDate: '2099-10-12', isPublic: true, city: '广州', transport: '自驾', hasSeats: true, seatCount: 3, contactType: '微信', contactValue: 'driver-wechat' }) })
  assert.equal(x.r.status, 201)
  const planId = x.d.id

  x = await call('/api/companions', { headers: { cookie: riderA } })
  let plan = x.d.plans.find(p => p.id === planId)
  assert.equal(plan.remaining_seats, 3)
  assert.equal(plan.seat_capacity, 3)
  assert.equal(plan.can_reserve, true)
  assert.equal('contact' in plan, false)

  x = await call('/api/companions', { headers: { cookie: driver } })
  plan = x.d.plans.find(p => p.id === planId)
  assert.equal(plan.is_owner, true)
  assert.deepEqual(plan.contact, { type: '微信', value: 'driver-wechat' })

  x = await call(`/api/travel-plans/${planId}/reservations`, { method: 'POST', headers: { cookie: driver } })
  assert.equal(x.r.status, 400)

  x = await call(`/api/travel-plans/${planId}/reservations`, { method: 'POST', headers: { cookie: riderA } })
  assert.equal(x.r.status, 201)
  assert.equal(x.d.remainingSeats, 2)
  assert.deepEqual(x.d.contact, { type: '微信', value: 'driver-wechat' })

  x = await call('/api/companions', { headers: { cookie: riderA } })
  plan = x.d.plans.find(p => p.id === planId)
  assert.equal(plan.is_reserved_by_me, true)
  assert.equal(plan.remaining_seats, 2)
  assert.deepEqual(plan.contact, { type: '微信', value: 'driver-wechat' })

  x = await call('/api/companions', { headers: { cookie: riderB } })
  plan = x.d.plans.find(p => p.id === planId)
  assert.equal('contact' in plan, false)

  x = await call(`/api/travel-plans/${planId}/reservations`, { method: 'POST', headers: { cookie: riderA } })
  assert.equal(x.r.status, 409)

  x = await call(`/api/travel-plans/${planId}/reservations/me`, { method: 'DELETE', headers: { cookie: riderB } })
  assert.equal(x.r.status, 409)
  x = await call('/api/companions', { headers: { cookie: riderB } })
  assert.equal(x.d.plans.find(p => p.id === planId).remaining_seats, 2)

  x = await call(`/api/travel-plans/${planId}/reservations/me`, { method: 'DELETE', headers: { cookie: riderA } })
  assert.equal(x.r.status, 200)
  assert.equal(x.d.remainingSeats, 3)
  x = await call('/api/companions', { headers: { cookie: riderA } })
  plan = x.d.plans.find(p => p.id === planId)
  assert.equal(plan.is_reserved_by_me, false)
  assert.equal('contact' in plan, false)
  x = await call(`/api/travel-plans/${planId}/reservations/me`, { method: 'DELETE', headers: { cookie: riderA } })
  assert.equal(x.r.status, 409)

  // Re-reservation is allowed after cancellation, but only one active reservation per person/plan.
  x = await call(`/api/travel-plans/${planId}/reservations`, { method: 'POST', headers: { cookie: riderA } })
  assert.equal(x.r.status, 201)
  x = await call(`/api/travel-plans/${planId}/reservations`, { method: 'POST', headers: { cookie: riderB } })
  assert.equal(x.r.status, 201)

  // Capacity shrink stays blocked while booked; unpublish preserves existing reservations.
  x = await call(`/api/travel-plans/${planId}`, { method: 'PATCH', headers: { cookie: driver }, body: JSON.stringify({ departDate: '2099-10-10', returnDate: '2099-10-12', isPublic: true, city: '广州', transport: '自驾', hasSeats: true, seatCount: 1, contactType: '微信', contactValue: 'driver-wechat' }) })
  assert.equal(x.r.status, 409)
  x = await call(`/api/travel-plans/${planId}`, { method: 'PATCH', headers: { cookie: driver }, body: JSON.stringify({ departDate: '2099-10-10', returnDate: '2099-10-12', isPublic: false }) })
  assert.equal(x.r.status, 200)
  x = await call('/api/companions', { headers: { cookie: riderA } })
  assert.equal(x.d.plans.find(p => p.id === planId)?.is_reserved_by_me, true)
  x = await call('/api/companions', { headers: { cookie: viewer } })
  assert.equal(x.d.plans.some(p => p.id === planId), false)
  x = await call(`/api/travel-plans/${planId}`, { method: 'DELETE', headers: { cookie: driver } })
  assert.equal(x.r.status, 200)
  x = await call('/api/companions', { headers: { cookie: riderA } })
  assert.equal(x.d.plans.some(p => p.id === planId), false)

  // Last-seat race: exactly one request wins and the remaining count never becomes negative.
  x = await call('/api/travel-plans', { method: 'POST', ...send(driver, { departDate: '2099-11-10', returnDate: '2099-11-11', isPublic: true, city: '深圳', transport: '自驾', hasSeats: true, seatCount: 1, contactType: '手机号', contactValue: '13800000000' }) })
  assert.equal(x.r.status, 201)
  const lastSeatPlanId = x.d.id
  const [aRace, bRace] = await Promise.all([
    call(`/api/travel-plans/${lastSeatPlanId}/reservations`, { method: 'POST', headers: { cookie: riderA } }),
    call(`/api/travel-plans/${lastSeatPlanId}/reservations`, { method: 'POST', headers: { cookie: riderB } })
  ])
  assert.deepEqual([aRace.r.status, bRace.r.status].sort((a, b) => a - b), [201, 409])
  const winnerCookie = aRace.r.status === 201 ? riderA : riderB
  const loserCookie = aRace.r.status === 201 ? riderB : riderA

  x = await call('/api/companions', { headers: { cookie: viewer } })
  plan = x.d.plans.find(p => p.id === lastSeatPlanId)
  assert.equal(plan.remaining_seats, 0)
  assert.equal(plan.is_full, true)
  assert.equal(plan.can_reserve, false)
  assert.equal('contact' in plan, false)
  x = await call('/api/companions', { headers: { cookie: winnerCookie } })
  assert.deepEqual(x.d.plans.find(p => p.id === lastSeatPlanId).contact, { type: '手机号', value: '13800000000' })
  x = await call('/api/companions', { headers: { cookie: loserCookie } })
  assert.equal('contact' in x.d.plans.find(p => p.id === lastSeatPlanId), false)

  x = await call(`/api/travel-plans/${lastSeatPlanId}/reservations/me`, { method: 'DELETE', headers: { cookie: winnerCookie } })
  assert.equal(x.r.status, 200)
  assert.equal(x.d.remainingSeats, 1)
  x = await call('/api/companions', { headers: { cookie: winnerCookie } })
  assert.equal('contact' in x.d.plans.find(p => p.id === lastSeatPlanId), false)

  const check = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const cancelled = check.prepare("SELECT COUNT(*) count FROM travel_seat_reservations WHERE status='CANCELLED'").get().count
    assert.ok(cancelled >= 2)
    assert.equal(check.prepare('SELECT seat_count FROM travel_plans WHERE id=?').get(lastSeatPlanId).seat_count, 1)
  } finally { check.close() }
})
