import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const vue = readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')

test('日期管理页面只保留一张公共假期与无效日期统一卡片', () => {
  assert.equal((vue.match(/<h3>公共假期与无效逗留日期<\/h3>/g)??[]).length,1)
  assert.equal((vue.match(/<h3>无效逗留日期<\/h3>/g)??[]).length,0)
  assert.ok(vue.includes('<option value="PUBLIC_HOLIDAY">澳门公共假期</option>'))
  assert.ok(vue.includes('<option value="MANUAL_INVALID">无效逗留日期</option>'))
  assert.ok(vue.includes('v-for="x in dateExceptions"'))
  assert.ok(vue.includes('dateRuleOverview.value?.exceptionRecords'))
  assert.ok(vue.includes("x.source_type==='RANGE'?'/admin/invalid-dates/'+x.id:'/admin/date-rules/'+x.id"))
  assert.equal((vue.match(/<div class="date-rule-form">/g)??[]).length,1)
})
