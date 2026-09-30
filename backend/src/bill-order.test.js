import assert from 'node:assert/strict';
import test from 'node:test';
import app from './index.js';
import {pool} from './db.js';

test('Monthly Bill Sheet returns live and processed rows in numeric Customer ID order',async t=>{
 const original=pool.query;
 const customers=['gns410','gns402','gns401'].map((customer_id,index)=>({id:index+1,office_id:4,customer_id,customer_name:`Customer ${index+1}`,monthly_bill:'600.00',previous_due:'0.00',status:'active'}));
 let processed=false;
 pool.query=async(sql)=>{
  if(sql.includes('FROM ib_sessions'))return {rows:[{id:7,name:'Admin',username:'admin',role:'Super Admin',office_id:0}]};
  if(sql.includes('SELECT * FROM ib_bill_batches WHERE office_id='))return {rows:processed?[{id:9,office_id:4,bill_month:'2026-09'}]:[]};
  if(sql.includes('FROM ib_bill_batches WHERE office_id=')&&sql.includes('bill_month<$2'))return {rows:[]};
  if(sql.includes('SELECT * FROM ib_customers WHERE office_id='))return {rows:customers};
  if(sql.includes('GROUP BY customer_db_id'))return {rows:[]};
  if(sql.includes('SELECT * FROM ib_bill_lines WHERE batch_id='))return {rows:customers.map(c=>({...c,customer_db_id:c.id,total_due:'600.00',paid_amount:'0.00',balance_due:'600.00'}))};
  throw Error(`Unexpected query: ${sql}`);
 };
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=original;await new Promise(resolve=>server.close(resolve));});
 const url=`http://127.0.0.1:${server.address().port}/api/bills?office_id=4&month=2026-09`;
 for(const mode of ['live','processed']){
  processed=mode==='processed';
  const response=await fetch(url,{headers:{cookie:'ibm_session=test'}});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).rows.map(row=>row.customer_id),['gns401','gns402','gns410']);
 }
 assert.deepEqual(customers.map(c=>c.customer_id),['gns410','gns402','gns401']);
});
