import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pool,tx} from '../src/db.js';
import {createBackupSnapshot} from '../src/backup.js';
import {restoreOfficeBackupSnapshot,validateOfficeBackupSnapshot} from '../src/office-restore.js';
import {setup} from './init.js';

async function main(){
 const [filename,flag,rawOfficeId,confirm]=process.argv.slice(2);
 const officeId=Number(rawOfficeId);
 if(!filename||flag!=='--office-id'||!Number.isSafeInteger(officeId)||officeId<1||confirm!=='--confirm')throw Error('Usage: npm run restore-office -w backend -- /path/to/office-backup.json --office-id N --confirm');
 const data=JSON.parse(await fs.readFile(filename,'utf8'));
 validateOfficeBackupSnapshot(data,officeId);
 await setup();
 const dir=path.resolve('recovery-backups');
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 const safePath=path.join(dir,`before-office-${officeId}-restore-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
 const before=await tx(db=>createBackupSnapshot(db));
 await fs.writeFile(safePath,JSON.stringify(before),{mode:0o600});
 await tx(db=>restoreOfficeBackupSnapshot(db,data,officeId));
 console.log(`Office ${officeId} restore completed. Full database safety backup: ${safePath}`);
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{await main();}catch(error){console.error(error.message);process.exitCode=1;}finally{await pool.end();}
}
