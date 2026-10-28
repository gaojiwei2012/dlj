import { eachDate, validDate } from '../date-utils.mjs'
import { loadYearRuleSources } from './year-rule-data.mjs'
import { makeDateRuleResolver } from './date-rules.mjs'

const DAY_MS = 86_400_000
export const MAX_PLAN_CHECK_DAYS = 732

/** Read-only date assessment shared with the actual/forecast compliance rule engine.
 * This is the plan's assumed >=4-hour forecast, NOT a guarantee of official recognition.
 */
export function getPlanDateCheck(database, academicYear, startDate, endDate) {
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate ||
      (Date.parse(endDate+'T00:00:00Z') - Date.parse(startDate+'T00:00:00Z')) / DAY_MS >= MAX_PLAN_CHECK_DAYS) {
    const error = new Error(`请选择正确的日期范围（最多 ${MAX_PLAN_CHECK_DAYS} 天）`)
    error.status = 400
    throw error
  }
  const sources = loadYearRuleSources(database, academicYear, startDate, endDate)
  const resolve = makeDateRuleResolver(sources)
  const days = eachDate(startDate, endDate).map(date => {
    const rule = resolve(date)
    const inAcademicYear = date >= academicYear.start_date && date <= academicYear.end_date
    const kind = !inAcademicYear ? 'OUTSIDE_YEAR' : rule.isPublicHoliday ? 'PUBLIC_HOLIDAY'
      : rule.isManualInvalid ? 'MANUAL_INVALID'
      : rule.isWeekend && !rule.isCourseDay ? 'ORDINARY_WEEKEND'
      : rule.isCourseDay ? 'COURSE_DAY'
      : 'REGULAR'
    const reasons = rule.ruleDetails.filter(detail =>
      kind === 'PUBLIC_HOLIDAY' && detail.type === 'PUBLIC_HOLIDAY' ||
      kind === 'MANUAL_INVALID' && detail.type === 'MANUAL_INVALID')
    return {
      date, kind, inAcademicYear,
      isWeekend:rule.isWeekend, isCourseDay:rule.isCourseDay,
      isPublicHoliday:rule.isPublicHoliday, isManualInvalid:rule.isManualInvalid,
      reason:reasons.map(detail=>detail.reason).filter(Boolean).join('；') || null
    }
  })
  const flagged = days.filter(day => ['PUBLIC_HOLIDAY','MANUAL_INVALID','ORDINARY_WEEKEND','OUTSIDE_YEAR'].includes(day.kind))
  const count = kind => days.filter(day => day.kind === kind).length
  return {
    startDate, endDate, academicYear:{id:academicYear.id,name:academicYear.name},
    days, flagged,
    summary:{totalDays:days.length,eligibleDays:days.length-flagged.length,
      publicHolidayDays:count('PUBLIC_HOLIDAY'),manualInvalidDays:count('MANUAL_INVALID'),
      ordinaryWeekendDays:count('ORDINARY_WEEKEND'),outsideYearDays:count('OUTSIDE_YEAR'),
      courseDays:count('COURSE_DAY')}
  }
}
