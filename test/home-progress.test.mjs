import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateHomeProgress } from '../src/utils/home-progress.mjs'

test('首页默认累计逗留：完全符合2＋部分符合1，目标90，展示3／还差87', () => {
  const result = calculateHomeProgress({compliantDays: 2, partialDays: 1, nonCompliantDays: 4, timeUnknownDays: 5, inProgressDays: 1}, 90)
  assert.deepEqual(result, {
    title: '逗留天数（包含完全符合 & 部分符合）',
    days: 3,
    remaining: 87,
    percent: 3
  })
})

test('切换仅完全符合：仍使用同一目标90，展示2／还差88', () => {
  const result = calculateHomeProgress({compliantDays: 2, partialDays: 1}, 90, 'compliant')
  assert.deepEqual(result, {title: '完全符合天数', days: 2, remaining: 88, percent: 2})
})

test('进度封顶，剩余不为负；零目标不发生除零', () => {
  assert.deepEqual(calculateHomeProgress({compliantDays: 90, partialDays: 2}, 90, 'total'), {
    title: '逗留天数（包含完全符合 & 部分符合）', days: 92, remaining: 0, percent: 100
  })
  assert.equal(calculateHomeProgress({compliantDays: 1, partialDays: 1}, 0).percent, 0)
})

test('学年输入更新后按当前值计算，不混入其他状态', () => {
  assert.equal(calculateHomeProgress({compliantDays: 1, partialDays: 2, nonCompliantDays: 20}, 30).remaining, 27)
  assert.equal(calculateHomeProgress({compliantDays: 1, partialDays: 2}, 12, 'compliant').remaining, 11)
})
