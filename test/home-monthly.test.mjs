import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateHomeMonthly } from '../src/utils/home-monthly.mjs'

const asOf = '2026-10-12T08:00:00.000Z'

test('首页本月：计划跨月裁剪并去重；实际完全+部分才算逗留', () => {
  const prediction = {dailyResults: [
    {date: '2026-09-30', isPlanned: true},
    {date: '2026-10-01', isPlanned: true},
    {date: '2026-10-02', isPlanned: true},
    {date: '2026-10-02', isPlanned: true},
    {date: '2026-10-30', isPlanned: true},
    {date: '2026-11-01', isPlanned: true},
    {date: '2026-10-03', isPlanned: false}
  ]}
  const compliance = {dailyResults: [
    {date: '2026-09-30', status: 'COMPLIANT'},
    {date: '2026-10-01', status: 'COMPLIANT'},
    {date: '2026-10-02', status: 'PARTIAL'},
    {date: '2026-10-03', status: 'COMPLIANT'}, // actual stay without a plan
    {date: '2026-10-03', status: 'COMPLIANT'}, // duplicate must not inflate
    {date: '2026-10-04', status: 'NON_COMPLIANT'},
    {date: '2026-10-05', status: 'TIME_UNKNOWN'},
    {date: '2026-10-06', status: 'IN_PROGRESS'},
    {date: '2026-10-07', status: 'NO_STAY'}
  ]}
  assert.deepEqual(calculateHomeMonthly(compliance, prediction, asOf), {
    month: '2026-10', monthLabel: '2026年10月',
    plannedDays: 3, compliantDays: 2, partialDays: 1, actualDays: 3
  })
})

test('本月没有计划但有实际记录依然计数，空数据为零', () => {
  const compliance = {dailyResults: [{date:'2026-10-10',status:'PARTIAL'}]}
  assert.equal(calculateHomeMonthly(compliance, {dailyResults: []}, asOf).actualDays, 1)
  assert.equal(calculateHomeMonthly(compliance, {dailyResults: []}, asOf).plannedDays, 0)
  assert.equal(calculateHomeMonthly({}, {}, asOf).actualDays, 0)
  assert.equal(calculateHomeMonthly({}, {}, asOf).plannedDays, 0)
})

test('按中国日期确定月份，在UTC月末不错误跨月', () => {
  assert.equal(calculateHomeMonthly({}, {}, '2026-09-30T16:00:00.000Z').month, '2026-10')
  assert.equal(calculateHomeMonthly({}, {}, '2026-10-31T15:59:59.000Z').month, '2026-10')
  assert.equal(calculateHomeMonthly({}, {}, '2026-10-31T16:00:00.000Z').month, '2026-11')
})

test('所选学年与本月无交集时，数据均为0，不混入其他月份', () => {
  const compliance = {dailyResults:[{date:'2026-09-30',status:'COMPLIANT'}]}
  const prediction = {dailyResults:[{date:'2026-09-30',isPlanned:true}]}
  const summary = calculateHomeMonthly(compliance, prediction, asOf)
  assert.deepEqual([summary.plannedDays,summary.actualDays], [0,0])
})
