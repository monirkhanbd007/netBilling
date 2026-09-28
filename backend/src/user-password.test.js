import assert from 'node:assert/strict';
import {test} from 'node:test';
import bcrypt from 'bcryptjs';
import app from './index.js';
import {pool} from './db.js';

test('users change only their own passwords after confirming the current password',async t=>{
 const originalQuery=pool.query;
 let actorRole='Super Admin';
 let passwordHash=await bcrypt.hash('old-password-123',4);
 let managementUpdate;
 pool.query=async(sql,params)=>{
  if(sql.startsWith('SELECT u.id,u.name,u.username,u.role,u.office_id FROM ib_sessions'))
   return {rows:[{id:1,name:'Monir',username:'monir',role:actorRole,office_id:actorRole==='Super Admin'?0:1}]};
  if(sql.startsWith('SELECT * FROM ib_users WHERE id=$1'))return {rows:[{id:2,role:'Super Admin',office_id:0}]};
  if(sql.startsWith('SELECT password FROM ib_users WHERE id=$1'))return {rows:[{password:passwordHash}]};
  if(sql.startsWith('UPDATE ib_users SET password=$1 WHERE id=$2 AND password=$3 RETURNING id')){
   if(params[1]!==1||params[2]!==passwordHash)return {rows:[]};
   passwordHash=params[0];return {rows:[{id:1}]};
  }
  if(sql.startsWith('UPDATE ib_users SET')){
   managementUpdate={sql,params};return {rows:[{id:2,name:'Other',role:'Super Admin',office_id:0}]};
  }
  throw Error('Unexpected query: '+sql);
 };
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;await new Promise(resolve=>server.close(resolve));});
 const put=(path,body,signedIn=true)=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{
  method:'PUT',headers:{'Content-Type':'application/json',...(signedIn?{Cookie:'ibm_session=test-token'}:{})},body:JSON.stringify(body)
 });

 assert.equal((await put('/api/entities/users/2',{role:'Super Admin',office_id:2,password:'hacked-password'})).status,403);
 assert.equal(managementUpdate,undefined);
 assert.equal((await put('/api/entities/users/2',{role:'Super Admin',office_id:2,name:'Other'})).status,200);
 assert.equal(managementUpdate.sql.includes('password='),false);
 assert.equal(managementUpdate.params[0],0);

 assert.equal((await put('/api/me/password',{current_password:'old-password-123',new_password:'new-password-123'},false)).status,401);
 assert.equal((await put('/api/me/password',{current_password:'wrong-password',new_password:'new-password-123'})).status,403);
 assert.equal(await bcrypt.compare('old-password-123',passwordHash),true);
 assert.equal((await put('/api/me/password',{current_password:'old-password-123',new_password:'short'})).status,400);
 assert.equal((await put('/api/me/password',{current_password:'old-password-123',new_password:'new-password-123'})).status,200);
 assert.equal(await bcrypt.compare('new-password-123',passwordHash),true);
 assert.equal((await put('/api/me/password',{current_password:'old-password-123',new_password:'another-password'})).status,403);

 actorRole='Office Admin';
 assert.equal((await put('/api/me/password',{current_password:'new-password-123',new_password:'office-password-123'})).status,200);
 assert.equal(await bcrypt.compare('office-password-123',passwordHash),true);
});
