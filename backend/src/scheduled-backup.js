import {timingSafeEqual} from 'node:crypto';
import {createBackupSnapshot,encryptBackup} from './backup.js';
import {tx} from './db.js';

const dateFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'});

export function dhakaDate(date=new Date()){
 const parts=Object.fromEntries(dateFormatter.formatToParts(date).map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}

export function validBackupBearer(header,secret){
 if(typeof secret!=='string'||secret.length<32||typeof header!=='string')return false;
 const expected=Buffer.from(`Bearer ${secret}`),received=Buffer.from(header);
 return expected.length===received.length&&timingSafeEqual(expected,received);
}

export async function scheduledBackup({transaction=tx,key=process.env.BACKUP_ENCRYPTION_KEY,now=new Date(),backupDate=dhakaDate(now)}={}){
 if(!key)throw Error('BACKUP_ENCRYPTION_KEY is not configured.');
 const snapshot=await transaction(db=>createBackupSnapshot(db,now));
 return {filename:`internet-business-backup-${backupDate}.json.enc`,bytes:encryptBackup(snapshot,key)};
}
