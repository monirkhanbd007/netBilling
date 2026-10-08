import {backupTables} from './backup.js';

const directOfficeTables=['ib_users','ib_packages','ib_customers','ib_bill_batches','ib_payments','ib_isp_payments','ib_office_expenses','ib_staff_salary'];
const officeSettings=id=>[`support_phone_office_${id}`,`payment_numbers_office_${id}`,`expense_types_office_${id}`];
const sameId=(left,right)=>String(left)===String(right);

export function validateOfficeBackupSnapshot(data,officeId){
 if(!Number.isSafeInteger(officeId)||officeId<1||data?.format!=='IBM_PG_OFFICE_V1'||!sameId(data.office_id,officeId)||!Array.isArray(data.tables)||data.tables.length!==backupTables.length)throw Error('Invalid office backup format or office ID.');
 const map=new Map(data.tables.map(table=>[table.key,table]));
 if(map.size!==backupTables.length||backupTables.some(name=>!Array.isArray(map.get(name)?.rows)))throw Error('Office backup tables are incomplete.');
 const offices=map.get('ib_offices').rows;
 if(offices.length!==1||!sameId(offices[0].id,officeId)||offices[0].office_name!==data.office_name)throw Error('Office backup does not contain the selected office.');
 for(const name of directOfficeTables)if(map.get(name).rows.some(row=>!sameId(row.office_id,officeId)))throw Error(`Office backup contains another office in ${name}.`);
 const batches=new Set(map.get('ib_bill_batches').rows.map(row=>String(row.id)));
 if(map.get('ib_bill_lines').rows.some(row=>!batches.has(String(row.batch_id))))throw Error('Office backup contains a bill line from another office.');
 const customers=new Set(map.get('ib_customers').rows.map(row=>String(row.id)));
 for(const name of ['ib_line_transfer','ib_new_line'])if(map.get(name).rows.some(row=>!customers.has(String(row.customer_db_id))))throw Error(`Office backup contains another office in ${name}.`);
 const settings=new Set(officeSettings(officeId));
 if(map.get('ib_settings').rows.some(row=>!settings.has(row.key)))throw Error('Office backup contains shared or another office settings.');
 return map;
}

export async function restoreOfficeBackupSnapshot(db,data,officeId){
 const map=validateOfficeBackupSnapshot(data,officeId);
 await db.query('DELETE FROM ib_line_transfer WHERE customer_db_id IN (SELECT id FROM ib_customers WHERE office_id=$1)',[officeId]);
 await db.query('DELETE FROM ib_new_line WHERE customer_db_id IN (SELECT id FROM ib_customers WHERE office_id=$1)',[officeId]);
 await db.query('DELETE FROM ib_payments WHERE office_id=$1',[officeId]);
 await db.query('DELETE FROM ib_bill_lines WHERE batch_id IN (SELECT id FROM ib_bill_batches WHERE office_id=$1)',[officeId]);
 for(const name of ['ib_bill_batches','ib_isp_payments','ib_office_expenses','ib_staff_salary','ib_customers','ib_packages','ib_users'])await db.query(`DELETE FROM ${name} WHERE office_id=$1`,[officeId]);
 await db.query('DELETE FROM ib_settings WHERE key=ANY($1::text[])',[officeSettings(officeId)]);
 await db.query('DELETE FROM ib_offices WHERE id=$1',[officeId]);
 for(const name of backupTables){
  const allowed=new Set((await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[name])).rows.map(row=>row.column_name));
  for(const row of map.get(name).rows){
   const keys=Object.keys(row);
   if(!keys.length||keys.some(key=>!allowed.has(key)))throw Error(`Unknown field in ${name}. Restore rolled back.`);
   await db.query(`INSERT INTO ${name}(${keys.join(',')}) VALUES(${keys.map((_,index)=>'$'+(index+1)).join(',')})`,keys.map(key=>name==='ib_settings'&&key==='value'?JSON.stringify(row[key]):row[key]));
  }
  if(name!=='ib_settings')await db.query(`SELECT setval(pg_get_serial_sequence('${name}','id'),GREATEST((SELECT COALESCE(MAX(id),0) FROM ${name}),1),true)`);
 }
}
