import assert from 'node:assert/strict';
import test from 'node:test';
import app from './index.js';
import {pool} from './db.js';

test('October preview and processing use September remaining balances, then close September to new payments',async t=>{
 const originalQuery=pool.query,originalConnect=pool.connect;
 const customers=[
  {id:1,office_id:4,customer_id:'gns401',customer_name:'Partial payer',monthly_bill:'600.00',previous_due:'100.00',status:'active'},
  {id:2,office_id:4,customer_id:'gns402',customer_name:'Fully paid',monthly_bill:'500.00',previous_due:'50.00',status:'active'}
 ];
 let octoberBatch=null;
 const inserted=[];
 const query=async(sql,params=[])=>{
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
  if(sql.includes('FROM ib_sessions'))return {rows:[{id:7,name:'Admin',username:'admin',role:'Super Admin',office_id:0}]};
  if(sql.includes('FROM ib_offices WHERE id=$1 FOR UPDATE'))return {rows:[{id:4}]};
  if(sql.includes('FROM ib_bill_batches WHERE office_id=$1 AND bill_month>$2'))return {rows:params[1]==='2026-09'&&octoberBatch?[octoberBatch]:[]};
  if(sql.includes('FROM ib_bill_batches WHERE office_id=$1 AND bill_month<$2'))return {rows:params[1]==='2026-10'?[{id:9}]:[]};
  if(sql.includes('FROM ib_bill_batches WHERE office_id=$1 AND bill_month=$2'))return {rows:params[1]==='2026-10'&&octoberBatch?[octoberBatch]:params[1]==='2026-09'?[{id:9}]:[]};
  if(sql.includes('SELECT customer_db_id,balance_due FROM ib_bill_lines'))return {rows:[{customer_db_id:1,balance_due:'400.00'},{customer_db_id:2,balance_due:'0.00'}]};
  if(sql.includes('SELECT * FROM ib_customers WHERE office_id=$1'))return {rows:customers};
  if(sql.includes('GROUP BY customer_db_id'))return {rows:[]};
  if(sql.includes('SELECT COALESCE(SUM(amount),0) AS n FROM ib_payments'))return {rows:[{n:'0.00'}]};
  if(sql.includes('INSERT INTO ib_bill_batches')){octoberBatch={id:10,office_id:4,bill_month:'2026-10'};return {rows:[octoberBatch]};}
  if(sql.includes('INSERT INTO ib_bill_lines')){inserted.push(params);return {rows:[{id:100+inserted.length}]};}
  throw Error(`Unexpected query: ${sql}`);
 };
 pool.query=query;
 pool.connect=async()=>({query,release(){}});
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;pool.connect=originalConnect;await new Promise(resolve=>server.close(resolve));});
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const headers={cookie:'ibm_session=test','Content-Type':'application/json'};
 const preview=await fetch(`${base}/bills?office_id=4&month=2026-10`,{headers});
 assert.equal(preview.status,200);
 const rows=(await preview.json()).rows;
 assert.deepEqual(rows.map(row=>[row.previous_due,row.total_due]),[['400.00','1000.00'],['0.00','500.00']]);
 const processed=await fetch(`${base}/bills/process`,{method:'POST',headers,body:JSON.stringify({office_id:4,month:'2026-10'})});
 assert.equal(processed.status,201);
 assert.deepEqual(inserted.map(values=>[values[7],values[8]]),[['400.00','1000.00'],['0.00','500.00']]);
  const latePayment=await fetch(`${base}/payments`,{method:'POST',headers,body:JSON.stringify({office_id:4,month:'2026-09',customer_db_id:1,amount:'100.00',payment_date:'2026-10-01',payment_method:'Cash'})});
  assert.equal(latePayment.status,409);
  assert.match((await latePayment.json()).error,/carried into a later bill/);
  const reverseSeptember=await fetch(`${base}/bills/reverse`,{method:'POST',headers,body:JSON.stringify({office_id:4,month:'2026-09'})});
  assert.equal(reverseSeptember.status,409);
  assert.match((await reverseSeptember.json()).error,/later bill/);
});
