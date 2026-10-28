import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

async function freePort(){
  const server=createServer()
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const port=server.address().port
  await new Promise(resolve=>server.close(resolve))
  return port
}

test('课程发布明确提示学年边界，手动启用所选学年后可发布',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'douliuji-course-year-'))
  const port=await freePort()
  const server=spawn(process.execPath,['server/index.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(port),DB_PATH:join(directory,'db.sqlite'),INIT_ADMIN_PASSWORD:'local-test-password',INIT_INVITE_CODE:'COURSE-TEST-CODE'},
    stdio:'ignore'
  })
  t.after(()=>{server.kill();rmSync(directory,{recursive:true,force:true})})
  const url=`http://127.0.0.1:${port}`
  let ready=false
  for(let i=0;i<100;i++){
    try{const r=await fetch(url+'/health');if(r.ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,40))
  }
  assert.equal(ready,true,'服务器应当启动')
  const call=async(path,method='GET',cookie='',data)=>{
    const response=await fetch(url+path,{method,headers:{cookie,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)})
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')}
  }
  const login=await call('/api/auth/login','POST','',{username:'admin',password:'local-test-password'})
  assert.equal(login.status,200)
  const cookie=login.cookie.split(';')[0]
  const initial=(await call('/api/academic-years','GET',cookie)).data.years.find(y=>y.is_current)
  const startYear=Number(initial.start_date.slice(0,4))+1
  const newer=await call('/api/admin/academic-years','POST',cookie,{startDate:`${startYear}-09-01`,endDate:`${startYear+1}-08-31`,targetDays:90})
  assert.equal(newer.status,201)
  const current=(await call('/api/admin/config','GET',cookie)).data.academicYear
  assert.equal(current.id,newer.data.id)
  const course={title:'课程 2',location:'F4',startAt:`${initial.start_date.slice(0,4)}-10-16T14:15`,endAt:`${initial.start_date.slice(0,4)}-10-18T14:15`}
  const outside=await call('/api/admin/courses','POST',cookie,course)
  assert.equal(outside.status,400)
  assert.match(outside.data.error,/课程日期超出后台当前启用/)
  assert.match(outside.data.error,new RegExp(current.start_date))
  assert.match(outside.data.error,new RegExp(current.end_date))
  const forbidden=await call(`/api/admin/academic-years/${initial.id}/activate`,'PATCH')
  assert.equal(forbidden.status,401)
  const activated=await call(`/api/admin/academic-years/${initial.id}/activate`,'PATCH',cookie)
  assert.equal(activated.status,200)
  assert.equal(activated.data.academicYear.id,initial.id)
  const updatedConfig=(await call('/api/admin/config','GET',cookie)).data.academicYear
  assert.equal(updatedConfig.id,initial.id)
  const publish=await call('/api/admin/courses','POST',cookie,course)
  assert.equal(publish.status,201)
  const sessions=(await call('/api/courses','GET',cookie)).data.sessions
  assert.equal(sessions.length,1)
  assert.equal(sessions[0].title,course.title)
  assert.equal(sessions[0].academic_year_id,initial.id)
  assert.equal(sessions[0].dates.length,3)
  const backward=await call('/api/admin/courses','POST',cookie,{...course,startAt:course.endAt,endAt:course.startAt})
  assert.equal(backward.status,400)
  assert.match(backward.data.error,/结束时间必须晚于开始时间/)
})
