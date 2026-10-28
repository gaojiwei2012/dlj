import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('admin deletion hides invite and user, revokes access, and retains historical rows', async t => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'douliuji-admin-delete-')), 'test.db')
  const port = 3399
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath,
      INIT_ADMIN_USER: 'admin', INIT_ADMIN_PASSWORD: 'admin-test-123', INIT_INVITE_CODE: 'BOOT-CODE' },
    stdio: 'ignore'
  })
  t.after(() => child.kill())
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  async function call(path, method = 'GET', cookie = '', data) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { cookie, 'content-type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const admin = (await call('/auth/login', 'POST', '', { username: 'admin', password: 'admin-test-123' })).cookie
  let response = await call('/admin/invite-codes', 'POST', admin, { maxUses: 3 })
  assert.equal(response.status, 201)
  const { id: inviteId, code } = response.data
  for (const username of ['owner', 'booker']) {
    response = await call('/auth/register', 'POST', '', {
      username, displayName: username, password: 'testpass123', confirmPassword: 'testpass123', inviteCode: code
    })
    assert.equal(response.status, 201)
  }
  const owner = (await call('/auth/login', 'POST', '', { username: 'owner', password: 'testpass123' })).cookie
  const booker = (await call('/auth/login', 'POST', '', { username: 'booker', password: 'testpass123' })).cookie
  response = await call('/travel-plans', 'POST', owner, {
    departDate: '2099-10-10', returnDate: '2099-10-12', isPublic: true,
    city: '广州', transport: '自驾', hasSeats: true, seatCount: 1,
    contactType: '微信', contactValue: 'test-contact'
  })
  assert.equal(response.status, 201)
  const planId = response.data.id
  assert.equal((await call(`/travel-plans/${planId}/reservations`, 'POST', booker)).status, 201)
  response = await call('/admin/users')
  assert.equal(response.status, 401)
  response = await call('/admin/users', 'GET', admin)
  const ownerId = response.data.users.find(user => user.username === 'owner').id
  assert.equal((await call('/admin/users/' + ownerId, 'DELETE', owner)).status, 403)
  assert.equal((await call('/admin/users/' + ownerId, 'DELETE', admin)).status, 200)
  assert.equal((await call('/admin/users/' + ownerId, 'DELETE', admin)).status, 404)
  assert.equal((await call('/auth/me', 'GET', owner)).status, 401)
  assert.equal((await call('/auth/login', 'POST', '', { username: 'owner', password: 'testpass123' })).status, 401)
  assert.equal((await call('/admin/users', 'GET', admin)).data.users.some(user => user.id === ownerId), false)
  assert.equal((await call('/companions', 'GET', booker)).data.plans.some(plan => plan.id === planId), false)
  assert.equal((await call('/admin/users/' + 1, 'DELETE', admin)).status, 400)

  assert.equal((await call('/admin/invite-codes/' + inviteId, 'DELETE', admin)).status, 200)
  assert.equal((await call('/admin/invite-codes', 'GET', admin)).data.codes.some(item => item.id === inviteId), false)
  assert.equal((await call('/admin/invite-codes/' + inviteId, 'PATCH', admin)).status, 404)
  assert.equal((await call('/auth/register', 'POST', '', {
    username: 'newuser', displayName: 'newuser', password: 'testpass123',
    confirmPassword: 'testpass123', inviteCode: code
  })).status, 400)

  const database = new DatabaseSync(dbPath, { readOnly: true })
  try {
    assert.equal(database.prepare("SELECT status FROM users WHERE id=?").get(ownerId).status, 'DELETED')
    assert.equal(database.prepare('SELECT status FROM travel_plans WHERE id=?').get(planId).status, 'DELETED')
    assert.equal(database.prepare('SELECT status FROM travel_seat_reservations WHERE travel_plan_id=?').get(planId).status, 'CANCELLED')
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='DELETE' AND entity_type='user' AND entity_id=?").get(ownerId).count, 1)
  } finally { database.close() }
})
