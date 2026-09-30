import assert from 'node:assert/strict';
import test from 'node:test';
import {previousBillBalances,previousDueFor} from './carry-forward.js';
import {billLine} from './calculations.js';

test('next month carries the latest processed balance after partial and full collections',async()=>{
 const calls=[];
 const db={query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.includes('FROM ib_bill_batches'))return {rows:[{id:9}]};
  if(sql.includes('FROM ib_bill_lines'))return {rows:[{customer_db_id:1,balance_due:'400.00'},{customer_db_id:2,balance_due:'0.00'}]};
  throw Error(`Unexpected query: ${sql}`);
 }};
 const balances=await previousBillBalances(db,4,'2026-10',{lock:true});
 assert.deepEqual(calls.map(call=>call.params),[[4,'2026-10'],[9]]);
 assert.match(calls[0].sql,/bill_month<\$2.*ORDER BY bill_month DESC LIMIT 1 FOR UPDATE/);
 assert.deepEqual(billLine('600.00',previousDueFor({id:1,previous_due:'100.00'},balances)),{
  monthly_bill:'600.00',previous_due:'400.00',total_due:'1000.00',paid_amount:'0.00',balance_due:'1000.00',status:'due'
 });
 assert.equal(previousDueFor({id:2,previous_due:'100.00'},balances),'0.00');
 assert.equal(previousDueFor({id:3,previous_due:'50.00'},balances),'50.00');
});

test('first processed month retains entered opening due',async()=>{
 const db={query:async()=>({rows:[]})};
 const balances=await previousBillBalances(db,4,'2026-09');
 assert.equal(previousDueFor({id:1,previous_due:'150.00'},balances),'150.00');
});
