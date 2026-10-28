import test from 'node:test'
import assert from 'node:assert/strict'
import {parseBeijingLocal,parseManualStay,parseBackfillCheckout} from '../server/services/stay-input.mjs'

test('exact time is Beijing UTC+8, rejects impossible timestamps, future and backward ranges',()=>{
  assert.equal(parseBeijingLocal('2026-09-26T09:00').iso,'2026-09-26T01:00:00.000Z')
  for(const bad of ['2026-02-30T09:00','2026-09-25T25:00','2026-09-25T11:60','2026-09-25'])assert.equal(parseBeijingLocal(bad),null)
  const asOf=new Date('2026-09-29T05:00:00.000Z')
  assert.deepEqual(parseManualStay({startAt:'2026-09-25T09:00',endAt:'2026-09-25T13:00'},{asOf}),{
    startDate:'2026-09-25',endDate:'2026-09-25',checkInAt:'2026-09-25T01:00:00.000Z',checkOutAt:'2026-09-25T05:00:00.000Z',timeUnknown:false})
  assert.throws(()=>parseManualStay({startAt:'2026-09-25T09:00',endAt:'2026-09-25T08:59'},{asOf}),/晚于/)
  assert.throws(()=>parseManualStay({startAt:'2026-09-29T14:00',endAt:'2026-09-29T15:00'},{asOf}),/未来/)
  assert.throws(()=>parseManualStay({startAt:'2026-09-25T09:00',endAt:'2026-09-25T13:00',startDate:'2026-09-26'},{asOf}),/不一致/)
  assert.equal(parseManualStay({startDate:'2026-09-25',endDate:'2026-09-25'},{asOf}).timeUnknown,true)
  assert.throws(()=>parseManualStay({startDate:'2026-09-25',endDate:'2026-09-25'},{asOf,allowLegacy:false}),/准确/)
  const open={start_date:'2026-09-24',check_in_at:'2026-09-24T01:00:00.000Z'}
  assert.equal(parseBackfillCheckout({endAt:'2026-09-24T13:00'},open,{asOf}).checkOutAt,'2026-09-24T05:00:00.000Z')
  assert.throws(()=>parseBackfillCheckout({endAt:'2026-09-24T08:00'},open,{asOf}),/必须晚于/)
})
