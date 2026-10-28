import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { runMigrations, SCHEMA_VERSION } from '../server/migrations/index.mjs'

test('V1 user_version=0 可升级至最新，保留旧记录、幂等且允许多维规则叠加', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE course_sessions(id INTEGER PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE invalid_date_ranges(id INTEGER PRIMARY KEY,start_date TEXT,end_date TEXT,reason TEXT);
      CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,display_name TEXT,status TEXT);
      CREATE TABLE travel_plans(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,depart_date TEXT NOT NULL,return_date TEXT NOT NULL,is_public INTEGER NOT NULL DEFAULT 0,city TEXT,transport TEXT,has_seats INTEGER,seat_count INTEGER,status TEXT NOT NULL DEFAULT 'ACTIVE');
      INSERT INTO course_sessions(title) VALUES('历史课程');
      INSERT INTO invalid_date_ranges(start_date,end_date,reason) VALUES('2026-09-26','2026-09-26','原无效日期');
      INSERT INTO users(id,username,display_name,status) VALUES(1,'legacy','历史用户','ACTIVE');
      INSERT INTO travel_plans(user_id,depart_date,return_date,is_public,city,transport,has_seats,seat_count,status) VALUES(1,'2026-10-01','2026-10-02',1,'广州','自驾',1,3,'ACTIVE');`)
    assert.equal(runMigrations(db), SCHEMA_VERSION)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION)
    assert.equal(db.prepare('SELECT reason FROM invalid_date_ranges').get().reason, '原无效日期')
    const columns = db.prepare('PRAGMA table_info(course_sessions)').all().map(c => c.name)
    assert.ok(['location', 'start_at', 'end_at'].every(name => columns.includes(name)))
    const insert = db.prepare(`INSERT INTO date_rules(rule_date,type,source,created_at,updated_at)
      VALUES(?,?,?,?,?)`)
    for (const type of ['WEEKEND', 'VALID_WEEKEND', 'PUBLIC_HOLIDAY']) {
      insert.run('2026-09-26', type, type === 'WEEKEND' ? 'AUTO' : 'MANUAL', 'now', 'now')
    }
    assert.equal(db.prepare('SELECT COUNT(*) total FROM date_rules').get().total, 3)
    assert.equal(db.prepare('SELECT seat_capacity FROM travel_plans WHERE id=1').get().seat_capacity, 3)
    assert.equal(db.prepare('SELECT plan_type FROM travel_plans WHERE id=1').get().plan_type, 'SELF')
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='travel_seat_reservations'").get())
    runMigrations(db)
    assert.equal(db.prepare('SELECT COUNT(*) total FROM date_rules').get().total, 3)
    assert.equal(db.prepare('SELECT title FROM course_sessions').get().title, '历史课程')
  } finally { db.close() }
})

test('拒绝未知的更新版数据库，而不是静默覆盖', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`PRAGMA user_version=${SCHEMA_VERSION + 1}`)
    assert.throws(() => runMigrations(db), /不支持数据库版本/)
  } finally { db.close() }
})


test('V3 数据升级后，计划类型默认自行安排且保留原行数据', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE travel_plans (id INTEGER PRIMARY KEY,user_id INTEGER,depart_date TEXT,return_date TEXT,is_public INTEGER);
      INSERT INTO travel_plans (user_id,depart_date,return_date,is_public) VALUES (7,'2026-10-08','2026-10-11',0);
      PRAGMA user_version=3;`)
    assert.equal(runMigrations(db), SCHEMA_VERSION)
    assert.deepEqual({...db.prepare('SELECT id,user_id,depart_date,return_date,plan_type FROM travel_plans').get()},
      {id:1,user_id:7,depart_date:'2026-10-08',return_date:'2026-10-11',plan_type:'SELF'})
    db.prepare('UPDATE travel_plans SET plan_type=? WHERE id=1').run('COURSE')
    assert.equal(db.prepare('SELECT plan_type FROM travel_plans WHERE id=1').get().plan_type,'COURSE')
    assert.throws(() => db.prepare('UPDATE travel_plans SET plan_type=? WHERE id=1').run('INVALID'), /CHECK constraint/)
  } finally { db.close() }
})
