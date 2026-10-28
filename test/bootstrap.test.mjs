import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('production bootstrap rejects example credentials and seeds current Beijing academic year', t => {
  const dir = mkdtempSync(join(tmpdir(), 'douliuji-bootstrap-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const base = { ...process.env, NODE_ENV: 'production', DB_PATH: join(dir, 'app.db'), INIT_INVITE_CODE: 'PRIVATE-START', INIT_ADMIN_PASSWORD: 'a-long-private-password' }
  const script = "import {db} from './server/db.mjs'; console.log(JSON.stringify({year:db.prepare('SELECT * FROM academic_years WHERE is_current=1').get(),invite:db.prepare('SELECT max_uses FROM invite_codes LIMIT 1').get()})); db.close()"
  assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env: { ...base, INIT_ADMIN_PASSWORD: 'admin123456' }, stdio: 'pipe' }))
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env: base }).toString()
  const { year, invite } = JSON.parse(output)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric' }).formatToParts(new Date())
  const yearNow = Number(parts.find(x => x.type === 'year').value)
  const monthNow = Number(parts.find(x => x.type === 'month').value)
  assert.equal(year.start_date, `${monthNow >= 9 ? yearNow : yearNow - 1}-09-01`)
  assert.equal(invite.max_uses, 1)
})
