import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const page = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const card = page.split('<section class="progress-card" aria-label="本学年逗留统计">')[1]
  ?.split('</section>')[0]

test('首页逗留卡片不再提供统计口径选择器，始终使用累计逗留', () => {
  assert.ok(card)
  assert.doesNotMatch(card, /<select|统计口径|homeProgressMode/)
  assert.match(page, /calculateHomeProgress\(dashboard\.value\?\.compliance,dashboard\.value\?\.stats\?\.targetDays\)/)
})

test('首页只展示已逗留、完全符合与部分符合，不再显示目标及剩余天数', () => {
  assert.match(card, /已逗留天数/)
  assert.match(card, /homeProgress\.days/)
  assert.match(card, /dashboard\.compliance\.compliantDays/)
  assert.match(card, /dashboard\.compliance\.partialDays/)
  assert.doesNotMatch(card, /progress-target|dashboard\.stats\.targetDays|homeProgress\.remaining/)
})

test('逗留卡片公开准确的实际结算规则和例外情况', () => {
  assert.match(card, /至少 4 小时/)
  assert.match(card, /集中课程/)
  assert.match(card, /公共假期/)
  assert.match(card, /无效日期/)
  assert.match(card, /不足 4 小时/)
  assert.match(card, /完全符合天数 \+ 部分符合天数/)
  assert.match(card, /本程序为方便各位同学记录逗留，相关记录仅供个人参考。逗留时间以留服认证为准/)
})
