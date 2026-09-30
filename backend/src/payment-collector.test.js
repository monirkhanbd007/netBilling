import assert from 'node:assert/strict';
import {test} from 'node:test';
import app from './index.js';
import {pool} from './db.js';

test('payment collector sees allowed offices and balances but not customer credentials or management routes',async t=>{
 const original=pool.query;
 pool.query=async(sql)=>{
  if(sql.includes('FROM ib_sessions'))return {rows:[{id:7,name:'Collector',username:'collector',role:'Payment Collector',office_id:0}]};
  if(sql.includes('FROM ib_offices')&&sql.includes('ORDER BY id DESC'))return {rows:[{id:4,office_name:'GNS-2'},{id:5,office_name:'Gazipur'}]};
  if(sql.includes('FROM ib_bill_batches'))return {rows:[]};
  if(sql.includes('SELECT * FROM ib_customers WHERE office_id='))return {rows:[{id:11,office_id:4,customer_id:'gns401',customer_name:'Example',pppoe_username:'router-user',pppoe_password:'secret',monthly_bill:'600.00',previous_due:'0.00',status:'active'}]};
  if(sql.includes('FROM ib_payments')&&sql.includes('GROUP BY customer_db_id'))return {rows:[]};
  throw Error(`Unexpected query: ${sql}`);
 };
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=original;await new Promise(resolve=>server.close(resolve));});
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const get=path=>fetch(base+path,{headers:{cookie:'ibm_session=test'}});
 const offices=await get('/entities/offices');
 assert.equal(offices.status,200);
 assert.equal((await offices.json()).length,2);
 const bill=await get('/bills?office_id=4&month=2026-09');
 assert.equal(bill.status,200);
 const row=(await bill.json()).rows[0];
 assert.equal(row.customer_id,'gns401');
 assert.equal(row.customer_status,'active');
 assert.equal(row.balance_due,'600.00');
 assert.equal(Object.hasOwn(row,'pppoe_password'),false);
 assert.equal(Object.hasOwn(row,'pppoe_username'),false);
 assert.equal((await get('/entities/customers')).status,403);
 assert.equal((await get('/dashboard?month=2026-09')).status,403);
 assert.equal((await fetch(base+'/payments/1',{method:'DELETE',headers:{cookie:'ibm_session=test'}})).status,403);
});
