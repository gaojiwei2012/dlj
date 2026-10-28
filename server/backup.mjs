import { DatabaseSync } from 'node:sqlite'
import { mkdirSync,readdirSync,statSync,unlinkSync,copyFileSync,readFileSync,existsSync,renameSync } from 'node:fs'
import { dirname,join,resolve } from 'node:path'

const dbPath=resolve(process.env.DB_PATH||'data/douliuji.db')
const backupDir=resolve(process.env.BACKUP_DIR||'backups')
const keep=Number(process.env.BACKUP_KEEP||7)
function stamp(){return new Date().toISOString().replace(/[:.]/g,'-')}
export function backup(){if(!existsSync(dbPath))throw new Error('数据库尚未创建，无法备份');mkdirSync(backupDir,{recursive:true});const target=join(backupDir,`douliuji-${stamp()}.db`);const db=new DatabaseSync(dbPath);try{db.exec(`VACUUM INTO '${target.replaceAll("'","''")}'`)}finally{db.close()}const files=readdirSync(backupDir).filter(x=>/^douliuji-.*\.db$/.test(x)).map(x=>({x,t:statSync(join(backupDir,x)).mtimeMs})).sort((a,b)=>b.t-a.t);for(const f of files.slice(keep))unlinkSync(join(backupDir,f.x));console.log(`备份完成 ${target}`);return target}
export function restore(source){const src=resolve(source),header=readFileSync(src,{encoding:null}).subarray(0,16).toString();if(header!=='SQLite format 3\u0000')throw new Error('不是有效的 SQLite 备份');const check=new DatabaseSync(src,{readOnly:true});try{if(check.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('备份文件完整性检查失败')}finally{check.close()}mkdirSync(dirname(dbPath),{recursive:true});const temporary=dbPath+'.restoring';try{copyFileSync(src,temporary);for(const sidecar of [dbPath+'-wal',dbPath+'-shm'])if(existsSync(sidecar))unlinkSync(sidecar);renameSync(temporary,dbPath)}finally{if(existsSync(temporary))unlinkSync(temporary)}console.log(`恢复完成 ${dbPath}`)}
const args=process.argv.slice(2)
if(args[0]==='--restore'){if(!args[1])throw new Error('请提供备份文件路径');restore(args[1])}
else if(args[0]==='--watch'){backup();setInterval(backup,24*60*60*1000)}
else backup()
