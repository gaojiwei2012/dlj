import { beijingDate, eachDate, validDate } from '../date-utils.mjs'
import { makeDateRuleResolver } from './date-rules.mjs'

export const MIN_COMPLIANT_MINUTES = 240
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

const parseInstant = value => {
  // Only absolute, timezone-qualified instants may be used to prove four hours.
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function dateStartMs(date) { return Date.parse(`${date}T00:00:00+08:00`) }

function mergedDuration(intervals) {
  let end = -Infinity
  let total = 0
  for (const [start, stop] of intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    total += Math.max(0, stop - Math.max(start, end))
    end = Math.max(end, stop)
  }
  return total
}

/**
 * Convert trustworthy absolute intervals into per-Beijing-calendar-day union durations.
 * Legacy date-only/manual/backfilled/edited inconsistent records are marked TIME_UNKNOWN,
 * not silently interpreted as full-day stays.
 */
export function aggregateStayDurations(records, { from, to, asOf = new Date() } = {}) {
  if (!validDate(from) || !validDate(to) || from > to) throw new RangeError('起止日期不正确')
  const now = new Date(asOf).getTime()
  if (!Number.isFinite(now)) throw new RangeError('截至时刻不正确')
  const intervals = new Map(), unknownDates = new Set(), openDates = new Set()
  const today = beijingDate(now)
  const last = to < today ? to : today
  const addUnknown = record => {
    const start = record.start_date, end = record.end_date ?? today
    if (!validDate(start) || !validDate(end) || start > end) return
    const clippedStart = start > from ? start : from
    const clippedEnd = end < last ? end : last
    if (clippedStart <= clippedEnd) for (const d of eachDate(clippedStart, clippedEnd)) unknownDates.add(d)
  }
  for (const record of records) {
    if (record.deleted_at || !['OPEN', 'CLOSED'].includes(record.status)) continue
    const start = parseInstant(record.check_in_at)
    const open = record.status === 'OPEN'
    const finish = open ? now : parseInstant(record.check_out_at)
    const consistent = start !== null && finish !== null && finish >= start &&
      record.start_date === beijingDate(start) &&
      (open || record.end_date === beijingDate(finish))
    if (!consistent) { addUnknown(record); continue }
    // A zero-length OPEN check-in is still visibly in progress, never a finished stay.
    if (open && now >= start && today >= from && today <= to) openDates.add(today)
    if (finish <= start || start > now) continue
    let cursor = Math.max(start, dateStartMs(from))
    const stop = Math.min(finish, dateStartMs(to) + DAY_MS, now)
    while (cursor < stop) {
      const day = beijingDate(cursor)
      const dayEnd = dateStartMs(day) + DAY_MS
      const segmentEnd = Math.min(stop, dayEnd)
      if (!intervals.has(day)) intervals.set(day, [])
      intervals.get(day).push([cursor, segmentEnd])
      cursor = segmentEnd
    }
  }
  const durationMsByDate = new Map([...intervals].map(([date, pieces]) => [date, mergedDuration(pieces)]))
  return { durationMsByDate, unknownDates, openDates }
}

function finalClassification({ hasStay, stayMs, hasUnknownDuration, rules }) {
  if (!hasStay) return { status: 'NO_STAY', reasonCode: 'NO_STAY' }
  if (rules.isPublicHoliday) return { status: 'NON_COMPLIANT', reasonCode: 'PUBLIC_HOLIDAY' }
  if (rules.isManualInvalid) return { status: 'NON_COMPLIANT', reasonCode: 'MANUAL_INVALID' }
  if (hasUnknownDuration && stayMs < MIN_COMPLIANT_MINUTES * MINUTE_MS) {
    return { status: 'TIME_UNKNOWN', reasonCode: 'HISTORICAL_TIME_MISSING' }
  }
  if (stayMs < MIN_COMPLIANT_MINUTES * MINUTE_MS) {
    return { status: 'PARTIAL', reasonCode: 'UNDER_4_HOURS' }
  }
  if (rules.isWeekday) return { status: 'COMPLIANT', reasonCode: 'WEEKDAY_OVER_4H' }
  if (rules.isCourseDay) return { status: 'COMPLIANT', reasonCode: 'COURSE_WEEKEND_OVER_4H' }
  return { status: 'PARTIAL', reasonCode: 'ORDINARY_WEEKEND' }
}

/** One shared R001 verdict for real stays now and R002 simulated plan days later. */
export function evaluateDay({ date, stayMinutes = 0, hasStay = stayMinutes > 0,
  hasUnknownDuration = false, inProgress = false, rules }) {
  if (!validDate(date)) throw new RangeError('日期必须为 YYYY-MM-DD')
  if (!Number.isFinite(stayMinutes) || stayMinutes < 0) throw new RangeError('停留分钟数不正确')
  if (!rules || rules.date !== date) throw new RangeError('必须提供该日期的规则判定')
  const final = finalClassification({ hasStay, stayMs: stayMinutes * MINUTE_MS, hasUnknownDuration, rules })
  const classification = inProgress && hasStay && final.status !== 'NON_COMPLIANT'
    ? { status: 'IN_PROGRESS', reasonCode: 'OPEN_STAY_IN_PROGRESS', provisionalStatus: final.status, provisionalReasonCode: final.reasonCode }
    : final
  return { date, stayMinutes, hasStay, hasUnknownDuration, inProgress, ...rules, ...classification }
}

/** Dates with no stay remain NO_STAY, not PARTIAL/NON_COMPLIANT. */
export function computeDailyCompliance({ records = [], dateRules = [], courseDates = [],
  legacyInvalidRanges = [], from, to, asOf = new Date() }) {
  const durations = aggregateStayDurations(records, { from, to, asOf })
  const completed = aggregateStayDurations(records.filter(record => record.status === 'CLOSED'), { from, to, asOf })
  const resolve = makeDateRuleResolver({ dateRules, courseDates, legacyInvalidRanges })
  const dailyResults = eachDate(from, to).map(date => {
    const ms = durations.durationMsByDate.get(date) ?? 0
    const hasUnknownDuration = durations.unknownDates.has(date)
    const inProgress = durations.openDates.has(date)
    const completedMs = completed.durationMsByDate.get(date) ?? 0
    const completedUnknown = completed.unknownDates.has(date)
    const hasCompletedStay = completedMs > 0 || completedUnknown
    // A new open check-in must not erase a verdict already earned earlier today.
    const result = evaluateDay({
      date, stayMinutes: (inProgress && hasCompletedStay ? completedMs : ms) / MINUTE_MS,
      hasStay: ms > 0 || hasUnknownDuration || inProgress,
      hasUnknownDuration: inProgress && hasCompletedStay ? completedUnknown : hasUnknownDuration,
      inProgress: inProgress && !hasCompletedStay, rules: resolve(date)
    })
    return inProgress && hasCompletedStay ? { ...result, inProgress: true } : result
  })
  const summary = {
    compliantDays: 0, compliantMinutes: 0,
    partialDays: 0, partialMinutes: 0,
    nonCompliantDays: 0, nonCompliantMinutes: 0,
    timeUnknownDays: 0, inProgressDays: 0,
    actualStayDays: 0
  }
  const categories = { COMPLIANT: 'compliant', PARTIAL: 'partial', NON_COMPLIANT: 'nonCompliant' }
  for (const day of dailyResults) {
    if (day.hasStay) summary.actualStayDays++
    const category = categories[day.status]
    if (category) {
      summary[category + 'Days']++
      summary[category + 'Minutes'] += day.stayMinutes
    } else if (day.status === 'TIME_UNKNOWN') summary.timeUnknownDays++
    else if (day.status === 'IN_PROGRESS') summary.inProgressDays++
  }
  for (const name of ['compliantMinutes', 'partialMinutes', 'nonCompliantMinutes']) summary[name] = Math.floor(summary[name])
  return { ...summary, thresholdMinutes: MIN_COMPLIANT_MINUTES, dailyResults }
}
