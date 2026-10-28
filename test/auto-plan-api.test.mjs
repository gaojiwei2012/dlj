import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'

async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const p=server.address().port;await new Promise(resolve=>server.close(resolve));return p}

test('travel plans derive course/self ranges from published course dates and recalculate when courses change',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'douliuji-auto-plan-')),port=await freePort()
  const child=spawn(process.execPath,['server/index.mjs'],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,DB_PATH:join(dir,'test.db'),PORT:String(port),NODE_ENV:'development',INIT_ADMIN_PASSWORD:'auto-plan-admin-password',INIT_INVITE_CODE:'AUTO-PLAN-CODE'}})
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=new Promise(done=>child.once('close',done));child.kill();await done}rmSync(dir,{recursive:true,force:true,maxRetries:15,retryDelay:100})})
  const base=`http://127.0.0.1:${port}`
  async function request(path,method='GET',cookie='',payload){const res=await fetch(base+path,{method,headers:{cookie,'content-type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
  let ready=false
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('server exited unexpectedly');try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,40))}
  assert.ok(ready)
  const admin=(await request('/api/auth/login','POST','',{username:'admin',password:'auto-plan-admin-password'})).cookie
  assert.ok(admin)
  assert.equal((await request('/api/auth/register','POST','',{username:'auto-student',displayName:'自动归类测试',password:'test123456',confirmPassword:'test123456',inviteCode:'AUTO-PLAN-CODE'})).status,201)
  const student=(await request('/api/auth/login','POST','',{username:'auto-student',password:'test123456'})).cookie
  assert.ok(student)
  const year=(await request('/api/academic-years','GET',student)).data.years.find(x=>x.is_current)
  const prefix=year.start_date.slice(0,4)+'-10-'
  const start=prefix+'15',end=prefix+'19'
  const created=await request('/api/travel-plans','POST',student,{departDate:start,returnDate:end,isPublic:false})
  assert.equal(created.status,201)
  const planId=created.data.id
  const read=async()=>{
    const plans=await request('/api/travel-plans?yearId='+year.id,'GET',student)
    assert.equal(plans.status,200)
    assert.equal(plans.data.plans.length,1,'mixed date classifications must not create additional travel plans')
    assert.equal(plans.data.plans[0].id,planId)
    return plans.data.plans[0].segments
  }
  assert.deepEqual(await read(),[{type:'SELF',startDate:start,endDate:end}])
  const course=await request('/api/admin/courses','POST',admin,{title:'自动分类课程',location:'澳门',startAt:prefix+'16T09:00',endAt:prefix+'18T16:00'})
  assert.equal(course.status,201)
  assert.deepEqual(await read(),[
    {type:'SELF',startDate:start,endDate:prefix+'15'},
    {type:'COURSE',startDate:prefix+'16',endDate:prefix+'18'},
    {type:'SELF',startDate:prefix+'19',endDate:end}
  ])
  const dateCheck=await request('/api/travel-plans/date-check?'+new URLSearchParams({startDate:start,endDate:end,yearId:String(year.id)}),'GET',student)
  assert.equal(dateCheck.status,200)
  assert.equal(dateCheck.data.days.find(day=>day.date===prefix+'17').isCourseDay,true,'range picker and plan grouping should share course source')
  assert.equal((await request('/api/admin/courses/'+course.data.id,'PATCH',admin,{title:'缩短课程',location:'澳门',startAt:prefix+'17T09:00',endAt:prefix+'17T16:00'})).status,200)
  assert.deepEqual(await read(),[
    {type:'SELF',startDate:start,endDate:prefix+'16'},
    {type:'COURSE',startDate:prefix+'17',endDate:prefix+'17'},
    {type:'SELF',startDate:prefix+'18',endDate:end}
  ])
  assert.equal((await request('/api/admin/courses/'+course.data.id,'DELETE',admin)).status,200)
  assert.deepEqual(await read(),[{type:'SELF',startDate:start,endDate:end}])
})
