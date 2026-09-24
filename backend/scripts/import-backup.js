import fs from 'node:fs/promises';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';
import bcrypt from 'bcryptjs';import {pool,tx,one} from '../src/db.js';import {setup} from './init.js';
const tables=['ib_offices','ib_users','ib_packages','ib_customers','ib_bill_batches','ib_bill_lines','ib_payments','ib_isp_payments','ib_office_expenses','ib_staff_salary','ib_line_transfer','ib_new_line'];
const nullableDates=new Set(['connection_date','payment_date','expense_date','entry_date','transfer_date']);
async function run(){
 const name=process.argv[2];if(!name)throw new Error('Usage: npm run import -w server -- /path/to/backup.ibmbak.gz');
 const raw=await fs.readFile(name),data=raw[0]===31&&raw[1]===139?zlib.gunzipSync(raw):raw;
 const backup=JSON.parse(data.toString('utf8'));if(backup.format!=='IBM_BACKUP_V1'||!Array.isArray(backup.tables))throw new Error('Expected IBM_BACKUP_V1 backup.');
 const byKey=new Map(backup.tables.map(t=>[t.key,t]));for(const [key,item] of byKey)if(!/^ib_[A-Za-z0-9_]+$/.test(key)||!Array.isArray(item.rows))throw new Error('Invalid backup table.');
 await setup();
 const user=process.env.BOOTSTRAP_USER,password=process.env.BOOTSTRAP_PASSWORD;
 if(!user||!password||password.length<12)throw new Error('Set BOOTSTRAP_USER and BOOTSTRAP_PASSWORD (12+ characters) to create a new Super Admin after import.');
 await tx(async db=>{
  for(const t of tables.filter(t=>t!=='ib_users')){const x=await one(db,`SELECT COUNT(*) AS n FROM ${t}`);if(Number(x.n))throw new Error('Import requires an empty database; existing records were not changed.');}
  const existing=await db.query('SELECT id,role FROM ib_users');
  if(existing.rows.length>1||existing.rows.some(x=>x.role!=='Super Admin'))throw new Error('Import requires an empty database or only one bootstrap admin.');
  await db.query('DELETE FROM ib_sessions');await db.query('DELETE FROM ib_users');
  let count=0;
  for(const table of tables){
   const rows=byKey.get(table)?.rows||[],cols=(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[table])).rows.map(x=>x.column_name);
   for(const row of rows){const keys=Object.keys(row).filter(k=>cols.includes(k));if(!keys.length)continue;
    const values=keys.map(k=>nullableDates.has(k)&&row[k]==='0000-00-00'?null:row[k]);
    await db.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,values);count++;
   }
   await db.query(`SELECT setval(pg_get_serial_sequence('${table}','id'),GREATEST((SELECT COALESCE(MAX(id),0) FROM ${table}),1),true)`);
  }
  let username=user,suffix=1;
  while(await one(db,'SELECT 1 FROM ib_users WHERE username=$1',[username]))username=`${user}-${++suffix}`;
  const hash=await bcrypt.hash(password,12);
  await db.query("INSERT INTO ib_users(office_id,name,username,password,role,status) VALUES(0,'System Administrator',$1,$2,'Super Admin','active')",[username,hash]);
  console.log(`Imported ${count} rows. Login with new administrator: ${username}`);
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{await run();}catch(e){console.error(e.message);process.exitCode=1;}finally{await pool.end();}
}
