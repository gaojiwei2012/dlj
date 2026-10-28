import test from 'node:test'
import assert from 'node:assert/strict'
import { computePlanPrediction } from '../server/services/plan-prediction.mjs'

const year = {id:1,name:'测试学年',start_date:'2026-09-01',end_date:'2027-08-31',target_days:90}
const at = '2026-09-29T04:00:00.000Z' // 2026-09-29 12:00 Beijing
const plans = [
  {id:1,depart_date:'2026-09-25',return_date:'2026-09-29',status:'ACTIVE'},
  {id:2,depart_date:'2026-09-28',return_date:'2026-10-01',status:'ACTIVE'},
  {id:3,depart_date:'2026-09-20',return_date:'2026-09-21',status:'DELETED'}
]
const day = (date,status,options={}) => ({date,status,hasStay:status!=='NO_STAY',stayMinutes:240,inProgress:false,...options})
const run = overrides => computePlanPrediction({plans,academicYear:year,asOf:at,...overrides})
const resultOn = (res,date) => res.dailyResults.find(x=>x.date===date)

test('R002 plan endpoints, overlapping union, two years, and public/private parity', () => {
  const r=run({dateRuleSources:{},actualDailyResults:[]})
  assert.equal(r.forecast.totalPlannedDays,7) // Sep25..Oct1, Sep28..29 once
  assert.deepEqual(r.forecast,{compliantDays:5,partialDays:2,nonCompliantDays:0,totalPlannedDays:7})
  assert.equal(r.perPlanForecast.length,2)
  assert.equal(r.perPlanForecast[0].totalDays,5)
  assert.equal(r.perPlanForecast[1].totalDays,4)
  assert.equal(r.comparison.netDifferenceDays, -2) // Sep25 Fri and Sep28 Mon, no stays
  assert.equal(r.comparison.missedPlannedDays,2)
  assert.equal(resultOn(r,'2026-09-29').settlement,'TODAY_PENDING')
  assert.equal(resultOn(r,'2026-09-30').settlement,'FUTURE')
  assert.equal(resultOn(r,'2026-09-30').difference,'NOT_SETTLED')
  assert.equal(r.basis,'CURRENT_ACTIVE_PLANS')
})

test('R002 只接受集中课程解锁周末，历史有效周末不生效、假期仍优先',()=>{
  const r=run({ dateRuleSources: {
    dateRules:[
      {rule_date:'2026-09-26',type:'VALID_WEEKEND',status:'ACTIVE'},
      {rule_date:'2026-09-26',type:'PUBLIC_HOLIDAY',status:'ACTIVE'},
      {rule_date:'2026-09-27',type:'VALID_WEEKEND',status:'ACTIVE'}
    ], courseDates:[{course_date:'2026-09-26'}]
  }})
  assert.equal(resultOn(r,'2026-09-26').planStatus,'NON_COMPLIANT')
  assert.equal(resultOn(r,'2026-09-26').plannedReasonCode,'PUBLIC_HOLIDAY')
  assert.equal(resultOn(r,'2026-09-27').planStatus,'PARTIAL')
  assert.deepEqual(r.forecast,{compliantDays:5,partialDays:1,nonCompliantDays:1,totalPlannedDays:7})
})

test('R002 missed and extra details survive a zero net difference',()=>{
  const r=run({ plans:[{id:1,depart_date:'2026-09-21',return_date:'2026-09-21'}],
    dateRuleSources:{}, actualDailyResults:[day('2026-09-21','PARTIAL',{stayMinutes:239}),day('2026-09-22','COMPLIANT')] })
  assert.equal(r.comparison.plannedCompliantDaysToDate,1)
  assert.equal(r.comparison.actualCompliantDaysToDate,1)
  assert.equal(r.comparison.netDifferenceDays,0)
  assert.equal(r.comparison.missedPlannedDays,1)
  assert.equal(r.comparison.extraCompliantDays,1)
  assert.equal(r.comparison.mismatchDays,2)
  assert.equal(resultOn(r,'2026-09-21').difference,'MISSED')
  assert.equal(resultOn(r,'2026-09-22').difference,'EXTRA')
})

test('R002 today OPEN excludes both missing and extra, and today closed settles immediately',()=>{
  const inProgress=run({plans:[{id:1,depart_date:'2026-09-29',return_date:'2026-09-30'}],
    actualDailyResults:[day('2026-09-29','IN_PROGRESS',{inProgress:true,stayMinutes:125})]})
  assert.equal(resultOn(inProgress,'2026-09-29').settlement,'IN_PROGRESS')
  assert.equal(inProgress.comparison.missedPlannedDays,0)
  assert.equal(inProgress.comparison.plannedCompliantDaysToDate,0)
  const closed=run({plans:[{id:1,depart_date:'2026-09-29',return_date:'2026-09-30'}],
    actualDailyResults:[day('2026-09-29','PARTIAL',{stayMinutes:120})]})
  assert.equal(resultOn(closed,'2026-09-29').settlement,'SETTLED')
  assert.equal(closed.comparison.missedPlannedDays,1)
  const noStay=run({plans:[{id:1,depart_date:'2026-09-29',return_date:'2026-09-30'}],actualDailyResults:[]})
  assert.equal(noStay.comparison.missedPlannedDays,0)
  assert.equal(resultOn(noStay,'2026-09-29').settlement,'TODAY_PENDING')
})

test('R002 historical planned NON_COMPLIANT and actual NO_STAY remain distinct',()=>{
  const r=run({plans:[{id:1,depart_date:'2026-09-24',return_date:'2026-09-24'}],
    dateRuleSources:{dateRules:[{rule_date:'2026-09-24',type:'PUBLIC_HOLIDAY',status:'ACTIVE'}]},actualDailyResults:[]})
  const item=resultOn(r,'2026-09-24')
  assert.equal(item.planStatus,'NON_COMPLIANT')
  assert.equal(item.actualStatus,'NO_STAY')
  assert.equal(item.mismatch,true)
  assert.equal(item.difference,'STATUS_MISMATCH')
  assert.equal(r.comparison.missedPlannedDays,0)
})

test('R002 clamps crossing-year plans and does not double count two plans on same date',()=>{
  const y={...year,start_date:'2026-09-01',end_date:'2026-09-03'}
  const r=run({academicYear:y,plans:[
    {id:1,depart_date:'2026-08-30',return_date:'2026-09-03'},
    {id:2,depart_date:'2026-09-01',return_date:'2026-09-04'}
  ],actualDailyResults:[]})
  assert.equal(r.forecast.totalPlannedDays,3)
  assert.equal(r.perPlanForecast[0].totalDays,3)
  assert.equal(r.perPlanForecast[1].totalDays,3)
})
