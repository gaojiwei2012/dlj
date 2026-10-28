import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileCalendarDays } from '../src/utils/calendar-days.mjs'

const today = '2026-10-16'
const date = '2026-10-15'
const cell = {date, inAcademicYear:true, isPresent:false, complianceStatus:'NO_STAY', stayMinutes:0, reasonCode:'NO_STAY'}
const stay = id => ({id, status:'CLOSED', start_date:date, end_date:date, deleted_at:null})
const compliance = {date,hasStay:true,status:'NON_COMPLIANT',stayMinutes:167.12,reasonCode:'PUBLIC_HOLIDAY'}

test('删除三条中的一条，日历仍根据剩余两条保留签到红点和有效的分类状态', () => {
  const result = reconcileCalendarDays([cell], [stay(2),stay(3)], [compliance], today)[0]
  assert.equal(result.isPresent,true)
  assert.equal(result.complianceStatus,'NON_COMPLIANT')
  assert.equal(result.reasonCode,'PUBLIC_HOLIDAY')
  assert.equal(result.stayMinutes,167.12)
})

test('当日记录全部删除，移除旧红点和旧合规颜色（即使日历接口有缓存）', () => {
  const stale = {...cell,isPresent:true,complianceStatus:'PARTIAL',stayMinutes:60}
  const result = reconcileCalendarDays([stale], [], [], today)[0]
  assert.equal(result.isPresent,false)
  assert.equal(result.complianceStatus,'NO_STAY')
  assert.equal(result.stayMinutes,0)
})

test('不展示已经软删除的记录；同一天的剩余记录仍正常显示', () => {
  const result = reconcileCalendarDays([cell], [{...stay(1),deleted_at:'2026-10-16T00:00:00Z'},stay(2)], [compliance], today)[0]
  assert.equal(result.isPresent,true)
  assert.equal(reconcileCalendarDays([cell],[{...stay(1),deleted_at:'2026-10-16T00:00:00Z'}],[],today)[0].isPresent,false)
})

test('极短的签到即使没有累计有效时长，也应保留日历红点', () => {
  const result = reconcileCalendarDays([cell],[stay(1)],[{date,hasStay:false,status:'NO_STAY',stayMinutes:0,reasonCode:'NO_STAY'}],today)[0]
  assert.equal(result.isPresent,true)
  assert.equal(result.complianceStatus,'NO_STAY')
})

test('跨日记录对日期范围内每天都显示，未来日期不显示', () => {
  const dates=['2026-10-14','2026-10-15','2026-10-16','2026-10-17']
  const days=dates.map(d=>({...cell,date:d}))
  const result=reconcileCalendarDays(days,[{...stay(1),start_date:'2026-10-14',end_date:'2026-10-17'}],[],today)
  assert.deepEqual(result.map(d=>d.isPresent),[true,true,true,false])
})

test('保留学年外的日期显示与原有标识，不从当前学年的记录列表覆盖', () => {
  const outside = {...cell,inAcademicYear:false,isPresent:true}
  assert.equal(reconcileCalendarDays([outside],[],[],today)[0],outside)
})
