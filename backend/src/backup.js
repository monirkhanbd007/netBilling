import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const backupTables=['ib_offices','ib_users','ib_packages','ib_customers','ib_bill_batches','ib_bill_lines','ib_payments','ib_isp_payments','ib_office_expenses','ib_staff_salary','ib_line_transfer','ib_new_line','ib_settings'];

export async function createBackupSnapshot(db,createdAt=new Date()){
 await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const output={format:'IBM_PG_V1',created_at:createdAt.toISOString(),tables:[]};
 for(const name of backupTables)output.tables.push({key:name,rows:(await db.query(`SELECT * FROM ${name} ORDER BY ${name==='ib_settings'?'key':'id'}`)).rows});
 return output;
}

function encryptionKey(encoded){
 if(!/^[A-Za-z0-9+/]{43}=$/.test(String(encoded||'')))throw Error('BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
 const key=Buffer.from(encoded,'base64');
 if(key.length!==32||key.toString('base64')!==encoded)throw Error('BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
 return key;
}

export function encryptBackup(snapshot,encodedKey){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(encodedKey),iv);
 const data=Buffer.concat([cipher.update(gzipSync(JSON.stringify(snapshot))),cipher.final()]);
 return Buffer.from(JSON.stringify({format:'IBM_PG_ENCRYPTED_V1',algorithm:'AES-256-GCM',compression:'gzip',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}));
}

export function decryptBackup(envelope,encodedKey){
 if(envelope?.format!=='IBM_PG_ENCRYPTED_V1'||envelope.algorithm!=='AES-256-GCM'||envelope.compression!=='gzip')throw Error('Invalid encrypted backup format.');
 try{
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(encodedKey),Buffer.from(envelope.iv,'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  const plaintext=Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]);
  return JSON.parse(gunzipSync(plaintext).toString('utf8'));
 }catch{throw Error('Unable to decrypt backup. Check the key and file integrity.');}
}
