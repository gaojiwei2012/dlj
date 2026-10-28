import { beijingDate, eachDate } from '../date-utils.mjs'
import { makeDateRuleResolver } from './date-rules.mjs'
import { evaluateDay, MIN_COMPLIANT_MINUTES } from './daily-compliance.mjs'
import { getUserCompliance } from './stay-compliance.mjs'
import { loadYearRuleSources } from './year-rule-data.mjs'

const PLAN_STATUS = 'NO_PLAN'
const DEFAULT_ACTUAL_STATUS = 'NO_STAY'

/**
 * R002 pure planner: a plan's two endpoints count, and every covered day assumes
 * at least 240 minutes. Multiple plans are unioned per date before evaluation.
 * History is compared through yesterday. Today participates only after a completed
 * stay and only while there is no OPEN stay; future and unsettled today never miss.
 * A plan's *current* dates are the forecast baseline (no historical plan snapshots).
 */
export function computePlanPrediction({ plans = [], academicYear, dateRuleSources = {},
  actualDailyResults = [], asOf = new Date() }) {
  const today = beijingDate(asOf)
  const from = academicYear.start_date, to = academicYear.end_date
  const resolveRules = makeDateRuleResolver(dateRuleSources)
  const plannedDates = new Set()
  const perPlanDates = []
  for (const plan of plans) {
    if (plan.status === 'DELETED' || (plan.status && plan.status !== 'ACTIVE')) continue
    const start = plan.depart_date ?? plan.departDate
    const end = plan.return_date ?? plan.returnDate
    // Existing plans have validated endpoints; a corrupt legacy row must not poison all users.
    if (!start || !end || end < start || end < from || start > to) continue
    const dates = eachDate(start > from ? start : from, end < to ? end : to)
    perPlanDates.push({planId: plan.id, dates})
    for (const day of dates) plannedDates.add(day)
  }
  const forecastByDate = new Map([...plannedDates].sort().map(date => {
    const evaluation = evaluateDay({date, stayMinutes: MIN_COMPLIANT_MINUTES, hasStay: true, rules: resolveRules(date)})
    return [date, evaluation]
  }))
  // The compact plan overview uses date coverage, not compliance predictions.
  // All three counts are scoped to the selected academic year; the calendar
  // year and month windows are based on today's Beijing date.
  const thisYear = today.slice(0, 4)
  const thisMonth = today.slice(0, 7)
  const overview = {
    totalPlannedDays: plannedDates.size,
    yearPlannedDays: [...plannedDates].filter(date => date.startsWith(thisYear + '-')).length,
    monthPlannedDays: [...plannedDates].filter(date => date.startsWith(thisMonth + '-')).length
  }
  const forecast = {compliantDays: 0, partialDays: 0, nonCompliantDays: 0, totalPlannedDays: plannedDates.size}
  for (const day of forecastByDate.values()) {
    if (day.status === 'COMPLIANT') forecast.compliantDays++
    else if (day.status === 'PARTIAL') forecast.partialDays++
    else if (day.status === 'NON_COMPLIANT') forecast.nonCompliantDays++
  }
  const perPlanForecast = perPlanDates.map(({planId, dates}) => ({
    planId, totalDays: dates.length,
    compliantDays: dates.filter(date => forecastByDate.get(date).status === 'COMPLIANT').length,
    partialDays: dates.filter(date => forecastByDate.get(date).status === 'PARTIAL').length,
    nonCompliantDays: dates.filter(date => forecastByDate.get(date).status === 'NON_COMPLIANT').length
  }))
  const actualByDate = new Map(actualDailyResults.map(day => [day.date, day]))
  const dates = new Set(plannedDates)
  for (const day of actualDailyResults) if (day.hasStay) dates.add(day.date)
  const comparison = {
    plannedCompliantDaysToDate: 0, actualCompliantDaysToDate: 0,
    missedPlannedDays: 0, extraCompliantDays: 0, mismatchDays: 0,
    netDifferenceDays: 0, settledDays: 0
  }
  const dailyResults = [...dates].sort().map(date => {
    const planned = forecastByDate.get(date)
    const actual = actualByDate.get(date)
    const planStatus = planned?.status ?? PLAN_STATUS
    const actualStatus = actual?.status ?? DEFAULT_ACTUAL_STATUS
    const hasOpen = Boolean(actual?.inProgress)
    const hasCompletedToday = Boolean(actual?.hasStay && !hasOpen && actualStatus !== 'IN_PROGRESS')
    const settled = date < today || (date === today && hasCompletedToday)
    const settlement = date > today ? 'FUTURE' : hasOpen && date === today ? 'IN_PROGRESS'
      : settled ? 'SETTLED' : 'TODAY_PENDING'
    const mismatch = settled && planStatus !== actualStatus
    const difference = !settled ? 'NOT_SETTLED'
      : planStatus === 'COMPLIANT' && actualStatus !== 'COMPLIANT' ? 'MISSED'
      : planStatus !== 'COMPLIANT' && actualStatus === 'COMPLIANT' ? 'EXTRA'
      : mismatch ? 'STATUS_MISMATCH' : 'MATCH'
    if (settled) {
      comparison.settledDays++
      if (planStatus === 'COMPLIANT') comparison.plannedCompliantDaysToDate++
      if (actualStatus === 'COMPLIANT') comparison.actualCompliantDaysToDate++
      if (difference === 'MISSED') comparison.missedPlannedDays++
      if (difference === 'EXTRA') comparison.extraCompliantDays++
      if (mismatch) comparison.mismatchDays++
    }
    return {
      date, isPlanned: Boolean(planned), planStatus, plannedReasonCode: planned?.reasonCode ?? null,
      actualStatus, actualReasonCode: actual?.reasonCode ?? null,
      stayMinutes: actual?.stayMinutes ?? 0, hasUnknownDuration: actual?.hasUnknownDuration ?? false,
      settlement, settled, mismatch, difference,
      matchedRules: planned?.matchedRules ?? actual?.matchedRules ?? []
    }
  })
  comparison.netDifferenceDays = comparison.actualCompliantDaysToDate - comparison.plannedCompliantDaysToDate
  return {
    academicYear, asOf: new Date(asOf).toISOString(), assumptionMinutesPerPlannedDay: MIN_COMPLIANT_MINUTES,
    basis: 'CURRENT_ACTIVE_PLANS', overview, forecast, perPlanForecast, comparison, dailyResults
  }
}

/** DB adapter. Reuse exactly R001's actual day verdict and its date-rule sources. */
export function getUserPlanPrediction(database, userId, academicYear, { asOf = new Date(), compliance = null, ruleSources = null } = {}) {
  const plans = database.prepare(`SELECT id,depart_date,return_date,status FROM travel_plans
    WHERE user_id=? AND status='ACTIVE' AND depart_date<=? AND return_date>=? ORDER BY depart_date,id`)
    .all(userId, academicYear.end_date, academicYear.start_date)
  const dateRuleSources = ruleSources ?? loadYearRuleSources(database, academicYear)
  const actual = compliance ?? getUserCompliance(database, userId, academicYear, asOf, dateRuleSources)
  return computePlanPrediction({
    plans, academicYear, dateRuleSources,
    actualDailyResults: actual.dailyResults, asOf
  })
}
