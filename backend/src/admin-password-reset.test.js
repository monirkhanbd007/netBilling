import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {test} from 'node:test';
import bcrypt from 'bcryptjs';
import app from './index.js';
import {pool} from './db.js';

test('a signed-in Super Admin can reset a user password without the current password and revoke sessions',async t=>{
 const originalQuery=pool.query,originalConnect=pool.connect;
 const accounts=new Map([
  [1,{id:1,name:'Admin',username:'admin',role:'Super Admin',office_id:0,password:await bcrypt.hash('admin-password',4)}],
  [2,{id:2,name:'Office',username:'office',role:'Office Admin',office_id:1,password:await bcrypt.hash('office-password',4)}]
 ]);
 const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
 const sessions=new Map([[hash('admin-token'),1],[hash('office-token'),2]]);
 let transactionCount=0;
 pool.query=async(sql,params)=>{
  if(sql.startsWith('SELECT u.id,u.name,u.username,u.role,u.office_id FROM ib_sessions')){
   const account=accounts.get(sessions.get(params[0]));
   return {rows:account?[{id:account.id,name:account.name,username:account.username,role:account.role,office_id:account.office_id}]:[]};
  }
  throw Error('Unexpected query: '+sql);
 };
 pool.connect=async()=>({
  async query(sql,params){
   if(sql==='BEGIN'){transactionCount++;return {rows:[]};}
   if(sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
   if(sql==='UPDATE ib_users SET password=$1 WHERE id=$2 RETURNING id'){
    const account=accounts.get(params[1]);
    if(!account)return {rows:[]};
    account.password=params[0];return {rows:[{id:account.id}]};
   }
   if(sql==='DELETE FROM ib_sessions WHERE user_id=$1'){
    for(const [token,id] of sessions)if(id===params[0])sessions.delete(token);
    return {rows:[]};
   }
   throw Error('Unexpected transaction query: '+sql);
  },
  release(){}
 });
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;pool.connect=originalConnect;await new Promise(resolve=>server.close(resolve));});
 const put=(id,body,token='admin-token')=>fetch(`http://127.0.0.1:${server.address().port}/api/users/${id}/password-reset`,{
  method:'PUT',headers:{'Content-Type':'application/json',Cookie:`ibm_session=${token}`},body:JSON.stringify(body)
 });
 const request={new_password:'new-office-password'};
 assert.equal((await put(2,request,'office-token')).status,403);
 assert.equal((await put(2,{...request,new_password:'short'})).status,400);
 assert.equal((await put(2,request,'missing-token')).status,401);
 assert.equal(transactionCount,0);
 assert.equal((await put(999,request)).status,404);
 assert.equal((await put(2,request)).status,200);
 assert.equal(await bcrypt.compare(request.new_password,accounts.get(2).password),true);
 assert.equal(await bcrypt.compare('admin-password',accounts.get(1).password),true);
 assert.equal(sessions.has(hash('office-token')),false);
 assert.equal(sessions.has(hash('admin-token')),true);
 assert.equal((await put(1,{new_password:'new-admin-password'})).status,200);
 assert.equal(sessions.has(hash('admin-token')),false);
 assert.equal((await put(2,request)).status,401);
});
