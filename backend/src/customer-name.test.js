import assert from 'node:assert/strict';
import {test} from 'node:test';
import app from './index.js';
import {pool} from './db.js';

test('customer names are unique within an office, including Bangla and simultaneous saves',async t=>{
 const originalQuery=pool.query,originalConnect=pool.connect;
 const customers=new Map([
  [1,{id:1,office_id:4,customer_id:'gns401monir',customer_name:'Monir Khan',mobile:'01700000000'}],
  [2,{id:2,office_id:4,customer_id:'gns402',customer_name:'বড় ভাই',mobile:'01800000000',status:'inactive'}],
  [3,{id:3,office_id:5,customer_id:'gns403',customer_name:'Other office',mobile:'01900000000'}],
  [4,{id:4,office_id:4,customer_id:'legacy',customer_name:'Monir Khan',mobile:'01700000000'}]
 ]);
 let nextId=5,actorOffice=0;
 const locks=new Map(),transactions=[];
 const query=async(sql,params=[])=>{
  if(sql.startsWith('SELECT u.id,u.name,u.username,u.role,u.office_id FROM ib_sessions'))return {rows:[{id:10,role:actorOffice?'Office Admin':'Super Admin',office_id:actorOffice}]};
  if(sql==='SELECT id FROM ib_offices WHERE id=$1')return {rows:[{id:params[0]}]};
  if(sql==='SELECT * FROM ib_customers WHERE id=$1'||sql==='SELECT * FROM ib_customers WHERE id=$1 FOR UPDATE')return {rows:customers.has(Number(params[0]))?[{...customers.get(Number(params[0]))}]:[]};
  if(sql==='SELECT id,customer_name FROM ib_customers WHERE office_id=$1')return {rows:[...customers.values()].filter(row=>row.office_id===Number(params[0])).map(row=>({...row}))};
  if(sql.startsWith('INSERT INTO ib_customers(')){
   const keys=sql.match(/ib_customers\(([^)]+)\)/)[1].split(',');
   const row={id:nextId++,...Object.fromEntries(keys.map((key,index)=>[key,params[index]]))};
   customers.set(row.id,row);return {rows:[{...row}]};
  }
  if(sql.startsWith('UPDATE ib_customers SET ')){
   const keys=sql.match(/SET (.+) WHERE/)[1].split(',').map(field=>field.split('=')[0]);
   const id=Number(params.at(-1)),row=customers.get(id);
   Object.assign(row,Object.fromEntries(keys.map((key,index)=>[key,params[index]])));
   return {rows:[{...row}]};
  }
  throw Error(`Unexpected query: ${sql}`);
 };
 pool.query=query;
 pool.connect=async()=>{
  let unlock;
  return {
   async query(sql,params){
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){
     transactions.push(sql);
     if(sql!=='BEGIN')unlock?.();
     return {rows:[]};
    }
    if(sql==='SELECT id FROM ib_offices WHERE id=$1 FOR UPDATE'){
     const office=Number(params[0]),previous=locks.get(office)||Promise.resolve();
     const locked=new Promise(resolve=>{unlock=resolve;});
     locks.set(office,previous.then(()=>locked));
     await previous;
     return {rows:[{id:office}]};
    }
    return query(sql,params);
   },
   release(){}
  };
 };
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;pool.connect=originalConnect;await new Promise(resolve=>server.close(resolve));});
 const request=(method,body,id='')=>fetch(`http://127.0.0.1:${server.address().port}/api/entities/customers${id?'/'+id:''}`,{
  method,headers:{'Content-Type':'application/json',Cookie:'ibm_session=test-token'},body:JSON.stringify(body)
 });
 const add=body=>request('POST',{office_id:4,customer_id:'gns500',...body});

 for(const customer_name of ['Monir Khan','  MONIR   khan  ','বড় ভাই','  '+ 'বড় ভাই'.normalize('NFD').replace(' ','\t')+'  ']){
  const response=await add({customer_name});
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/name already exists in this office/);
 }
 assert.equal(customers.size,4);
 const sharedNumber=await add({customer_name:'  New   Customer  ',mobile:'01700000000',customer_id:'gns401monir'});
 assert.equal(sharedNumber.status,201);
 assert.equal((await sharedNumber.json()).customer_name,'New Customer');
 assert.equal((await add({customer_name:'Monir Khan',office_id:5})).status,201);

 assert.equal((await request('PUT',{customer_name:'বড় ভাই'},1)).status,409);
 assert.equal(customers.get(1).customer_name,'Monir Khan');
 // A full form submission can still update its own name and shared number.
 assert.equal((await request('PUT',{customer_name:' MONIR  KHAN ',mobile:'01800000000'},1)).status,200);
 assert.equal(customers.get(1).mobile,'01800000000');
 assert.equal((await request('PUT',{customer_name:'Monir Khan'},3)).status,409);
 assert.equal((await request('PUT',{office_id:5},1)).status,409);
 assert.equal(customers.get(1).office_id,4);
 assert.equal((await request('PUT',{office_id:5,customer_name:'Moved Customer'},1)).status,200);
 assert.equal(customers.get(1).office_id,5);

 actorOffice=4;
 assert.equal((await request('PUT',{customer_name:'Renamed'},3)).status,403);
 // An office-scoped account cannot bypass the check by supplying another office.
 assert.equal((await add({customer_name:'বড় ভাই',office_id:5})).status,409);
 actorOffice=0;

 const concurrent=await Promise.all([add({customer_name:'একই নাম'}),add({customer_name:' একই   নাম '})]);
 assert.deepEqual(concurrent.map(response=>response.status).sort(),[201,409]);
 assert.equal([...customers.values()].filter(row=>row.customer_name==='একই নাম').length,1);
 assert.equal((await add({customer_name:'   '})).status,400);
 assert.equal((await add({customer_name:123})).status,400);
 assert.equal((await add({customer_name:'ক'.repeat(151)})).status,400);
 assert.ok(transactions.includes('ROLLBACK'));
 assert.ok(transactions.includes('COMMIT'));
});
