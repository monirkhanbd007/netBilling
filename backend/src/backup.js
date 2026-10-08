import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const backupTables=['ib_offices','ib_users','ib_packages','ib_customers','ib_bill_batches','ib_bill_lines','ib_payments','ib_isp_payments','ib_office_expenses','ib_staff_salary','ib_line_transfer','ib_new_line','ib_settings'];

export async function createBackupSnapshot(db,createdAt=new Date()){
 await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const output={format:'IBM_PG_V1',created_at:createdAt.toISOString(),tables:[]};
 for(const name of backupTables)output.tables.push({key:name,rows:(await db.query(`SELECT * FROM ${name} ORDER BY ${name==='ib_settings'?'key':'id'}`)).rows});
 return output;
}

export async function createOfficeBackupSnapshot(db,officeId,createdAt=new Date()){
 await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const office=(await db.query('SELECT * FROM ib_offices WHERE id=$1',[officeId])).rows[0];
 if(!office)return null;
 const output={format:'IBM_PG_OFFICE_V1',office_id:officeId,office_name:office.office_name,created_at:createdAt.toISOString(),tables:[{key:'ib_offices',rows:[office]}]};
 for(const name of backupTables.slice(1)){
  let sql,params=[officeId];
  if(name==='ib_bill_lines')sql='SELECT * FROM ib_bill_lines WHERE batch_id IN (SELECT id FROM ib_bill_batches WHERE office_id=$1) ORDER BY id';
  else if(name==='ib_line_transfer'||name==='ib_new_line')sql=`SELECT * FROM ${name} WHERE customer_db_id IN (SELECT id FROM ib_customers WHERE office_id=$1) ORDER BY id`;
  else if(name==='ib_settings'){
   sql='SELECT * FROM ib_settings WHERE key=ANY($1::text[]) ORDER BY key';
   params=[[`support_phone_office_${officeId}`,`payment_numbers_office_${officeId}`,`expense_types_office_${officeId}`]];
  }
  else sql=`SELECT * FROM ${name} WHERE office_id=$1 ORDER BY id`;
  output.tables.push({key:name,rows:(await db.query(sql,params)).rows});
 }
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
