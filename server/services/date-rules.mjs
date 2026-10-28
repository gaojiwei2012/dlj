import { validDate } from '../date-utils.mjs'

/** R001: one calendar date may have multiple simultaneous attributes. */
export const DATE_RULE_TYPES = Object.freeze({
  PUBLIC_HOLIDAY: 'PUBLIC_HOLIDAY',
  MANUAL_INVALID: 'MANUAL_INVALID',
  WEEKEND: 'WEEKEND',
  VALID_WEEKEND: 'VALID_WEEKEND' // 历史枚举保留供旧数据库读取，但不再赋予周末有效资格
})
const KNOWN_TYPES = new Set(Object.values(DATE_RULE_TYPES))

export function isWeekend(date) {
  if (!validDate(date)) throw new RangeError('日期必须为 YYYY-MM-DD')
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return weekday === 0 || weekday === 6
}

/** Resolve types, including old invalid ranges, without mutating or reclassifying V1 rows. */
export function resolveDateRules(date, { ruleTypes = [], isCourseDay = false, legacyInvalid = false, ruleDetails = [] } = {}) {
  if (!validDate(date)) throw new RangeError('日期必须为 YYYY-MM-DD')
  for (const type of ruleTypes) if (!KNOWN_TYPES.has(type)) throw new RangeError(`未知日期规则 ${type}`)
  const types = new Set(ruleTypes.filter(type => type !== DATE_RULE_TYPES.VALID_WEEKEND))
  const weekend = isWeekend(date)
  const isPublicHoliday = types.has(DATE_RULE_TYPES.PUBLIC_HOLIDAY)
  const isManualInvalid = types.has(DATE_RULE_TYPES.MANUAL_INVALID) || Boolean(legacyInvalid)
  const effectiveCourseDay = Boolean(isCourseDay)
  return {
    date,
    isWeekend: weekend,
    isWeekday: !weekend,
    isPublicHoliday,
    isManualInvalid,
    isCourseDay: effectiveCourseDay,
    isEligibleDate: !isPublicHoliday && !isManualInvalid &&
      (!weekend || effectiveCourseDay),
    ruleDetails: [
      ...ruleDetails.filter(detail => detail.type !== DATE_RULE_TYPES.VALID_WEEKEND),
      ...(weekend && !ruleDetails.some(r => r.type === DATE_RULE_TYPES.WEEKEND)
        ? [{type: DATE_RULE_TYPES.WEEKEND, source: 'CALENDAR', reason: '公历周末'}] : []),
      ...(effectiveCourseDay ? [{type: 'COURSE_DAY', source: 'COURSE', reason: '已安排课程'}] : [])
    ],
    matchedRules: [
      ...types,
      ...(weekend && !types.has(DATE_RULE_TYPES.WEEKEND) ? [DATE_RULE_TYPES.WEEKEND] : []),
      ...(legacyInvalid && !types.has(DATE_RULE_TYPES.MANUAL_INVALID) ? [DATE_RULE_TYPES.MANUAL_INVALID] : []),
      ...(effectiveCourseDay ? ['COURSE_DAY'] : [])
    ]
  }
}

/** Build a reusable per-date resolver from DB rows (or in-memory testing fixtures). */
export function makeDateRuleResolver({ dateRules = [], courseDates = [], legacyInvalidRanges = [] } = {}) {
  const byDate = new Map()
  for (const row of dateRules) {
    // 已有的“有效周末”记录不删除，但在新的规则引擎中彻底忽略。
    if (row.type === DATE_RULE_TYPES.VALID_WEEKEND || (row.status && row.status !== 'ACTIVE')) continue
    const date = row.rule_date ?? row.date
    if (!validDate(date)) throw new RangeError('日期规则包含不正确的日期')
    if (!byDate.has(date)) byDate.set(date, {types: new Set(), details: []})
    byDate.get(date).types.add(row.type)
    byDate.get(date).details.push({type: row.type, source: row.source ?? 'MANUAL', reason: row.reason ?? ''})
  }
  const courseSet = new Set(courseDates.map(row => typeof row === 'string' ? row : row.course_date))
  const invalidRanges = legacyInvalidRanges.filter(row => !row.status || row.status === 'ACTIVE')
  return date => {
    const matchedInvalids = invalidRanges.filter(range => range.start_date <= date && date <= range.end_date)
    return resolveDateRules(date, {
      ruleTypes: [...(byDate.get(date)?.types ?? []), ...matchedInvalids.map(range => range.type || DATE_RULE_TYPES.MANUAL_INVALID)],
      ruleDetails: [
        ...(byDate.get(date)?.details ?? []),
        ...matchedInvalids.map(range => ({type: range.type || DATE_RULE_TYPES.MANUAL_INVALID, source: 'LEGACY', reason: range.reason ?? ''}))
      ],
      isCourseDay: courseSet.has(date),
      legacyInvalid: matchedInvalids.some(range => !range.type || range.type === DATE_RULE_TYPES.MANUAL_INVALID)
    })
  }
}
