import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const vue=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')

test('学年编辑与顶部所选学年一致，取消恢复原值且保存刷新学年数据',()=>{
  assert.ok(vue.includes('const selectedAcademicYear=computed(()=>academicYears.value.find('))
  assert.ok(vue.includes('async function changeYear(){resetYearForm();'))
  assert.ok(vue.includes('正在编辑：<strong>{{selectedAcademicYear?.name'))
  assert.ok(vue.includes('async function saveYear()'))
  assert.ok(vue.includes("api('/admin/academic-years/'+id,{method:'PATCH'"))
  assert.ok(vue.includes('await loadYears();await loadAdmin();await core()'))
  assert.ok(vue.includes(':disabled="!yearFormChanged||yearSaving" @click="resetYearForm"'))
  assert.equal(vue.includes("adminSave('/admin/academic-year',yearForm,'PUT')"),false)
})
