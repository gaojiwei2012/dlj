import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { runMigrations } from './migrations/index.mjs'

if(process.env.NODE_ENV==='production'){
  if(!process.env.INIT_ADMIN_PASSWORD||process.env.INIT_ADMIN_PASSWORD.length<12||/change-this|admin123456/i.test(process.env.INIT_ADMIN_PASSWORD))throw new Error('生产环境必须设置至少12位的非示例管理员密码')
  if(!process.env.INIT_INVITE_CODE||process.env.INIT_INVITE_CODE==='DOULIUJI2026')throw new Error('生产环境必须设置非示例邀请码')
}
const path=process.env.DB_PATH||'data/douliuji.db'; mkdirSync(dirname(path),{recursive:true})
export const db=new DatabaseSync(path); db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;')
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'USER',status TEXT NOT NULL DEFAULT 'ACTIVE',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invite_codes(id INTEGER PRIMARY KEY,code TEXT UNIQUE NOT NULL,max_uses INTEGER NOT NULL DEFAULT 50,used_count INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'ACTIVE',expires_at TEXT,created_by INTEGER,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS academic_years(id INTEGER PRIMARY KEY,name TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,target_days INTEGER NOT NULL DEFAULT 90,is_current INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invalid_date_ranges(id INTEGER PRIMARY KEY,academic_year_id INTEGER,start_date TEXT NOT NULL,end_date TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE IF NOT EXISTS course_sessions(id INTEGER PRIMARY KEY,academic_year_id INTEGER,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS course_dates(id INTEGER PRIMARY KEY,course_session_id INTEGER NOT NULL,course_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE IF NOT EXISTS stay_records(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,check_in_at TEXT,check_out_at TEXT,start_date TEXT NOT NULL,end_date TEXT,source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'OPEN',created_by INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_stay ON stay_records(user_id) WHERE status='OPEN' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stays_user_dates ON stay_records(user_id,start_date,end_date);
CREATE TABLE IF NOT EXISTS course_attendance(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,course_date_id INTEGER NOT NULL,selected_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',UNIQUE(user_id,course_date_id));
CREATE TABLE IF NOT EXISTS daily_stays(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,stay_date TEXT NOT NULL,academic_year_id INTEGER,source_mask TEXT,is_invalid INTEGER NOT NULL DEFAULT 0,invalid_reason TEXT,UNIQUE(user_id,stay_date));
CREATE TABLE IF NOT EXISTS travel_plans(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,depart_date TEXT NOT NULL,return_date TEXT NOT NULL,is_public INTEGER NOT NULL DEFAULT 0,city TEXT,transport TEXT,has_seats INTEGER,seat_count INTEGER,status TEXT NOT NULL DEFAULT 'ACTIVE');
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY,actor_id INTEGER,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id INTEGER,before_json TEXT,after_json TEXT,reason TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS site_announcement(id INTEGER PRIMARY KEY CHECK(id=1),content TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
`)
runMigrations(db)
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex')}
export function verifyPassword(password,stored){const [salt,hex]=stored.split(':');if(!salt||!hex)return false;const a=Buffer.from(hex,'hex'),b=scryptSync(password,salt,64);return a.length===b.length&&timingSafeEqual(a,b)}
const now=new Date().toISOString()
if(!db.prepare('SELECT id FROM invite_codes LIMIT 1').get())db.prepare('INSERT INTO invite_codes(code,max_uses,created_at) VALUES(?,?,?)').run(process.env.INIT_INVITE_CODE||'DOULIUJI2026',1,now)
if(!db.prepare('SELECT id FROM academic_years WHERE is_current=1').get()){
  const beijingYear=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric'}).format(new Date()))
  const beijingMonth=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',month:'numeric'}).format(new Date()))
  const startYear=beijingMonth>=9?beijingYear:beijingYear-1
  db.prepare('INSERT INTO academic_years(name,start_date,end_date,target_days,is_current) VALUES(?,?,?,?,1)').run(`${startYear}—${startYear+1}学年`,`${startYear}-09-01`,`${startYear+1}-08-31`,90)
}
if(!db.prepare("SELECT id FROM users WHERE role='ADMIN'").get())db.prepare('INSERT INTO users(username,password_hash,display_name,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(process.env.INIT_ADMIN_USER||'admin',hashPassword(process.env.INIT_ADMIN_PASSWORD||'admin123456'),'管理员','ADMIN','ACTIVE',now,now)
