import assert from 'node:assert/strict';
import {test} from 'node:test';
import app from './index.js';
import {pool} from './db.js';

test('Reports and Monthly Bill Sheet show only currently active customers for live and processed bills',async t=>{
 const originalQuery=pool.query;
 const customers=[
  {id:1,office_id:4,customer_id:'gns401',customer_name:'Active',status:'active',monthly_bill:'100.00',previous_due:'0.00',address:'Active Road'},
  {id:2,office_id:4,customer_id:'gns402',customer_name:'Inactive',status:'inactive',monthly_bill:'200.00',previous_due:'50.00',address:'Inactive Road'}
 ];
 let processed=false;
 pool.query=async(sql,params=[])=>{
  if(sql.includes('FROM ib_sessions'))return {rows:[{id:7,name:'Admin',username:'admin',role:'Super Admin',office_id:0}]};
  if(sql.startsWith('SELECT * FROM ib_bill_batches'))return {rows:processed?[{id:9}]:[]};
  if(sql.includes('FROM ib_bill_batches')&&sql.includes('bill_month<$2'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM ib_customers WHERE office_id=$1'))return {rows:customers};
  if(sql.includes('GROUP BY customer_db_id'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM ib_bill_lines'))return {rows:customers.map(c=>({
   ...c,customer_db_id:c.id,total_due:c.id===1?'100.00':'250.00',paid_amount:c.id===1?'0.00':'50.00',balance_due:c.id===1?'100.00':'200.00'
  }))};
  if(sql.startsWith('SELECT id FROM ib_customers WHERE id=ANY($1::BIGINT[]) AND status='))return {rows:customers.filter(c=>c.status==='active'&&params[0].includes(c.id)).map(c=>({id:c.id}))};
  if(sql.startsWith('SELECT id,pppoe_username,address,status FROM ib_customers'))return {rows:customers.filter(c=>params[0].includes(c.id))};
  if(sql.includes('FROM ib_isp_payments'))return {rows:[{n:'0.00'}]};
  throw Error('Unexpected query: '+sql);
 };
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;await new Promise(resolve=>server.close(resolve));});
 const get=async(path)=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/${path}?office_id=4&month=2026-10${path==='bills'?'&active_only=1':''}`,{headers:{Cookie:'ibm_session=test'}});
  assert.equal(response.status,200);
  return response.json();
 };
 for(const mode of ['live','processed']){
  processed=mode==='processed';
  const bill=await get('bills');
  assert.equal(Boolean(bill.batch),processed);
  assert.deepEqual(bill.rows.map(row=>row.customer_id),['gns401']);
  const report=await get('report');
  assert.deepEqual(report.rows.map(row=>row.customer_id),['gns401']);
  assert.equal(report.count,1);
  assert.deepEqual([report.monthly,report.previous_due,report.total_due,report.paid,report.balance],['100.00','0.00','100.00','0.00','100.00']);
  const collectionResponse=await fetch(`http://127.0.0.1:${server.address().port}/api/bills?office_id=4&month=2026-10`,{headers:{Cookie:'ibm_session=test'}});
  assert.equal(collectionResponse.status,200);
  assert.deepEqual((await collectionResponse.json()).rows.map(row=>row.customer_id),['gns401','gns402']);
 }
});
