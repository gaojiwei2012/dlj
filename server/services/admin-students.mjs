import { beijingDate } from '../date-utils.mjs'
import { loadYearRuleSources } from './year-rule-data.mjs'
import { getUserCompliance } from './stay-compliance.mjs'

/* R004 is an ADMIN-facing projection of actual stays, NOT a second compliance calculator.
 * Keep one asOf and one set of R001 date rules for all students in a request.
 * No persistent aggregate table: a rule edit is reflected by the next read. */
const studentFields = 'id,username,display_name,role,status,created_at'
const lastCheckInQuery = `SELECT id,start_date,end_date,status,check_in_at,check_out_at FROM stay_records
  WHERE user_id=? AND source='CHECK_IN' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`
const openStayQuery = `SELECT id,start_date,check_in_at,status FROM stay_records
  WHERE user_id=? AND status='OPEN' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`

function createContext(database, academicYear, asOf) {
  return { asOf, ruleSources: loadYearRuleSources(database, academicYear) }
}
function userProjection(database, student, academicYear, context, detail = false) {
  const { asOf, ruleSources } = context
  const compliance = getUserCompliance(database, student.id, academicYear, asOf, ruleSources)
  // A classified natural day belongs to exactly one of these two statuses.
  // Do not count NON_COMPLIANT, TIME_UNKNOWN, IN_PROGRESS or NO_STAY here.
  const compliantAndPartialDays = compliance.compliantDays + compliance.partialDays
  const lastCheckIn = database.prepare(lastCheckInQuery).get(student.id) ?? null
  const openStay = database.prepare(openStayQuery).get(student.id) ?? null
  const studentInfo = { ...student, lastCheckIn, openStay }
  const targetDays = academicYear.target_days
  const remainingDays = Math.max(0, targetDays - compliance.compliantDays)
  if (detail) return {
    student: studentInfo, academicYear, asOf: asOf.toISOString(), targetDays, remainingDays,
    compliance, compliantAndPartialDays,
    stayRecords: database.prepare(`SELECT id,start_date,end_date,check_in_at,check_out_at,source,status,created_at
      FROM stay_records WHERE user_id=? AND deleted_at IS NULL AND status IN ('OPEN','CLOSED')
      AND start_date<=? AND COALESCE(end_date,?)>=? ORDER BY start_date DESC,id DESC`)
      .all(student.id, academicYear.end_date, beijingDate(asOf), academicYear.start_date)
  }
  // Intentionally exclude 365+ daily rows from the list; fetch full details on demand.
  const { dailyResults: _dailyResults, ...complianceSummary } = compliance
  return { ...studentInfo, targetDays, remainingDays, compliantAndPartialDays,
    compliance: complianceSummary }
}

export function listAdminStudents(database, academicYear, asOf = new Date()) {
  const context = createContext(database, academicYear, asOf)
  const students = database.prepare(`SELECT ${studentFields} FROM users WHERE role='USER' AND status!='DELETED'
    ORDER BY display_name COLLATE NOCASE,username COLLATE NOCASE,id`).all()
  return { academicYear, asOf: asOf.toISOString(), students:
    students.map(student => userProjection(database, student, academicYear, context)) }
}

export function getAdminStudentDetail(database, studentId, academicYear, asOf = new Date()) {
  const student = database.prepare(`SELECT ${studentFields} FROM users WHERE id=? AND role='USER' AND status!='DELETED'`).get(studentId)
  if (!student) return null
  return userProjection(database, student, academicYear,
    createContext(database, academicYear, asOf), true)
}
