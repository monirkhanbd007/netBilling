import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {pool,tx,one} from '../src/db.js';import {setup} from './init.js';
const tables=['ib_offices','ib_users','ib_packages','ib_customers','ib_bill_batches','ib_bill_lines','ib_payments','ib_isp_payments','ib_office_expenses','ib_staff_salary','ib_line_transfer','ib_new_line','ib_settings'];
async function main(){const filename=process.argv[2];if(!filename||process.argv[3]!=='--confirm')throw Error('Usage: npm run restore -w server -- /path/to/backup.json --confirm');
 const data=JSON.parse(await fs.readFile(filename,'utf8'));if(data.format!=='IBM_PG_V1'||!Array.isArray(data.tables)||data.tables.length!==tables.length)throw Error('Invalid PostgreSQL backup format.');
 const map=new Map(data.tables.map(t=>[t.key,t]));if(map.size!==tables.length||tables.some(t=>!Array.isArray(map.get(t)?.rows)))throw Error('Backup tables are incomplete.');
 await setup();const dir=path.resolve('recovery-backups');await fs.mkdir(dir,{recursive:true,mode:0o700});
 const safePath=path.join(dir,`before-restore-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
 await tx(async db=>{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');const before=[];for(const t of tables)before.push({key:t,rows:(await db.query(`SELECT * FROM ${t}`)).rows});await fs.writeFile(safePath,JSON.stringify({format:'IBM_PG_V1',created_at:new Date().toISOString(),tables:before}),{mode:0o600});});
 await tx(async db=>{
  await db.query('DELETE FROM ib_sessions');
  for(const t of [...tables].reverse())await db.query(`DELETE FROM ${t}`);
  for(const t of tables){const allowed=(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[t])).rows.map(x=>x.column_name);
   for(const row of map.get(t).rows){if(Object.keys(row).some(k=>!allowed.includes(k)))throw Error(`Unknown field in ${t}.`);const keys=Object.keys(row);if(!keys.length)continue;
    await db.query(`INSERT INTO ${t}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>t==='ib_settings'&&k==='value'?JSON.stringify(row[k]):row[k]));
   }
   if(t!=='ib_settings')await db.query(`SELECT setval(pg_get_serial_sequence('${t}','id'),GREATEST((SELECT COALESCE(MAX(id),0) FROM ${t}),1),true)`);
  }
  const admins=await one(db,"SELECT COUNT(*) AS n FROM ib_users WHERE role='Super Admin' AND status='active'");if(!Number(admins.n))throw Error('Backup has no active Super Admin. Restore rolled back.');
 });console.log('Restore completed. Safety backup: '+safePath);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{await main();}catch(e){console.error(e.message);process.exitCode=1;}finally{await pool.end();}}
