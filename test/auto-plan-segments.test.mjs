import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {splitPlanByCourseDates} from '../shared/plan-segments.mjs'

const segments = (from,to,days) => splitPlanByCourseDates(from,to,days)
test('zero course days yields only one self-arranged range', () => {
  assert.deepEqual(segments('2026-10-08','2026-10-11',[]),[
    {type:'SELF',startDate:'2026-10-08',endDate:'2026-10-11'}
  ])
})
test('all course days merge into one course range', () => {
  assert.deepEqual(segments('2026-10-16','2026-10-19',['2026-10-16','2026-10-17','2026-10-18','2026-10-19']),[
    {type:'COURSE',startDate:'2026-10-16',endDate:'2026-10-19'}
  ])
})
test('mixed courses are grouped by consecutive calendar days (including weekend and year boundary)', () => {
  assert.deepEqual(segments('2026-12-30','2027-01-05',['2026-12-31','2027-01-01','2027-01-03','2027-01-03','2027-06-01']),[
    {type:'SELF',startDate:'2026-12-30',endDate:'2026-12-30'},
    {type:'COURSE',startDate:'2026-12-31',endDate:'2027-01-01'},
    {type:'SELF',startDate:'2027-01-02',endDate:'2027-01-02'},
    {type:'COURSE',startDate:'2027-01-03',endDate:'2027-01-03'},
    {type:'SELF',startDate:'2027-01-04',endDate:'2027-01-05'}
  ])
})
test('one day stays one segment and input course list stays unchanged', () => {
  const days=['2026-10-15']
  assert.deepEqual(segments('2026-10-15','2026-10-15',days),[{type:'COURSE',startDate:'2026-10-15',endDate:'2026-10-15'}])
  assert.deepEqual(days,['2026-10-15'])
})
test('plan editor has no manual plan type and marks course calendar dates like stay calendar', () => {
  const vue=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')
  assert.ok(!vue.includes('plan-type-options'))
  assert.ok(!vue.includes('planForm.planType'))
  assert.ok(vue.includes('p.segments'))
  assert.ok(vue.includes('planRangeSegments'))
  assert.match(vue,/rangeDayInfo\(date\)\?\.isCourseDay/)
  assert.match(vue,/class="course-mark" aria-hidden="true">课/)
  assert.match(css,/\.range-grid \.course-mark/)
})
