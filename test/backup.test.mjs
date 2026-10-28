import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('backup restores checked data and removes stale SQLite sidecars', t => {
  const dir = mkdtempSync(join(tmpdir(), 'douliuji-backup-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const dbPath = join(dir, 'app.db')
  const backupDir = join(dir, 'backups')
  const env = { ...process.env, DB_PATH: dbPath, BACKUP_DIR: backupDir }
  const run = (...args) => execFileSync(process.execPath, ['server/backup.mjs', ...args], { env, cwd: process.cwd() })
  const db = new DatabaseSync(dbPath)
  db.exec("CREATE TABLE notes (value TEXT); INSERT INTO notes VALUES ('original')")
  db.close()
  run()
  const source = join(backupDir, readdirSync(backupDir)[0])
  const changed = new DatabaseSync(dbPath)
  changed.exec("UPDATE notes SET value='changed'")
  changed.close()
  writeFileSync(dbPath + '-wal', 'stale')
  writeFileSync(dbPath + '-shm', 'stale')
  run('--restore', source)
  assert.equal(existsSync(dbPath + '-wal'), false)
  assert.equal(existsSync(dbPath + '-shm'), false)
  const restored = new DatabaseSync(dbPath)
  assert.equal(restored.prepare('SELECT value FROM notes').get().value, 'original')
  restored.close()
  const invalid = join(dir, 'invalid.db')
  writeFileSync(invalid, 'not a database')
  const rejected = spawnSync(process.execPath, ['server/backup.mjs', '--restore', invalid], { env, cwd: process.cwd() })
  assert.notEqual(rejected.status, 0)
  const afterReject = new DatabaseSync(dbPath)
  assert.equal(afterReject.prepare('SELECT value FROM notes').get().value, 'original')
  afterReject.close()
})
