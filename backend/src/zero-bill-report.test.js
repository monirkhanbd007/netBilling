import assert from 'node:assert/strict';
import {test} from 'node:test';
import app from './index.js';
import {pool} from './db.js';

test('live and processed reports and slips include zero bills with accurate totals',async t=>{
 const originalQuery=pool.query;
 let processed=false,onlyZero=false;
 const customers=[
  {id:1,customer_id:'gns410',customer_name:'Regular',monthly_bill:'600.00',previous_due:'200.00'},
  {id:2,customer_id:'gns401',customer_name:'শূন্য বিল',monthly_bill:'0.00',previous_due:'0.00'},
  {id:3,customer_id:'gns402',customer_name:'Previous due only',monthly_bill:'0.00',previous_due:'150.00'}
 ].map(row=>({...row,office_id:4,status:'active',address:'Address '+row.id,pppoe_username:'user'+row.id,pppoe_password:'secret'}));
 const selected=()=>onlyZero?[customers[1]]:customers;
 pool.query=async(sql,params=[])=>{
  if(sql.includes('FROM ib_sessions'))return {rows:[{id:7,role:'Super Admin',office_id:0}]};
  if(sql==='SELECT * FROM ib_offices WHERE id=$1')return {rows:[{id:4,office_name:'GNS-2'}]};
  if(sql.startsWith('SELECT * FROM ib_bill_batches'))return {rows:processed?[{id:9}]:[]};
  if(sql.includes('FROM ib_bill_batches')&&sql.includes('bill_month<$2'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM ib_customers WHERE office_id=$1'))return {rows:selected()};
  if(sql.includes('GROUP BY customer_db_id'))return {rows:onlyZero?[]:[{customer_db_id:1,amount:'100.00'}]};
  if(sql.startsWith('SELECT * FROM ib_bill_lines'))return {rows:selected().map(row=>({
   ...row,customer_db_id:row.id,total_due:row.id===1?'800.00':row.previous_due,
   paid_amount:row.id===1?'100.00':'0.00',balance_due:row.id===1?'700.00':row.previous_due
  }))};
  if(sql.startsWith('SELECT id,pppoe_username,address,status FROM ib_customers')||sql.startsWith('SELECT id,address,pppoe_username FROM ib_customers'))return {rows:customers.filter(row=>params[0].includes(row.id)).map(({id,address,pppoe_username,status})=>({id,address,pppoe_username,status}))};
  if(sql.includes('FROM ib_settings'))return {rows:[]};
  if(sql.includes('FROM ib_isp_payments'))return {rows:[{n:onlyZero?'0.00':'50.00'}]};
  throw Error('Unexpected query: '+sql);
 };
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;await new Promise(resolve=>server.close(resolve));});
 const get=async(path,extra='')=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/${path}?office_id=4&month=2026-09${extra}`,{headers:{Cookie:'ibm_session=test'}});
  assert.equal(response.status,200);
  return response.json();
 };
 for(const mode of ['live','processed']){
  processed=mode==='processed';
  onlyZero=false;
  const report=await get('report');
  assert.equal(report.processed,processed);
  assert.deepEqual(report.rows.map(row=>row.customer_id),['gns401','gns402','gns410']);
  assert.equal(report.count,3);
  assert.deepEqual([report.monthly,report.previous_due,report.total_due,report.paid,report.balance,report.profit],['600.00','350.00','950.00','100.00','850.00','50.00']);
  const zero=report.rows[0];
  assert.equal(zero.customer_name,'শূন্য বিল');
  assert.equal(zero.address,'Address 2');
  assert.equal(zero.total_due,'0.00');
  assert.ok(report.rows.every(row=>!Object.hasOwn(row,'pppoe_password')));
  const slips=await get('slips');
  assert.equal(slips.rows.length,3);
  assert.equal(slips.rows.find(row=>row.customer_db_id===2).total_due,'0.00');
  const pos=await get('slips','&customer_db_id=2');
  assert.equal(pos.rows.length,1);
  assert.equal(pos.rows[0].customer_name,'শূন্য বিল');
  assert.equal(pos.rows[0].total_due,'0.00');

  onlyZero=true;
  const zeroReport=await get('report');
  assert.equal(zeroReport.count,1);
  assert.deepEqual([zeroReport.monthly,zeroReport.previous_due,zeroReport.total_due,zeroReport.paid,zeroReport.balance,zeroReport.profit],Array(6).fill('0.00'));
  assert.equal((await get('slips')).rows.length,1);
 }
});

test('274 customers including nine zero bills produce 274 report rows',async t=>{
 const originalQuery=pool.query;
 let processed=false;
 const customers=Array.from({length:274},(_,index)=>({
  id:index+1,office_id:4,customer_id:`gns${401+index}`,customer_name:`Customer ${index+1}`,
  monthly_bill:index<265?'600.00':'0.00',previous_due:'0.00',status:'active'
 }));
 pool.query=async(sql)=>{
  if(sql.includes('FROM ib_sessions'))return {rows:[{id:7,role:'Super Admin',office_id:0}]};
  if(sql.startsWith('SELECT * FROM ib_bill_batches'))return {rows:processed?[{id:9}]:[]};
  if(sql.includes('FROM ib_bill_batches')&&sql.includes('bill_month<$2'))return {rows:[]};
  if(sql.includes('SELECT * FROM ib_customers'))return {rows:customers};
  if(sql.includes('GROUP BY customer_db_id'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM ib_bill_lines'))return {rows:customers.map(row=>({
   ...row,customer_db_id:row.id,total_due:row.monthly_bill,paid_amount:'0.00',balance_due:row.monthly_bill
  }))};
  if(sql.startsWith('SELECT id,pppoe_username,address,status FROM ib_customers'))return {rows:customers.map(({id,status})=>({id,status}))};
  if(sql.includes('FROM ib_isp_payments'))return {rows:[{n:'0.00'}]};
  throw Error('Unexpected query: '+sql);
 };
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;await new Promise(resolve=>server.close(resolve));});
 const get=async(path)=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/${path}?office_id=4&month=2026-10`,{headers:{Cookie:'ibm_session=test'}});
  assert.equal(response.status,200);
  return response.json();
 };
 const customerList=await get('entities/customers');
 assert.equal(customerList.length,274);
 for(const mode of ['live','processed']){
  processed=mode==='processed';
  const report=await get('report');
  assert.equal(report.count,customerList.length);
  assert.equal(report.rows.length,274);
  assert.equal(report.rows.filter(row=>Number(row.total_due)>0).length,265);
  assert.equal(report.rows.filter(row=>Number(row.total_due)===0).length,9);
  assert.deepEqual(report.rows.map(row=>row.customer_db_id).sort((a,b)=>a-b),customerList.map(row=>row.id).sort((a,b)=>a-b));
  assert.equal(report.total_due,'159000.00');
 }
});
