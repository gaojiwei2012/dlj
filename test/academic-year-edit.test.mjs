import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)

test('管理员可以修正所选历史或当前学年，不改变启用状态，并验证日期边界',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'douliuji-year-edit-'))
  const port=34567
  const child=spawn(process.execPath,['server/index.mjs'],{
    cwd:process.cwd(),env:{...process.env,PORT:String(port),DB_PATH:join(dir,'app.db'),INIT_ADMIN_PASSWORD:'test-admin-12345',INIT_INVITE_CODE:'YEAR-TEST-CODE'},stdio:'pipe'
  })
  t.after(()=>child.kill())
  let started=false
  for(let i=0;i<100;i++){
    try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok){started=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,40))
  }
  assert.equal(started,true,'服务必须正常启动')
  const call=async(path,cookie,method='GET',body)=>{
    const res=await fetch(`http://127.0.0.1:${port}/api${path}`,{
      method,headers:{...(cookie?{cookie}:{}),'content-type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})
    })
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}
  }
  let r=await call('/auth/login',null,'POST',{username:'admin',password:'test-admin-12345'})
  assert.equal(r.status,200);const adminCookie=r.cookie
  r=await call('/auth/register',null,'POST',{displayName:'学生',username:'student',password:'12345678',confirmPassword:'12345678',inviteCode:'YEAR-TEST-CODE'})
  assert.equal(r.status,201)
  r=await call('/auth/login',null,'POST',{username:'student',password:'12345678'})
  assert.equal(r.status,200);const userCookie=r.cookie
  r=await call('/academic-years',userCookie)
  const old=r.data.years.find(y=>y.is_current)
  assert.ok(old)
  r=await call('/stays',userCookie,'POST',{startDate:old.start_date,endDate:old.start_date})
  assert.equal(r.status,201)
  const nextStart=shift(old.end_date,1),nextEnd=shift(old.end_date,360)
  r=await call('/admin/academic-years',adminCookie,'POST',{startDate:nextStart,endDate:nextEnd,targetDays:90})
  assert.equal(r.status,201);const newId=r.data.id
  const editPayload={name:'修正后的旧学年',startDate:shift(old.start_date,2),endDate:shift(old.end_date,-1),targetDays:88}
  r=await call('/admin/academic-years/'+old.id,userCookie,'PATCH',editPayload)
  assert.equal(r.status,403,'非管理员不得编辑学年')
  r=await call('/admin/academic-years/999999',adminCookie,'PATCH',editPayload)
  assert.equal(r.status,404,'不存在的学年应返回404')
  r=await call('/admin/academic-years/'+old.id,adminCookie,'PATCH',{...editPayload,startDate:'2026-13-01'})
  assert.equal(r.status,400,'非法日期应阻止保存')
  r=await call('/admin/academic-years/'+old.id,adminCookie,'PATCH',{...editPayload,endDate:nextStart})
  assert.equal(r.status,409,'不得和其他学年重叠')
  r=await call('/admin/academic-years/'+old.id,adminCookie,'PATCH',editPayload)
  assert.equal(r.status,200)
  assert.equal(r.data.academicYear.name,editPayload.name)
  assert.equal(r.data.academicYear.start_date,editPayload.startDate)
  assert.equal(r.data.academicYear.end_date,editPayload.endDate)
  assert.equal(r.data.academicYear.target_days,88)
  assert.equal(r.data.academicYear.is_current,0,'编辑历史学年不得自动启用')
  r=await call('/academic-years',userCookie)
  assert.equal(r.data.years.find(y=>y.id===old.id).start_date,editPayload.startDate)
  assert.equal(r.data.years.find(y=>y.id===newId).is_current,1)
  r=await call('/dashboard?yearId='+old.id,userCookie)
  assert.equal(r.data.stats.academicYear.target_days,88,'统计应读到更新后的学年配置')
  r=await call('/stays',userCookie)
  assert.ok(r.data.records.some(row=>row.start_date===old.start_date),'修改学年不能删除原逗留记录')
  r=await call('/stays?yearId='+old.id,userCookie)
  assert.equal(r.data.records.some(row=>row.start_date===old.start_date),false,'新学年范围应重新筛选记录')
  r=await call('/admin/invalid-dates',adminCookie,'POST',{startDate:shift(nextStart,10),endDate:shift(nextStart,11),reason:'测试无效日'})
  assert.equal(r.status,201)
  const currentPayload={name:'当前学年',startDate:shift(nextStart,15),endDate:nextEnd,targetDays:90}
  r=await call('/admin/academic-years/'+newId,adminCookie,'PATCH',currentPayload)
  assert.equal(r.status,409,'不能把已有无效日期排除到学年外')
  r=await call('/admin/courses',adminCookie,'POST',{
    title:'边界测试课程',location:'澳门',startAt:shift(nextEnd,-4)+'T09:00',endAt:shift(nextEnd,-4)+'T17:00'
  })
  assert.equal(r.status,201)
  r=await call('/admin/academic-years/'+newId,adminCookie,'PATCH',{name:'当前学年',startDate:nextStart,endDate:shift(nextEnd,-5),targetDays:90})
  assert.equal(r.status,409,'不能把已有课程排除到学年外')
  r=await call('/admin/academic-years/'+newId,adminCookie,'PATCH',{name:'已更新的当前学年',startDate:nextStart,endDate:nextEnd,targetDays:92})
  assert.equal(r.status,200)
  r=await call('/admin/config',adminCookie)
  assert.equal(r.data.academicYear.id,newId)
  assert.equal(r.data.academicYear.target_days,92)
})
