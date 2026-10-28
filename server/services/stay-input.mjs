import { validDate } from '../date-utils.mjs'

/** datetime-local fields are interpreted as Asia/Shanghai (UTC+08:00), not server locale. */
export function parseBeijingLocal(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
      !validDate(value.slice(0,10)) || Number(value.slice(11,13)) > 23 || Number(value.slice(14,16)) > 59) return null
  const date = new Date(`${value}:00+08:00`)
  if (!Number.isFinite(date.getTime())) return null
  return {iso:date.toISOString(), date:value.slice(0,10), milliseconds:date.getTime()}
}

export function parseManualStay(input, {asOf = new Date(), allowLegacy = true} = {}) {
  const startAt = input.startAt, endAt = input.endAt
  if (startAt != null || endAt != null) {
    const start = parseBeijingLocal(startAt), end = parseBeijingLocal(endAt)
    if (!start || !end) throw new RangeError('请填写正确的入澳和离澳日期及时间（北京时间）')
    if (end.milliseconds <= start.milliseconds) throw new RangeError('离澳时间必须晚于入澳时间')
    if (end.milliseconds > new Date(asOf).getTime()) throw new RangeError('不能补录未来的逗留时间')
    if ((input.startDate && input.startDate !== start.date) || (input.endDate && input.endDate !== end.date)) {
      throw new RangeError('日期与填写的北京时间不一致')
    }
    return {startDate:start.date, endDate:end.date, checkInAt:start.iso, checkOutAt:end.iso, timeUnknown:false}
  }
  if (!allowLegacy) throw new RangeError('请填写入澳和离澳的准确北京时间')
  const {startDate, endDate} = input
  const today = new Date(new Date(asOf).getTime() + 8 * 3_600_000).toISOString().slice(0,10)
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate || endDate > today) {
    throw new RangeError('日期范围不正确，不能补录未来日期')
  }
  return {startDate,endDate,checkInAt:null,checkOutAt:null,timeUnknown:true}
}

export function parseBackfillCheckout(input, openRecord, {asOf = new Date()} = {}) {
  const now = new Date(asOf).getTime()
  if (input.endAt != null) {
    const end = parseBeijingLocal(input.endAt)
    if (!end || end.milliseconds > now ||
      (input.endDate && input.endDate !== end.date) || end.date < openRecord.start_date ||
      (openRecord.check_in_at && end.milliseconds <= Date.parse(openRecord.check_in_at))) {
      throw new RangeError('实际离澳时间不正确，必须晚于签到且不能是未来时间')
    }
    return {endDate:end.date,checkOutAt:end.iso,timeUnknown:!openRecord.check_in_at}
  }
  const endDate = input.endDate
  const today = new Date(now + 8 * 3_600_000).toISOString().slice(0,10)
  if (!validDate(endDate) || endDate < openRecord.start_date || endDate > today) throw new RangeError('离澳日期不正确')
  return {endDate,checkOutAt:null,timeUnknown:true}
}
