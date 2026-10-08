import test from 'node:test';
import assert from 'node:assert/strict';
import {backupTables,createOfficeBackupSnapshot} from '../src/backup.js';
import {restoreOfficeBackupSnapshot,validateOfficeBackupSnapshot} from '../src/office-restore.js';

const records={
 ib_offices:[{id:1,office_name:'Gazipur Network System'},{id:2,office_name:'GNS-2'}],
 ib_users:[{id:1,office_id:1,name:'One'},{id:2,office_id:2,name:'Two'}],
 ib_packages:[{id:11,office_id:1},{id:22,office_id:2}],
 ib_customers:[{id:111,office_id:1,customer_id:'one'},{id:222,office_id:2,customer_id:'two'}],
 ib_bill_batches:[{id:1111,office_id:1},{id:2222,office_id:2}],
 ib_bill_lines:[{id:11111,batch_id:1111},{id:22222,batch_id:2222}],
 ib_payments:[{id:3,office_id:1},{id:4,office_id:2}],
 ib_isp_payments:[{id:5,office_id:1},{id:6,office_id:2}],
 ib_office_expenses:[{id:7,office_id:1},{id:8,office_id:2}],
 ib_staff_salary:[{id:9,office_id:1},{id:10,office_id:2}],
 ib_line_transfer:[{id:13,customer_db_id:111},{id:14,customer_db_id:222}],
 ib_new_line:[{id:15,customer_db_id:111},{id:16,customer_db_id:222}],
 ib_settings:[{key:'support_phone_office_1',value:'111'},{key:'support_phone_office_2',value:'222'},{key:'support_phone',value:'shared'}]
};

async function officeBackup(){
 const db={async query(sql,params){
  if(sql.startsWith('SET TRANSACTION'))return {rows:[]};
  const name=sql.match(/FROM (ib_\w+)/)?.[1];
  assert.ok(name,sql);
  if(name==='ib_offices')return {rows:records[name].filter(row=>row.id===params[0])};
  if(name==='ib_settings')return {rows:records[name].filter(row=>params[0].includes(row.key))};
  if(name==='ib_bill_lines')return {rows:records[name].filter(row=>row.batch_id===1111)};
  if(name==='ib_line_transfer'||name==='ib_new_line')return {rows:records[name].filter(row=>row.customer_db_id===111)};
  assert.match(sql,/WHERE office_id=\$1/,sql);
  return {rows:records[name].filter(row=>row.office_id===params[0])};
 }};
 return createOfficeBackupSnapshot(db,1,new Date('2026-10-08T00:00:00Z'));
}

test('selected-office backup includes related records and excludes the other office',async()=>{
 const snapshot=await officeBackup();
 assert.equal(snapshot.format,'IBM_PG_OFFICE_V1');
 assert.equal(snapshot.office_id,1);
 assert.deepEqual(snapshot.tables.map(table=>table.key),backupTables);
 for(const table of snapshot.tables)assert.equal(table.rows.length,1,table.key);
 assert.equal(snapshot.tables.find(table=>table.key==='ib_customers').rows[0].customer_id,'one');
 assert.equal(snapshot.tables.find(table=>table.key==='ib_bill_lines').rows[0].batch_id,1111);
 assert.equal(snapshot.tables.find(table=>table.key==='ib_settings').rows[0].key,'support_phone_office_1');
 assert.doesNotThrow(()=>validateOfficeBackupSnapshot(snapshot,1));
});

test('office restore rejects rows from another office and scopes every delete',async()=>{
 const snapshot=await officeBackup();
 const contaminated=structuredClone(snapshot);
 contaminated.tables.find(table=>table.key==='ib_payments').rows.push(records.ib_payments[1]);
 assert.throws(()=>validateOfficeBackupSnapshot(contaminated,1),/another office/);
 assert.throws(()=>validateOfficeBackupSnapshot(snapshot,2),/office ID/);
 const queries=[];
 const db={async query(sql,params=[]){
  queries.push({sql,params});
  if(sql.startsWith('SELECT column_name')){
   const row=snapshot.tables.find(table=>table.key===params[0]).rows[0];
   return {rows:Object.keys(row||{}).map(column_name=>({column_name}))};
  }
  return {rows:[]};
 }};
 await restoreOfficeBackupSnapshot(db,snapshot,1);
 const deletes=queries.filter(query=>query.sql.startsWith('DELETE'));
 assert.ok(deletes.length>=backupTables.length-1);
 assert.ok(deletes.every(query=>query.sql.includes('WHERE')));
 assert.ok(deletes.every(query=>query.params[0]===1||Array.isArray(query.params[0])));
 assert.equal(queries.filter(query=>query.sql.startsWith('INSERT')).length,backupTables.length);
});
