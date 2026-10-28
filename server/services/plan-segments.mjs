import { splitPlanByCourseDates } from '../../shared/plan-segments.mjs'

/** One DB read for the returned plans. Segments are derived on read, never stored
 * as separate travel plans, preserving reservations and the existing plan ID.
 */
export function decoratePlanSegments(database, plans) {
  if (!plans.length) return plans
  const earliest = plans.reduce((min, plan) => plan.depart_date < min ? plan.depart_date : min, plans[0].depart_date)
  const latest = plans.reduce((max, plan) => plan.return_date > max ? plan.return_date : max, plans[0].return_date)
  const courseDates = database.prepare(`SELECT DISTINCT cd.course_date FROM course_dates cd
    JOIN course_sessions cs ON cs.id = cd.course_session_id
    WHERE cs.status='ACTIVE' AND cd.status='ACTIVE'
    AND cd.course_date BETWEEN ? AND ?`).all(earliest, latest).map(row => row.course_date)
  return plans.map(plan => ({...plan, segments: splitPlanByCourseDates(plan.depart_date, plan.return_date, courseDates)}))
}
