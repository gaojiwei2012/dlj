import test from 'node:test'
import assert from 'node:assert/strict'
import {calculateDays,eachDate,validDate} from '../server/date-utils.mjs'
test('当天往返计一天',()=>assert.equal(calculateDays([{start_date:'2026-09-15',end_date:'2026-09-15'}]).effectiveDays,1))
test('入澳离澳两天均计入',()=>assert.equal(calculateDays([{start_date:'2026-09-15',end_date:'2026-09-16'}]).effectiveDays,2))
test('重叠记录只计一次',()=>assert.equal(calculateDays([{start_date:'2026-09-15',end_date:'2026-09-16'},{start_date:'2026-09-16',end_date:'2026-09-17'}]).effectiveDays,3))
test('无效日期扣除且重叠只扣一次',()=>assert.deepEqual(calculateDays([{start_date:'2026-09-15',end_date:'2026-09-20'}],[{start_date:'2026-09-17',end_date:'2026-09-18'},{start_date:'2026-09-18',end_date:'2026-09-18'}]),{actualDays:6,invalidDays:2,effectiveDays:4,dates:eachDate('2026-09-15','2026-09-20')}))
test('拒绝不存在的日期并接受闰年日期',()=>{assert.equal(validDate('2026-02-31'),false);assert.equal(validDate('2028-02-29'),true);assert.equal(validDate('2027-02-29'),false)})
