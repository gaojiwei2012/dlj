import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

async function freePort() {
  const server=createServer()
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const port=server.address().port
  await new Promise(resolve=>server.close(resolve))
  return port
}

test('plan type is persisted, editable, defaults to SELF, and legacy patches preserve it',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'douliuji-plan-type-'))
  const port=await freePort()
  const child=spawn(process.execPath,['server/index.mjs'],{
    cwd:process.cwd(),stdio:'ignore',
    env:{...process.env,DB_PATH:join(dir,'test.db'),PORT:String(port),NODE_ENV:'development',INIT_ADMIN_PASSWORD:'plan-type-admin-123',INIT_INVITE_CODE:'PLAN-TYPE-CODE'}
  })
  t.after(async()=>{
    if(child.exitCode===null&&child.signalCode===null){
      const exited=new Promise(resolve=>child.once('close',resolve))
      child.kill();await exited
    }
    rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100})
  })
  const base=`http://127.0.0.1:${port}`
  async function call(path,method='GET',cookie='',data){
    const r=await fetch(base+path,{
      method,headers:{cookie,'content-type':'application/json'},
      ...(data===undefined?{}:{body:JSON.stringify(data)})
    })
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}
  }
  let ready=false
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error('server exited early')
    try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,40))
  }
  assert.ok(ready,'server should be ready')
  let r=await call('/api/auth/register','POST','',{username:'type-student',password:'test123456',confirmPassword:'test123456',displayName:'分类测试',inviteCode:'PLAN-TYPE-CODE'})
  assert.equal(r.status,201)
  r=await call('/api/auth/login','POST','',{username:'type-student',password:'test123456'})
  const cookie=r.cookie
  assert.ok(cookie)

  const date={departDate:'2026-10-08',returnDate:'2026-10-11',isPublic:false}
  r=await call('/api/travel-plans','POST',cookie,{...date,planType:'COURSE'})
  assert.equal(r.status,201)
  const courseId=r.data.id
  r=await call('/api/travel-plans','POST',cookie,date)
  assert.equal(r.status,201)
  const legacyId=r.data.id
  r=await call('/api/travel-plans','POST',cookie,{...date,planType:'INVALID'})
  assert.equal(r.status,400)
  let plans=(await call('/api/travel-plans','GET',cookie)).data.plans
  assert.equal(plans.find(p=>p.id===courseId).plan_type,'COURSE')
  assert.equal(plans.find(p=>p.id===legacyId).plan_type,'SELF')

  // Example of existing clients sending an unpublish request without planType.
  r=await call(`/api/travel-plans/${courseId}`,'PATCH',cookie,{...date,isPublic:false})
  assert.equal(r.status,200)
  plans=(await call('/api/travel-plans','GET',cookie)).data.plans
  assert.equal(plans.find(p=>p.id===courseId).plan_type,'COURSE')

  r=await call(`/api/travel-plans/${legacyId}`,'PATCH',cookie,{...date,planType:'COURSE'})
  assert.equal(r.status,200)
  r=await call(`/api/travel-plans/${courseId}`,'PATCH',cookie,{...date,planType:'SELF'})
  assert.equal(r.status,200)
  r=await call(`/api/travel-plans/${legacyId}`,'PATCH',cookie,{...date,planType:'INVALID'})
  assert.equal(r.status,400)
  plans=(await call('/api/travel-plans','GET',cookie)).data.plans
  assert.equal(plans.find(p=>p.id===legacyId).plan_type,'COURSE')
  assert.equal(plans.find(p=>p.id===courseId).plan_type,'SELF')
  const prediction=await call('/api/travel-plans/prediction','GET',cookie)
  assert.equal(prediction.status,200)
  assert.ok(prediction.data.prediction.forecast.totalPlannedDays>=1)
})
