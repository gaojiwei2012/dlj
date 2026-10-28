const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'})
export function beijingDate(value=new Date()){return fmt.format(new Date(value))}
export function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(value+'T00:00:00Z');return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value}
export function eachDate(start,end){
  if(!validDate(start)||!validDate(end)||start>end) throw new Error('日期范围不正确')
  const out=[]; let d=new Date(start+'T00:00:00Z'); const last=new Date(end+'T00:00:00Z')
  while(d<=last){out.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+1)}
  return out
}
export function calculateDays(records,invalidRanges=[],from='0000-01-01',to='9999-12-31'){
  const actual=new Set(); const invalid=new Set()
  for(const r of records){const s=r.start_date<from?from:r.start_date; const e=r.end_date>to?to:r.end_date;if(s<=e)for(const d of eachDate(s,e))actual.add(d)}
  for(const r of invalidRanges){const s=r.start_date<from?from:r.start_date;const e=r.end_date>to?to:r.end_date;if(s<=e)for(const d of eachDate(s,e))invalid.add(d)}
  let excluded=0; for(const d of actual)if(invalid.has(d))excluded++
  return {actualDays:actual.size,invalidDays:excluded,effectiveDays:actual.size-excluded,dates:[...actual].sort()}
}
