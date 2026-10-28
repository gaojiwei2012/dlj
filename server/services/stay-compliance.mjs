import { beijingDate } from '../date-utils.mjs'
import { computeDailyCompliance, MIN_COMPLIANT_MINUTES } from './daily-compliance.mjs'
import { loadYearRuleSources } from './year-rule-data.mjs'

/** DB adapter, kept separate from the reusable pure R001 calculator. */
export function getUserCompliance(database, userId, academicYear, asOf = new Date(), ruleSources = null) {
  const today = beijingDate(asOf)
  const from = academicYear.start_date
  const to = academicYear.end_date < today ? academicYear.end_date : today
  const empty = { compliantDays: 0, compliantMinutes: 0, partialDays: 0, partialMinutes: 0,
    nonCompliantDays: 0, nonCompliantMinutes: 0, timeUnknownDays: 0, inProgressDays: 0,
    actualStayDays: 0, thresholdMinutes: MIN_COMPLIANT_MINUTES, dailyResults: [] }
  if (from > to) return { ...empty, academicYear, asOf: new Date(asOf).toISOString() }
  const records = database.prepare(`SELECT * FROM stay_records WHERE user_id=? AND deleted_at IS NULL
    AND status IN ('OPEN','CLOSED') AND start_date<=? AND COALESCE(end_date,?)>=?`).all(userId, to, today, from)
  const { dateRules, legacyInvalidRanges, courseDates } = ruleSources ?? loadYearRuleSources(database, academicYear, from, to)
  return { ...computeDailyCompliance({ records, dateRules, legacyInvalidRanges, courseDates, from, to, asOf }),
    academicYear, asOf: new Date(asOf).toISOString() }
}
