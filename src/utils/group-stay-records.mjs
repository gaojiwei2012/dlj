const DAY_MS = 86400000

function dates(from, to) {
  const result = []
  let cursor = Date.parse(from + 'T00:00:00Z')
  const end = Date.parse(to + 'T00:00:00Z')
  if (!Number.isFinite(cursor) || !Number.isFinite(end)) return result
  for (; cursor <= end; cursor += DAY_MS) result.push(new Date(cursor).toISOString().slice(0, 10))
  return result
}

function beijingTime(instant) {
  if (typeof instant !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(instant)) return null
  const ms = Date.parse(instant)
  if (!Number.isFinite(ms)) return null
  const local = new Date(ms + 8 * 3600000).toISOString()
  return { date: local.slice(0, 10), minutes: Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16)) }
}

function clock(minutes) {
  if (minutes == null) return null
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
}

// The rows are a read-only projection. Never collapse the source rows in storage:
// each check-in/check-out must remain independently editable and auditable.
export function groupStayRecords(records, dailyResults, { today, from, to } = {}) {
  const verdicts = new Map(dailyResults.map(day => [day.date, day]))
  const byDay = new Map()
  for (const record of records) {
    const endDate = record.end_date || today
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.start_date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) continue
    const start = beijingTime(record.check_in_at)
    const end = record.status === 'OPEN' ? null : beijingTime(record.check_out_at)
    const trusted = start?.date === record.start_date &&
      (record.status === 'OPEN' || end?.date === record.end_date)
    for (const date of dates(record.start_date, endDate)) {
      if (from && date < from || to && date > to || today && date > today) continue
      if (!byDay.has(date)) byDay.set(date, { date, ids: new Set(), records: [], first: null, last: null, open: false, timeUnknown: false })
      const day = byDay.get(date)
      day.ids.add(record.id)
      day.records.push(record)
      if (!trusted) { day.timeUnknown = true; continue }
      const first = date === record.start_date ? start.minutes : 0
      const last = record.status === 'OPEN' && date === today ? null : date === record.end_date ? end.minutes : 1440
      day.first = day.first === null ? first : Math.min(day.first, first)
      if (last !== null) day.last = day.last === null ? last : Math.max(day.last, last)
      if (record.status === 'OPEN' && date === today) day.open = true
    }
  }
  const groups = []
  for (const day of [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    const verdict = verdicts.get(day.date)
    const status = verdict?.status || 'OUTSIDE_YEAR'
    const previous = groups.at(-1)
    const continuous = previous && previous.endDate === new Date(Date.parse(day.date + 'T00:00:00Z') - DAY_MS).toISOString().slice(0, 10)
    const linked = continuous && [...day.ids].some(id => previous.lastDayIds.has(id))
    if (linked && previous.status === status) {
      previous.endDate = day.date
      previous.endTime = day.open ? null : clock(day.last)
      previous.open = day.open
      previous.timeUnknown ||= day.timeUnknown
      previous.days++
      previous.lastDayIds = day.ids
      for (const record of day.records) if (!previous.ids.has(record.id)) {
        previous.ids.add(record.id)
        previous.records.push(record)
      }
    } else {
      groups.push({ key: day.date, startDate: day.date, endDate: day.date, startTime: clock(day.first), endTime: day.open ? null : clock(day.last), open: day.open, timeUnknown: day.timeUnknown, days: 1, status, reasonCode: verdict?.reasonCode, ids: day.ids, lastDayIds: day.ids, records: [...day.records] })
    }
  }
  return groups.reverse().map(({ ids, lastDayIds, ...group }) => group)
}
