import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {backupIsDue,dhakaDateTime,driveFolderId,dueBackupDate,saveBackupSchedule,validBackupTime} from '../src/backup-schedule.js';
import {createBackupSnapshot,decryptBackup,encryptBackup} from '../src/backup.js';
import {validBackupBearer} from '../src/scheduled-backup.js';

test('backup time uses Bangladesh calendar day and the editable target time',()=>{
 const now=new Date('2026-10-07T19:12:00Z'); // 01:12 on 8 October in Dhaka
 assert.deepEqual(dhakaDateTime(now),{date:'2026-10-08',time:'01:12'});
 assert.equal(backupIsDue({now,time:'01:00'}),true);
 assert.equal(backupIsDue({now,time:'01:15'}),false);
 assert.equal(backupIsDue({now,time:'01:00',lastSuccess:{date:'2026-10-08'}}),false);
 assert.equal(backupIsDue({now,time:'01:00',lastSuccess:{date:'2026-10-07'}}),true);
 assert.equal(validBackupTime('23:59'),true);
 assert.equal(validBackupTime('24:00'),false);
 assert.equal(validBackupTime('1:00'),false);
 const afterMidnight=new Date('2026-10-07T18:05:00Z'); // 00:05 on 8 October
 assert.equal(dueBackupDate({now:afterMidnight,time:'23:59'}),'2026-10-07');
 assert.equal(dueBackupDate({now:afterMidnight,time:'23:59',lastSuccess:{date:'2026-10-07'}}),null);
});

test('scheduled backup is encrypted and rejects wrong keys or damaged content',()=>{
 const key=randomBytes(32).toString('base64');
 const snapshot={format:'IBM_PG_V1',created_at:'2026-10-08T00:00:00.000Z',tables:[{key:'ib_users',rows:[{username:'admin',password_hash:'sensitive'}]}]};
 const bytes=encryptBackup(snapshot,key);
 assert.equal(bytes.includes(Buffer.from('sensitive')),false);
 const envelope=JSON.parse(bytes.toString('utf8'));
 assert.deepEqual(decryptBackup(envelope,key),snapshot);
 assert.throws(()=>decryptBackup(envelope,randomBytes(32).toString('base64')),/Unable to decrypt/);
 assert.throws(()=>decryptBackup({...envelope,data:'AA==',},key),/Unable to decrypt/);
});

test('full database snapshot keeps records from every office',async()=>{
 const officeRows=[{id:1,office_name:'Gazipur Network System'},{id:2,office_name:'GNS-2'}];
 const db={async query(sql){
  if(sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')return {rows:[]};
  if(sql.includes('WHERE office_id'))throw Error('Backup must not filter offices.');
  return {rows:sql.startsWith('SELECT * FROM ib_offices ')?officeRows:[]};
 }};
 const snapshot=await createBackupSnapshot(db,new Date('2026-10-08T00:00:00Z'));
 assert.deepEqual(snapshot.tables.find(table=>table.key==='ib_offices').rows,officeRows);
});

test('export bearer requires a configured secret',()=>{
 const secret=randomBytes(32).toString('hex');
 assert.equal(validBackupBearer(`Bearer ${secret}`,secret),true);
 assert.equal(validBackupBearer(`Bearer ${secret}wrong`,secret),false);
 assert.equal(validBackupBearer('Bearer short','short'),false);
});

test('Drive destination accepts only a Drive folder link or folder ID',()=>{
 const id='1abCDEFghijkLMNopqrstUVwxyz012345';
 assert.equal(driveFolderId(`https://drive.google.com/drive/u/0/folders/${id}?usp=sharing`),id);
 assert.equal(driveFolderId(id),id);
 assert.equal(driveFolderId(''), '');
 assert.equal(driveFolderId('https://example.com/drive/folders/'+id),null);
 assert.equal(driveFolderId('https://drive.google.com/file/d/'+id+'/view'),null);
});

test('saving a schedule normalizes the Drive link and keeps the chosen time',async()=>{
 const values=new Map(),db={async query(sql,params){
  if(sql.startsWith('INSERT')){values.set(params[0],JSON.parse(params[1]));return {rows:[]};}
  return {rows:[...values].map(([key,value])=>({key,value}))};
 }};
 const id='1abCDEFghijkLMNopqrstUVwxyz012345';
 const schedule=await saveBackupSchedule({time:'02:30',folder_id:`https://drive.google.com/drive/folders/${id}?usp=sharing`},db);
 assert.equal(schedule.time,'02:30');
 assert.equal(schedule.folder_id,id);
});
