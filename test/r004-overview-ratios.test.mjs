import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// UI regression contract: the R004 data assertions are covered by r004-admin-students.test.mjs.
// This verifies the overview renders those same actual-day values against the selected year's target,
// rather than accidentally returning to the original plan-versus-actual presentation.
test('R004 overview displays three actual-day ratios and no plan columns', () => {
  const component = readFileSync(new URL('../src/components/admin/StudentOverview.vue', import.meta.url), 'utf8')
  for (const name of ['完全符合', '部分符合', '累计符合（完全＋部分）']) {
    assert.ok(component.includes(name), `missing metric: ${name}`)
  }
  assert.match(component, /compliantDays\}\}<span> \/ \{\{s\.targetDays\}\}/)
  assert.match(component, /partialDays\}\}<span> \/ \{\{s\.targetDays\}\}/)
  assert.match(component, /compliantAndPartialDays\}\}<span> \/ \{\{s\.targetDays\}\}/)
  assert.match(component, /targetSum = computed\(\(\) => students\.value\.reduce\(\(sum, s\) => sum \+ s\.targetDays, 0\)\)/)
  assert.match(component, /grid-template-columns:minmax\(150px,1\.4fr\) repeat\(3,minmax\(115px,1fr\)\) minmax\(94px,\.7fr\)/)
  assert.doesNotMatch(component, /计划截至当前|计划执行净差异|planPrediction|netDifferenceDays/)
})
