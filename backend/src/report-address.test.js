import assert from 'node:assert/strict';
import {test} from 'node:test';
import app from './index.js';
import {pool} from './db.js';

test('processed report returns current customer addresses in Customer ID order',async t=>{
 const originalQuery=pool.query;
 const bill=(id,customer_db_id)=>({id:customer_db_id,customer_db_id,customer_id:id,customer_name:id,mobile:'',area:'Old area',monthly_bill:'100.00',previous_due:'0.00',total_due:'100.00',paid_amount:'0.00',balance_due:'100.00'});
 pool.query=async(sql)=>{
  if(sql.startsWith('SELECT u.id,u.name,u.username,u.role,u.office_id FROM ib_sessions'))return {rows:[{id:1,name:'Admin',username:'admin',role:'Super Admin',office_id:0}]};
  if(sql.startsWith('SELECT * FROM ib_bill_batches'))return {rows:[{id:9}]};
  if(sql.startsWith('SELECT * FROM ib_bill_lines'))return {rows:[bill('gns445mehedi',2),bill('gin401',3)]};
  if(sql.startsWith('SELECT id,pppoe_username,address FROM ib_customers'))return {rows:[
   {id:2,pppoe_username:'pppoe-2',address:'House 45, North Road'},
   {id:3,pppoe_username:'pppoe-3',address:'House 4, South Road'}
  ]};
  if(sql.startsWith('SELECT COALESCE(SUM(amount),0) AS n FROM ib_isp_payments'))return {rows:[{n:'0.00'}]};
  throw Error('Unexpected query: '+sql);
 };
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;await new Promise(resolve=>server.close(resolve));});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/report?office_id=1&month=2026-09`,{headers:{Cookie:'ibm_session=test-token'}});
 assert.equal(response.status,200);
 const report=await response.json();
 assert.equal(report.processed,true);
 assert.deepEqual(report.rows.map(row=>[row.customer_id,row.address]),[
  ['gin401','House 4, South Road'],['gns445mehedi','House 45, North Road']
 ]);
});
