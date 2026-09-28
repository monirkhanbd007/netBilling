import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import bcrypt from 'bcryptjs';
import {entities} from './entities.js';
import {pool} from './db.js';

test('only a Super Admin can change a Super Admin password with All offices access',async t=>{
 const originalQuery=pool.query;
 let updated;
 pool.query=async(sql,params)=>{
  if(sql.startsWith('SELECT * FROM ib_users'))return {rows:[{id:1,role:'Super Admin',office_id:0}]};
  if(sql.startsWith('UPDATE ib_users')){updated={sql,params};return {rows:[{id:1,role:'Super Admin',office_id:params[0],password:params.at(-2)}]};}
  throw Error('Unexpected query: '+sql);
 };
 const app=express();app.use(express.json());
 app.use((req,res,next)=>{req.user={id:1,role:req.headers['x-test-role'],office_id:0};next();});
 app.use('/entities',entities);
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;await new Promise(resolve=>server.close(resolve));});
 const change=(role,password)=>fetch(`http://127.0.0.1:${server.address().port}/entities/users/1`,{
  method:'PUT',headers:{'Content-Type':'application/json','x-test-role':role},
  body:JSON.stringify({office_id:2,name:'Monir',username:'monir',role:'Super Admin',status:'active',password})
 });
 assert.equal((await change('Office Admin','new-password-123')).status,403);
 assert.equal(updated,undefined);
 assert.equal((await change('Super Admin','')).status,400);
 assert.equal(updated,undefined);
 assert.equal((await change('Super Admin','short')).status,400);
 assert.equal(updated,undefined);
 const response=await change('Super Admin','new-password-123');
 assert.equal(response.status,200);
 assert.equal(Object.hasOwn(await response.json(),'password'),false);
 const values=Object.fromEntries(updated.sql.match(/SET (.+) WHERE/)[1].split(',').map((part,i)=>[part.split('=')[0],updated.params[i]]));
 assert.equal(values.office_id,0);
 assert.equal(await bcrypt.compare('new-password-123',values.password),true);
});
