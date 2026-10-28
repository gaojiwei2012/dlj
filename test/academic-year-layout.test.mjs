import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const vue = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('学年编辑与当前启用／新建学年并列展示，不再占用独立半栏', () => {
  const announcement = vue.indexOf('<h3>首页公告</h3>')
  const section = vue.indexOf('class="admin-section-heading wide"')
  const editor = vue.indexOf('class="admin-card academic-year-card academic-year-edit-card"')
  const creator = vue.indexOf('class="admin-card academic-year-card academic-year-create-card"')
  const rules = vue.indexOf('class="admin-card wide date-rules-card"')
  assert.ok(announcement > -1 && announcement < section)
  assert.ok(section < editor && editor < creator && creator < rules)
  assert.equal(vue.includes('class="admin-card new-year-card"'), false)
  assert.equal((vue.match(/@click="createYear"/g) || []).length, 1)
  assert.equal((vue.match(/@click="saveYear"/g) || []).length, 1)
  assert.ok(css.includes('grid-column: 1 / -1;\n  display: flex;'))
  assert.ok(css.includes('.app-shell.admin-shell .academic-year-card { grid-column: 1 / -1; }'))
  assert.ok(css.includes('.academic-year-card .academic-year-footer { flex-direction: column; align-items: stretch; }'))
})
