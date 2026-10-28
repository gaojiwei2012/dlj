/**
 * Homepage presentation only: lets the viewer switch between total classified
 * stay days (COMPLIANT + PARTIAL) and compliant-only days. This does not change
 * daily compliance, academic-year rules or R002 comparisons.
 */
export function calculateHomeProgress(compliance = {}, targetDays = 0, mode = 'total') {
  const compliantDays = Math.max(0, Number(compliance?.compliantDays) || 0)
  const partialDays = Math.max(0, Number(compliance?.partialDays) || 0)
  const target = Math.max(0, Number(targetDays) || 0)
  const compliantOnly = mode === 'compliant'
  const days = compliantOnly ? compliantDays : compliantDays + partialDays
  return {
    title: compliantOnly ? '完全符合天数' : '逗留天数（包含完全符合 & 部分符合）',
    days,
    remaining: Math.max(0, target - days),
    percent: target > 0 ? Math.min(100, Math.round(days / target * 100)) : 0
  }
}
