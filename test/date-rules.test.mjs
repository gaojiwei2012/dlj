import test from 'node:test'
import assert from 'node:assert/strict'
import { isWeekend, resolveDateRules, makeDateRuleResolver } from '../server/services/date-rules.mjs'

test('公历星期与普通工作日无需有课即可具备日期资格', () => {
  assert.equal(isWeekend('2026-09-23'), false)
  assert.equal(isWeekend('2026-09-26'), true)
  assert.equal(isWeekend('2026-09-27'), true)
  const day = resolveDateRules('2026-09-23')
  assert.equal(day.isEligibleDate, true)
  assert.equal(day.isCourseDay, false)
  assert.throws(() => isWeekend('2026-02-31'), RangeError)
})

test('周末只由集中课程决定资格，历史有效周末不再生效', () => {
  assert.equal(resolveDateRules('2026-09-26').isEligibleDate, false)
  assert.equal(resolveDateRules('2026-09-26', { ruleTypes: ['VALID_WEEKEND'] }).isEligibleDate, false)
  assert.equal(resolveDateRules('2026-09-27', { isCourseDay: true }).isEligibleDate, true)
})

test('公共假期与无效逗留日优先于集中课程，不影响课程属性', () => {
  const day = resolveDateRules('2026-09-26', {
    ruleTypes: ['WEEKEND', 'PUBLIC_HOLIDAY', 'VALID_WEEKEND'], isCourseDay: true
  })
  assert.equal(day.isEligibleDate, false)
  assert.equal(day.isPublicHoliday, true)
  assert.equal(day.isValidWeekend, undefined)
  assert.equal(day.isCourseDay, true)
  assert.equal(resolveDateRules('2026-09-23', { legacyInvalid: true }).isEligibleDate, false)
})

test('旧无效日期与新规则并存，停用规则不参与判定', () => {
  const resolve = makeDateRuleResolver({
    dateRules: [
      {rule_date: '2026-09-26', type: 'VALID_WEEKEND', status: 'ACTIVE', reason: '补课'},
      {rule_date: '2026-09-26', type: 'PUBLIC_HOLIDAY', status: 'INACTIVE'}
    ],
    courseDates: [{course_date: '2026-09-27'}],
    legacyInvalidRanges: [{start_date: '2026-09-26', end_date: '2026-09-26', status: 'ACTIVE', reason: '旧无效日'}]
  })
  assert.equal(resolve('2026-09-26').isManualInvalid, true)
  assert.equal(resolve('2026-09-26').isPublicHoliday, false)
  assert.equal(resolve('2026-09-26').isEligibleDate, false)
  assert.ok(resolve('2026-09-26').ruleDetails.some(r => r.source === 'LEGACY' && r.reason === '旧无效日'))
  assert.ok(!resolve('2026-09-26').ruleDetails.some(r => r.reason === '补课'))
  assert.equal(resolve('2026-09-27').isEligibleDate, true)
})

test('澳门公共假期区间逐日生效且不被计为无效逗留', () => {
  const resolve = makeDateRuleResolver({legacyInvalidRanges: [{start_date:'2026-10-26',end_date:'2026-10-28',type:'PUBLIC_HOLIDAY',status:'ACTIVE',reason:'测试假期'}]})
  for (const date of ['2026-10-26','2026-10-27','2026-10-28']) {
    const day = resolve(date)
    assert.equal(day.isPublicHoliday, true)
    assert.equal(day.isManualInvalid, false)
    assert.equal(day.isEligibleDate, false)
  }
  assert.equal(resolve('2026-10-29').isPublicHoliday, false)
})
