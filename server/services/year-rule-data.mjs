/** Read one consistent R001 date-rule snapshot for actual and planned day evaluation. */
export function loadYearRuleSources(database, academicYear, from = academicYear.start_date, to = academicYear.end_date) {
  return {
    dateRules: database.prepare(`SELECT rule_date,type,source,reason,status FROM date_rules
      WHERE status='ACTIVE' AND rule_date BETWEEN ? AND ?`).all(from, to),
    legacyInvalidRanges: database.prepare(`SELECT start_date,end_date,reason,status,type FROM invalid_date_ranges
      WHERE (academic_year_id=? OR type='PUBLIC_HOLIDAY') AND status='ACTIVE' AND start_date<=? AND end_date>=?`)
      .all(academicYear.id, to, from),
    courseDates: database.prepare(`SELECT cd.course_date FROM course_dates cd
      JOIN course_sessions cs ON cs.id=cd.course_session_id
      WHERE cs.academic_year_id=? AND cs.status='ACTIVE' AND cd.status='ACTIVE'
      AND cd.course_date BETWEEN ? AND ?`).all(academicYear.id, from, to)
  }
}
