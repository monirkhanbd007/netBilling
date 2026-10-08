import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {test} from 'node:test';
import bcrypt from 'bcryptjs';
import {allOfficeAccess,changeOwnPassword,paymentCollectorRoute,requireOffice,scope} from './auth.js';
import {pool} from './db.js';

test('all-office users can select a real office without gaining Super Admin status',()=>{
 const user={role:'Payment Collector',office_id:0};
 assert.equal(allOfficeAccess(user),true);
 assert.equal(requireOffice(user,scope(user,4)),4);
 assert.throws(()=>requireOffice(user,scope(user,0)),{status:403});
});

test('single-office users remain scoped to their assigned office',()=>{
 const user={role:'Payment Collector',office_id:4};
 assert.equal(allOfficeAccess(user),false);
 assert.equal(requireOffice(user,scope(user,9)),4);
 assert.throws(()=>requireOffice(user,9),{status:403});
});

test('payment collector API permits collecting and printing but not management or reversals',()=>{
 for(const [method,path] of [['GET','/me'],['GET','/entities/offices'],['GET','/bills'],['GET','/payments'],['GET','/payments/12'],['POST','/payments'],['GET','/slips'],['PUT','/me/password'],['POST','/logout']]){
  assert.equal(paymentCollectorRoute(method,path),true,`${method} ${path}`);
 }
 for(const [method,path] of [['GET','/dashboard'],['GET','/entities/customers'],['GET','/entities/users'],['GET','/report'],['GET','/backup'],['POST','/bills/process'],['DELETE','/payments/12'],['PUT','/settings']]){
  assert.equal(paymentCollectorRoute(method,path),false,`${method} ${path}`);
 }
});

test('changing a password revokes other sessions but keeps the current session',async t=>{
 const originalQuery=pool.query,originalConnect=pool.connect;
 let hash=await bcrypt.hash('previous-password',4),revocation;
 pool.query=async sql=>{
  if(sql==='SELECT password FROM ib_users WHERE id=$1')return {rows:[{password:hash}]};
  throw Error('Unexpected query: '+sql);
 };
 pool.connect=async()=>({release(){},async query(sql,params){
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
  if(sql.startsWith('UPDATE ib_users SET password=')){assert.equal(params[2],hash);hash=params[0];return {rows:[{id:7}]};}
  if(sql==='DELETE FROM ib_sessions WHERE user_id=$1 AND token_hash<>$2'){revocation=params;return {rows:[]};}
  throw Error('Unexpected query: '+sql);
 }});
 t.after(()=>{pool.query=originalQuery;pool.connect=originalConnect;});
 await changeOwnPassword({id:7},'previous-password','replacement-password','current-session-token');
 assert.equal(await bcrypt.compare('replacement-password',hash),true);
 assert.deepEqual(revocation,[7,crypto.createHash('sha256').update('current-session-token').digest('hex')]);
});
