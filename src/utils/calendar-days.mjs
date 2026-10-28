/**
 * Keep the calendar's presence markers synchronized with the same stay list
 * displayed immediately below it. The stay list is already scoped to the
 * selected academic year, so outside-year calendar cells keep their original
 * server-provided indicators.
 *
 * Compliance statuses come from the dashboard's daily compliance calculation;
 * this function never computes or invents qualifying hours.
 */
export function reconcileCalendarDays(days = [], records = [], dailyResults = [], today) {
  if (!Array.isArray(days)) return []
  const visibleRecords = Array.isArray(records) ? records.filter(record =>
    record && !record.deleted_at && ['OPEN', 'CLOSED'].includes(record.status) &&
    typeof record.start_date === 'string'
  ) : []
  const dailyByDate = new Map((Array.isArray(dailyResults) ? dailyResults : [])
    .filter(day => day && typeof day.date === 'string')
    .map(day => [day.date, day]))

  return days.map(day => {
    if (!day.inAcademicYear) return day
    const present = visibleRecords.some(record => {
      const end = record.status === 'OPEN' ? today : (record.end_date ?? today)
      return typeof end === 'string' &&
        record.start_date <= day.date && day.date <= end && day.date <= today
    })
    const compliance = dailyByDate.get(day.date)
    // Keep an entry marker even for a finished zero-second record. Such a
    // record does not prove a positive duration or an eligible stay day.
    if (!present) return {
      ...day, isPresent: false, complianceStatus: 'NO_STAY',
      stayMinutes: 0, reasonCode: 'NO_STAY', provisionalStatus: null
    }
    return {
      ...day,
      isPresent: true,
      complianceStatus: compliance?.status ?? day.complianceStatus,
      stayMinutes: compliance?.stayMinutes ?? day.stayMinutes,
      reasonCode: compliance?.reasonCode ?? day.reasonCode,
      provisionalStatus: compliance?.provisionalStatus ?? day.provisionalStatus
    }
  })
}
