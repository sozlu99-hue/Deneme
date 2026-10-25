import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const moduleUrl=new URL('../web/pos.js',import.meta.url).href;
for(const zone of ['UTC','America/Los_Angeles','Asia/Tokyo','Europe/Istanbul']){
 test('Business summaries use Istanbul dates in '+zone,()=>{
  const script=`import {dateKey,summary} from ${JSON.stringify(moduleUrl)};
   const dates=['2026-10-16T20:59:59Z','2026-10-16T21:00:00Z','2026-10-31T21:30:00Z'];
   const state={module:'market',sales:dates.map((date,i)=>({date,status:'completed',payment:'cash',totalCents:100*(i+1)}))};
   console.log(JSON.stringify({dates:dates.map(dateKey),days:summary(state).days}));`;
  const actual=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ:zone},encoding:'utf8'}));
  assert.deepEqual(actual.dates,['2026-10-16','2026-10-17','2026-11-01']);
  assert.deepEqual(actual.days.map(d=>[d.date,d.netCents,d.cashCents,d.salesCount]),[['2026-10-16',100,100,1],['2026-10-17',200,200,1],['2026-11-01',300,300,1]]);
 });
}
