import test from 'node:test'
import assert from 'node:assert/strict'
import { computeDailyCompliance, evaluateDay, aggregateStayDurations } from '../server/services/daily-compliance.mjs'
import { resolveDateRules } from '../server/services/date-rules.mjs'

const closed = (start, end, overrides = {}) => ({
  source: 'CHECK_IN', status: 'CLOSED', start_date: start.slice(0, 10),
  end_date: end.slice(0, 10), check_in_at: start, check_out_at: end,
  ...overrides
})
const run = (records, from, to = from, extras = {}) => computeDailyCompliance({
  records, from, to, asOf: '2026-09-29T00:00:00+08:00', ...extras
})
const day = (date, minutes, options = {}) => evaluateDay({
  date, stayMinutes: minutes, hasStay: true,
  rules: resolveDateRules(date, options)
})

test('四小时边界：240 完全符合，239 部分符合；工作日无课亦可完全符合', () => {
  assert.equal(day('2026-09-23', 240).status, 'COMPLIANT')
  assert.equal(day('2026-09-23', 239).status, 'PARTIAL')
  assert.equal(day('2026-09-23', 239).reasonCode, 'UNDER_4_HOURS')
  assert.equal(day('2026-09-23', 240).reasonCode, 'WEEKDAY_OVER_4H')
})

test('普通周末满十小时仍部分符合；历史有效周末无效、课程周末满四小时完全符合', () => {
  assert.equal(day('2026-09-26', 600).status, 'PARTIAL')
  assert.equal(day('2026-09-26', 240, {ruleTypes: ['VALID_WEEKEND']}).status, 'PARTIAL')
  assert.equal(day('2026-09-27', 240, {isCourseDay: true}).status, 'COMPLIANT')
  assert.equal(day('2026-09-27', 120, {isCourseDay: true}).status, 'PARTIAL')
})

test('公共假期/强制无效无条件不符合，覆盖课程和有效周末', () => {
  assert.deepEqual(
    [day('2026-09-26', 480, {ruleTypes: ['PUBLIC_HOLIDAY', 'VALID_WEEKEND'], isCourseDay: true}).status,
      day('2026-09-27', 480, {ruleTypes: ['MANUAL_INVALID'], isCourseDay: true}).status],
    ['NON_COMPLIANT', 'NON_COMPLIANT']
  )
})

test('跨北京时间午夜必须独立统计各自然日', () => {
  const result = run([closed('2026-09-24T21:00:00+08:00', '2026-09-25T06:30:00+08:00')], '2026-09-24', '2026-09-25')
  assert.deepEqual(result.dailyResults.map(d => [d.stayMinutes, d.status]), [[180, 'PARTIAL'], [390, 'COMPLIANT']])
  assert.equal(result.compliantDays, 1)
  assert.equal(result.partialDays, 1)
})

test('同日重复时间区间按并集：09–12 + 11–15 = 360 分钟', () => {
  const result = run([
    closed('2026-09-23T09:00:00+08:00', '2026-09-23T12:00:00+08:00'),
    closed('2026-09-23T11:00:00+08:00', '2026-09-23T15:00:00+08:00'),
    closed('2026-09-23T11:30:00+08:00', '2026-09-23T12:00:00+08:00')
  ], '2026-09-23')
  assert.equal(result.compliantMinutes, 360)
  assert.equal(result.compliantDays, 1)
  assert.equal(result.actualStayDays, 1)
})

test('精确时长采用毫秒阈值，239分59秒不能凑成240分钟', () => {
  const result = run([closed('2026-09-23T09:00:00+08:00', '2026-09-23T12:59:59+08:00')], '2026-09-23')
  assert.equal(result.dailyResults[0].status, 'PARTIAL')
})

test('只有日期的旧手工记录标记时间未知，不能默认算作满足四小时', () => {
  const result = run([{source: 'MANUAL', status: 'CLOSED', start_date: '2026-09-23', end_date: '2026-09-23'}], '2026-09-23')
  assert.equal(result.timeUnknownDays, 1)
  assert.equal(result.actualStayDays, 1)
  assert.equal(result.compliantDays, 0)
  assert.equal(result.dailyResults[0].reasonCode, 'HISTORICAL_TIME_MISSING')
})

test('缺失签退时刻的补签退记录与日期被改动但时间未改的记录，均不能推定时长', () => {
  const backfilled = closed('2026-09-23T09:00:00+08:00', '2026-09-23T17:00:00+08:00', {check_out_at: null})
  const edited = closed('2026-09-24T09:00:00+08:00', '2026-09-24T17:00:00+08:00', {start_date: '2026-09-23'})
  assert.equal(run([backfilled], '2026-09-23').timeUnknownDays, 1)
  assert.equal(run([edited], '2026-09-23', '2026-09-24').timeUnknownDays, 2)
})

test('已知时段已满四小时，即使同日还有未知时长记录仍可保守认定达到门槛', () => {
  const result = run([
    closed('2026-09-23T09:00:00+08:00', '2026-09-23T13:00:00+08:00'),
    {source: 'MANUAL', status: 'CLOSED', start_date: '2026-09-23', end_date: '2026-09-23'}
  ], '2026-09-23')
  assert.equal(result.compliantDays, 1)
  assert.equal(result.dailyResults[0].hasUnknownDuration, true)
})

test('空白日期为 NO_STAY；无逗留的节假日不能算不符合天数', () => {
  const result = run([], '2026-09-23', '2026-09-24', {
    dateRules: [{rule_date: '2026-09-23', type: 'PUBLIC_HOLIDAY'}]
  })
  assert.deepEqual(result.dailyResults.map(d => d.status), ['NO_STAY', 'NO_STAY'])
  assert.equal(result.nonCompliantDays, 0)
  assert.equal(result.actualStayDays, 0)
})

test('进行中的签到：已过的日子结算，当日只是临时判定', () => {
  const record = {source: 'CHECK_IN', status: 'OPEN', start_date: '2026-09-24',
    check_in_at: '2026-09-24T21:00:00+08:00', check_out_at: null, end_date: null}
  const result = computeDailyCompliance({records: [record], from: '2026-09-24', to: '2026-09-25',
    asOf: '2026-09-25T05:00:00+08:00'})
  assert.deepEqual(result.dailyResults.map(d => [d.stayMinutes, d.status]),
    [[180, 'PARTIAL'], [300, 'IN_PROGRESS']])
  assert.equal(result.dailyResults[1].provisionalStatus, 'COMPLIANT')
  assert.equal(result.inProgressDays, 1)
  assert.equal(result.compliantDays, 0)
})

test('进行中刚签到仍显示 IN_PROGRESS，不凭 0 分钟伪造 NO_STAY 或 PARTIAL', () => {
  const result = run([{
    status: 'OPEN', start_date: '2026-09-23', check_in_at: '2026-09-23T09:00:00+08:00'
  }], '2026-09-23', '2026-09-23', {asOf: '2026-09-23T09:00:00+08:00'})
  assert.equal(result.dailyResults[0].status, 'IN_PROGRESS')
  assert.equal(result.dailyResults[0].stayMinutes, 0)
})

test('软删除、未来日期不会增加实际天数', () => {
  const result = run([
    closed('2026-09-23T09:00:00+08:00', '2026-09-23T17:00:00+08:00', {deleted_at: '2026-09-26'}),
    closed('2026-09-30T09:00:00+08:00', '2026-09-30T17:00:00+08:00')
  ], '2026-09-23', '2026-09-30')
  assert.equal(result.actualStayDays, 0)
  assert.equal(result.compliantDays, 0)
})

test('已知时间必须有时区，不能把本地无时区字符串当可信凭证', () => {
  const aggregated = aggregateStayDurations([{source: 'CHECK_IN', status: 'CLOSED',
    start_date: '2026-09-23', end_date: '2026-09-23',
    check_in_at: '2026-09-23T09:00:00', check_out_at: '2026-09-23T14:00:00'
  }], {from: '2026-09-23', to: '2026-09-23', asOf: '2026-09-29T00:00:00+08:00'})
  assert.equal(aggregated.unknownDates.has('2026-09-23'), true)
})
