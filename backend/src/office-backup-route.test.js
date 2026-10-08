import assert from 'node:assert/strict';
import {test} from 'node:test';
import app from './index.js';
import {pool} from './db.js';

test('manual backup follows the selected office while the full backup stays available',async t=>{
 const originalQuery=pool.query,originalConnect=pool.connect;
 const records={
  ib_offices:[{id:1,office_name:'Gazipur Network System'},{id:2,office_name:'GNS-2'}],
  ib_customers:[{id:11,office_id:1,customer_id:'one'},{id:22,office_id:2,customer_id:'two'}]
 };
 pool.query=async sql=>{
  if(sql.includes('FROM ib_sessions'))return {rows:[{id:7,role:'Super Admin',office_id:0}]};
  throw Error('Unexpected pool query: '+sql);
 };
 pool.connect=async()=>({release(){},async query(sql,params=[]){
  if(['BEGIN','COMMIT','ROLLBACK','SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'].includes(sql))return {rows:[]};
  const name=sql.match(/^SELECT \* FROM (ib_\w+)/)?.[1];
  if(!name)throw Error('Unexpected backup query: '+sql);
  const rows=records[name]||[];
  if(!sql.includes('WHERE'))return {rows};
  if(name==='ib_offices')return {rows:rows.filter(row=>row.id===params[0])};
  if(name==='ib_settings')return {rows:[]};
  return {rows:rows.filter(row=>row.office_id===params[0])};
 }});
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;pool.connect=originalConnect;await new Promise(resolve=>server.close(resolve));});
 const get=path=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{headers:{Cookie:'ibm_session=test'}});
 const selected=await get('/api/backup?office_id=2');
 assert.equal(selected.status,200);
 assert.match(selected.headers.get('x-backup-filename'),/office-2-backup/);
 const office=await selected.json();
 assert.equal(office.format,'IBM_PG_OFFICE_V1');
 assert.deepEqual(office.tables.find(table=>table.key==='ib_customers').rows.map(row=>row.customer_id),['two']);
 const full=await get('/api/backup');
 assert.equal(full.status,200);
 assert.equal((await full.json()).tables.find(table=>table.key==='ib_customers').rows.length,2);
 assert.equal((await get('/api/backup?office_id=999')).status,404);
 assert.equal((await get('/api/backup?office_id=invalid')).status,403);
});
