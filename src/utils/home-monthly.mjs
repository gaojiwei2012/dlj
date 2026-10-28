/**
 * Student homepage only: summarize the Beijing-calendar current month within
 * the selected academic year's existing R001/R002 daily results.
 *
 * Planned travel counts the distinct dates covered by active plans, regardless
 * of predicted compliance. Actual stay counts only finalized COMPLIANT and
 * PARTIAL days; excluded, unknown-duration and ongoing days do not count.
 */
export function calculateHomeMonthly(compliance = {}, prediction = {}, asOf = null) {
  const reference = asOf ?? compliance?.asOf ?? prediction?.asOf ?? new Date()
  const parsedDate = new Date(reference)
  const instant = Number.isFinite(parsedDate.getTime()) ? parsedDate : new Date()
  // Asia/Shanghai has a fixed UTC+08:00 offset; avoid client timezone drift.
  const month = new Date(instant.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7)
  const inCurrentMonth = date => typeof date === 'string' && date.startsWith(month + '-')

  const plannedDates = new Set()
  for (const day of prediction?.dailyResults ?? []) {
    if (day.isPlanned && inCurrentMonth(day.date)) plannedDates.add(day.date)
  }

  // One R001 verdict per date. The Map also prevents duplicate records from
  // inflating totals if a caller supplies redundant day entries.
  const actualStatuses = new Map()
  for (const day of compliance?.dailyResults ?? []) {
    if (!inCurrentMonth(day.date)) continue
    if (day.status === 'COMPLIANT') actualStatuses.set(day.date, 'COMPLIANT')
    else if (day.status === 'PARTIAL' && actualStatuses.get(day.date) !== 'COMPLIANT') {
      actualStatuses.set(day.date, 'PARTIAL')
    }
  }
  const compliantDays = [...actualStatuses.values()].filter(status => status === 'COMPLIANT').length
  const partialDays = actualStatuses.size - compliantDays
  return {
    month,
    monthLabel: `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`,
    plannedDays: plannedDates.size,
    compliantDays,
    partialDays,
    actualDays: compliantDays + partialDays
  }
}
