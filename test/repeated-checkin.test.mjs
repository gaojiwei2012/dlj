import test from 'node:test'
import assert from 'node:assert/strict'
import { computeDailyCompliance } from '../server/services/daily-compliance.mjs'

const closed = (start, end) => ({ status: 'CLOSED', start_date: '2026-10-26', end_date: '2026-10-26', check_in_at: start, check_out_at: end })
const open = { status: 'OPEN', start_date: '2026-10-26', end_date: null, check_in_at: '2026-10-26T10:59:00+08:00', check_out_at: null }
const result = records => computeDailyCompliance({ records, from: '2026-10-26', to: '2026-10-26', asOf: '2026-10-26T11:00:00+08:00' })

test('再次签到不使当天已完成的完全符合逗留回退', () => {
  const prior = closed('2026-10-26T04:00:00+08:00', '2026-10-26T09:00:00+08:00')
  const before = result([prior])
  const during = result([prior, open])
  const after = result([prior, closed('2026-10-26T10:59:00+08:00', '2026-10-26T11:00:00+08:00')])
  assert.deepEqual([before.compliantDays, during.compliantDays, after.compliantDays], [1, 1, 1])
  assert.equal(during.actualStayDays, 1)
  assert.equal(during.dailyResults[0].inProgress, true)
})

test('未完成的第二次签到不提前把部分符合升为完全符合', () => {
  const prior = closed('2026-10-26T08:00:00+08:00', '2026-10-26T09:00:00+08:00')
  const during = result([prior, open])
  assert.equal(during.partialDays, 1)
  assert.equal(during.compliantDays, 0)
})

test('仅有未签退记录仍显示进行中', () => {
  assert.equal(result([open]).dailyResults[0].status, 'IN_PROGRESS')
})
