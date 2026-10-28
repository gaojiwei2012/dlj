import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computePlanPrediction } from '../server/services/plan-prediction.mjs'

const year = { start_date: '2026-09-01', end_date: '2027-08-31' }

function getForecast(plans, asOf = '2026-10-15T02:00:00.000Z') {
  return computePlanPrediction({
    plans, academicYear: year, dateRuleSources: {}, actualDailyResults: [],
    asOf: new Date(asOf)
  }).overview
}

test('R002 compact overview: counts unique covered days in academic year, calendar year and month', () => {
  const forecast = getForecast([
    {id: 1, status: 'ACTIVE', depart_date: '2026-09-29', return_date: '2026-10-03'},
    {id: 2, status: 'ACTIVE', depart_date: '2026-10-01', return_date: '2026-10-05'},
    {id: 3, status: 'ACTIVE', depart_date: '2027-01-01', return_date: '2027-01-02'},
    {id: 4, status: 'DELETED', depart_date: '2026-10-08', return_date: '2026-10-12'},
    {id: 5, status: 'ACTIVE', depart_date: '2026-08-28', return_date: '2026-09-01'},
    {id: 6, status: 'ACTIVE', depart_date: '2027-08-31', return_date: '2027-09-05'}
  ])
  assert.equal(forecast.totalPlannedDays, 11) // 9 unique days + both academic-year edge days
  assert.equal(forecast.yearPlannedDays, 8) // 2026 only
  assert.equal(forecast.monthPlannedDays, 5) // October only, including overlapped dates once
  assert.equal(forecast.totalPlannedDays, 11)
})

test('R002 compact overview: Beijing calendar year and month roll over at UTC+8 midnight', () => {
  const plans = [
    {id: 1, status: 'ACTIVE', depart_date: '2026-12-31', return_date: '2027-01-02'},
    {id: 2, status: 'ACTIVE', depart_date: '2027-02-01', return_date: '2027-02-01'}
  ]
  const december = getForecast(plans, '2026-12-31T15:30:00.000Z')
  assert.deepEqual([december.totalPlannedDays, december.yearPlannedDays, december.monthPlannedDays], [4, 1, 1])
  const january = getForecast(plans, '2026-12-31T16:30:00.000Z')
  assert.deepEqual([january.totalPlannedDays, january.yearPlannedDays, january.monthPlannedDays], [4, 3, 2])
})

test('R002 compact overview: only three counters are rendered; actual-versus-plan section is gone', () => {
  const vue = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  const section = vue.split('<section v-if="planPrediction" class="plan-summary">')[1]?.split('</section>')[0]
  assert.ok(section, 'plan overview section missing')
  for (const label of ['已计划', '本年计划', '本月计划']) assert.ok(section.includes('<span>' + label + '</span>'))
  assert.equal((section.match(/<div><span>/g) ?? []).length, 3)
  for (const old of ['去重计划天数', '截至当前可结算日期', '逐日计划 / 实际对照', '计划未兑现']) {
    assert.ok(!vue.includes(old), 'obsolete UI remains: ' + old)
  }
})
