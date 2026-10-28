import { eachDate, validDate } from '../date-utils.mjs'
import { isWeekend, makeDateRuleResolver } from './date-rules.mjs'

const MANUAL_TYPES = new Set(['PUBLIC_HOLIDAY', 'MANUAL_INVALID'])
const error = (message, status = 400) => Object.assign(new Error(message), {status})

export function parseCalendarYear(value) {
  if (!/^(19|20)\d{2}$/.test(String(value ?? ''))) throw error('请选择1900至2099年的公历年份')
  return Number(value)
}

function checkedRule(input) {
  const date = input.date ?? input.ruleDate
  const type = input.type
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!validDate(date)) throw error('请填写正确日期')
  if (!MANUAL_TYPES.has(type)) throw error('规则类型仅支持公共假期、无效逗留日期；周末有效性由集中课程决定')
  if (!reason || [...reason].length > 120) throw error('请填写1至120字的规则原因')
  return {date, type, reason}
}

function writeAudit(database, actorId, action, rowId, before, after, reason) {
  database.prepare(`INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,before_json,after_json,reason,created_at)
    VALUES(?,?,'date_rule',?,?,?,?,?)`).run(actorId, action, rowId,
      before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, reason ?? '', new Date().toISOString())
}

function transaction(database, task) {
  database.exec('BEGIN IMMEDIATE')
  try { const result = task(); database.exec('COMMIT'); return result }
  catch (cause) { database.exec('ROLLBACK'); throw cause }
}

export function syncYearWeekends(database, actorId, yearValue) {
  const year = parseCalendarYear(yearValue)
  return transaction(database, () => {
    const now = new Date().toISOString()
    const insert = database.prepare(`INSERT INTO date_rules(rule_date,type,source,reason,status,created_by,created_at,updated_at)
      VALUES(?,'WEEKEND','AUTO','公历周末','ACTIVE',?,?,?) ON CONFLICT(rule_date,type) DO NOTHING`)
    let added = 0, total = 0
    for (const date of eachDate(`${year}-01-01`, `${year}-12-31`)) {
      if (!isWeekend(date)) continue
      total++
      added += insert.run(date, actorId, now, now).changes
    }
    writeAudit(database, actorId, 'SYNC_WEEKENDS', null, null, {year, added, total}, '同步公历周末（保留既有规则）')
    return {year, added, total, unchanged: total - added}
  })
}

export function createManualDateRule(database, actorId, input) {
  const rule = checkedRule(input)
  return transaction(database, () => {
    if (rule.type === 'MANUAL_INVALID' && database.prepare(`SELECT id FROM invalid_date_ranges
      WHERE status='ACTIVE' AND start_date<=? AND end_date>=? LIMIT 1`).get(rule.date,rule.date)) {
      throw error('该日期已在无效逗留日期区间内，请在统一入口修改',409)
    }
    const existing = database.prepare('SELECT * FROM date_rules WHERE rule_date=? AND type=?').get(rule.date,rule.type)
    if (existing?.status === 'ACTIVE') throw error('该日期及规则类型已经存在', 409)
    const now = new Date().toISOString()
    let rowId
    if (existing) {
      if (existing.source !== 'MANUAL') throw error('系统自动规则不可手工覆盖', 409)
      database.prepare("UPDATE date_rules SET reason=?,status='ACTIVE',created_by=?,updated_at=? WHERE id=?")
        .run(rule.reason,actorId,now,existing.id)
      rowId = existing.id
    } else {
      rowId = Number(database.prepare(`INSERT INTO date_rules(rule_date,type,source,reason,status,created_by,created_at,updated_at)
        VALUES(?,?,'MANUAL',?,'ACTIVE',?,?,?)`).run(rule.date,rule.type,rule.reason,actorId,now,now).lastInsertRowid)
    }
    const after = database.prepare('SELECT * FROM date_rules WHERE id=?').get(rowId)
    writeAudit(database,actorId,existing?'REACTIVATE':'CREATE',rowId,existing ?? null,after,rule.reason)
    return after
  })
}

export function updateManualDateRule(database, actorId, id, input) {
  const rule = checkedRule(input)
  return transaction(database, () => {
    const old = database.prepare('SELECT * FROM date_rules WHERE id=?').get(id)
    if (!old || old.source !== 'MANUAL' || old.type === 'WEEKEND' || old.type === 'VALID_WEEKEND') throw error('可编辑的手工日期规则不存在', 404)
    if (rule.type === 'MANUAL_INVALID' && database.prepare(`SELECT id FROM invalid_date_ranges
      WHERE status='ACTIVE' AND start_date<=? AND end_date>=? LIMIT 1`).get(rule.date,rule.date)) {
      throw error('该日期已在无效逗留日期区间内，请在统一入口修改',409)
    }
    if (database.prepare('SELECT id FROM date_rules WHERE rule_date=? AND type=? AND id!=?').get(rule.date,rule.type,id)) {
      throw error('该日期及类型已存在，请先处理已有规则',409)
    }
    const status = input.status === 'ACTIVE' ? 'ACTIVE' : old.status
    database.prepare('UPDATE date_rules SET rule_date=?,type=?,reason=?,status=?,updated_at=? WHERE id=?')
      .run(rule.date,rule.type,rule.reason,status,new Date().toISOString(),id)
    const after = database.prepare('SELECT * FROM date_rules WHERE id=?').get(id)
    writeAudit(database,actorId,'UPDATE',id,old,after,rule.reason)
    return after
  })
}

export function disableManualDateRule(database, actorId, id) {
  return transaction(database, () => {
    const old = database.prepare('SELECT * FROM date_rules WHERE id=?').get(id)
    if (!old || old.source !== 'MANUAL' || old.type === 'WEEKEND') throw error('可停用的手工日期规则不存在',404)
    if (old.status !== 'ACTIVE') throw error('此日期规则已经停用',409)
    database.prepare("UPDATE date_rules SET status='INACTIVE',updated_at=? WHERE id=?").run(new Date().toISOString(),id)
    const after = database.prepare('SELECT * FROM date_rules WHERE id=?').get(id)
    writeAudit(database,actorId,'DISABLE',id,old,after,'管理员停用日期规则')
    return after
  })
}

/** Yearly management view: weekend rows + manual rules + course dates + legacy invalid ranges.
 * Date attributes are computed on demand; the same resolver is used in student compliance. */
export function getYearDateRuleOverview(database, yearValue) {
  const year = parseCalendarYear(yearValue)
  const from = `${year}-01-01`, to = `${year}-12-31`
  const dateRules = database.prepare(`SELECT * FROM date_rules WHERE rule_date BETWEEN ? AND ? ORDER BY rule_date,type`).all(from,to)
  const legacy = database.prepare(`SELECT id,academic_year_id,start_date,end_date,reason,status,type FROM invalid_date_ranges
    WHERE status='ACTIVE' AND start_date<=? AND end_date>=?`).all(to,from)
  const courseDates = database.prepare(`SELECT DISTINCT cd.course_date FROM course_dates cd JOIN course_sessions cs
    ON cs.id=cd.course_session_id WHERE cs.status='ACTIVE' AND cd.status='ACTIVE' AND cd.course_date BETWEEN ? AND ?`).all(from,to)
  const resolver = makeDateRuleResolver({dateRules,legacyInvalidRanges:legacy,courseDates})
  const rowsByDate = new Map(), allDates = new Set(courseDates.map(row => row.course_date))
  for (const date of eachDate(from,to)) if (isWeekend(date)) allDates.add(date)
  for (const row of dateRules) {
    if (row.type === 'VALID_WEEKEND') continue // 历史规则已弃用，不在管理视图中展示
    allDates.add(row.rule_date)
    if (!rowsByDate.has(row.rule_date)) rowsByDate.set(row.rule_date,[])
    rowsByDate.get(row.rule_date).push(row)
  }
  for (const range of legacy) {
    for (const day of eachDate(range.start_date < from ? from : range.start_date,
      range.end_date > to ? to : range.end_date)) allDates.add(day)
  }
  const weekdays = ['日','一','二','三','四','五','六']
  const dates = [...allDates].sort().map(date => {
    const rules = resolver(date)
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay()
    const manualRules = rowsByDate.get(date) ?? []
    return {
      date, weekday:weekdays[dayOfWeek], ...rules,
      records: manualRules,
      hasSyncedWeekend: manualRules.some(r => r.type === 'WEEKEND' && r.status === 'ACTIVE'),
      effect: rules.isPublicHoliday ? '公共假期：强制不符合'
        : rules.isManualInvalid ? '无效逗留日期：不符合'
        : rules.isWeekend && rules.isCourseDay ? '满4小时可完全符合'
        : rules.isWeekend ? '普通周末：最多部分符合'
        : '工作日：满4小时可完全符合'
    }
  })
  // One list powers the combined holiday + invalid-date administration card.
  // Legacy ranges remain stored as ranges; original manual day rules retain their IDs.
  const exceptionRecords = [
    ...dateRules.filter(row => row.source === 'MANUAL' && row.status === 'ACTIVE' &&
      (row.type === 'PUBLIC_HOLIDAY' || row.type === 'MANUAL_INVALID'))
      .map(row => ({id:row.id,source_type:'MANUAL_RULE',type:row.type,
        start_date:row.rule_date,end_date:row.rule_date,reason:row.reason,status:row.status})),
    ...legacy.map(row => ({...row,source_type:'RANGE',type:row.type || 'MANUAL_INVALID'}))
  ].sort((a,b) => a.start_date.localeCompare(b.start_date) ||
    a.end_date.localeCompare(b.end_date) || a.source_type.localeCompare(b.source_type) || a.id-b.id)
  return {year, totalWeekends: dates.filter(d => d.isWeekend).length,
    syncedWeekends:dates.filter(d => d.isWeekend && d.hasSyncedWeekend).length, dates,exceptionRecords}
}
