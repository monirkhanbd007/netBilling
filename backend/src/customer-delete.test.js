import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {test} from 'node:test';
import app from './index.js';
import {pool} from './db.js';

test('deleting a customer removes empty bill snapshots without erasing paid history',async t=>{
 const originalQuery=pool.query,originalConnect=pool.connect;
 const customers=new Map([
  [12,{id:12,office_id:4,customer_id:'test',customer_name:'monir'}],
  [13,{id:13,office_id:4,customer_id:'paid',customer_name:'Paid customer'}]
 ]);
 const lines=[
  {customer_db_id:12,monthly_bill:0,previous_due:0,total_due:0,paid_amount:0,balance_due:0},
  {customer_db_id:13,monthly_bill:600,previous_due:0,total_due:600,paid_amount:600,balance_due:0}
 ];
 const payments=new Set([13]);
 const tokenHash=crypto.createHash('sha256').update('admin-token').digest('hex');
 pool.query=async(sql,params)=>{
  if(sql.startsWith('SELECT u.id,u.name,u.username,u.role,u.office_id FROM ib_sessions')){
   assert.equal(params[0],tokenHash);
   return {rows:[{id:1,name:'Admin',username:'admin',role:'Super Admin',office_id:0}]};
  }
  throw Error(`Unexpected query: ${sql}`);
 };
 pool.connect=async()=>({
  async query(sql,params){
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
   if(sql==='SELECT * FROM ib_customers WHERE id=$1')return {rows:customers.has(Number(params[0]))?[customers.get(Number(params[0]))]:[]};
   if(sql==='SELECT 1 FROM ib_payments WHERE customer_db_id=$1 LIMIT 1')return {rows:payments.has(Number(params[0]))?[{one:1}]:[]};
   if(sql.startsWith('DELETE FROM ib_bill_lines WHERE customer_db_id=$1 AND monthly_bill=0')){
    for(let i=lines.length-1;i>=0;i--)if(lines[i].customer_db_id===Number(params[0])&&['monthly_bill','previous_due','total_due','paid_amount','balance_due'].every(key=>lines[i][key]===0))lines.splice(i,1);
    return {rows:[]};
   }
   if(sql==='DELETE FROM ib_customers WHERE id=$1'){customers.delete(Number(params[0]));return {rows:[]};}
   throw Error(`Unexpected transaction query: ${sql}`);
  },
  release(){}
 });
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;pool.connect=originalConnect;await new Promise(resolve=>server.close(resolve));});
 const remove=id=>fetch(`http://127.0.0.1:${server.address().port}/api/entities/customers/${id}`,{method:'DELETE',headers:{Cookie:'ibm_session=admin-token'}});
 assert.equal((await remove(12)).status,204);
 assert.equal(customers.has(12),false);
 assert.deepEqual(lines.map(line=>line.customer_db_id),[13]);
 assert.equal((await remove(13)).status,204);
 assert.equal(customers.has(13),false);
 assert.deepEqual(lines.map(line=>line.customer_db_id),[13]);
});
