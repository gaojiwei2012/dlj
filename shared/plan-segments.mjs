/** Group an inclusive travel range into consecutive course / self-arranged blocks.
 * Classification follows active, published course dates, not the legacy plan_type label.
 * Pure function: callers provide authoritative course dates from their own source.
 */
const moveDay = (date, increment) => {
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + increment)
  return result.toISOString().slice(0, 10)
}

export function splitPlanByCourseDates(startDate, endDate, courseDates = []) {
  if (!startDate || !endDate || startDate > endDate) return []
  const matches = [...new Set(courseDates.map(item => typeof item === 'string' ? item : item.course_date))]
    .filter(date => date >= startDate && date <= endDate).sort()
  const segments = []
  let cursor = startDate
  const append = (type, from, to) => {
    const previous = segments.at(-1)
    if (previous && previous.type === type && moveDay(previous.endDate, 1) === from) previous.endDate = to
    else segments.push({type, startDate:from, endDate:to})
  }
  for (const courseDate of matches) {
    if (cursor < courseDate) append('SELF', cursor, moveDay(courseDate, -1))
    append('COURSE', courseDate, courseDate)
    cursor = moveDay(courseDate, 1)
  }
  if (cursor <= endDate) append('SELF', cursor, endDate)
  return segments
}
