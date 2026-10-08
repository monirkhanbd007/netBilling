import {pool} from './db.js';

const scheduleKey='daily_google_drive_backup_schedule';
const successKey='daily_google_drive_backup_last_success';
const dhakaFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

export function validBackupTime(value){return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);}

export function driveFolderId(value){
 const input=String(value??'').trim();
 if(!input)return '';
 if(/^[A-Za-z0-9_-]{10,200}$/.test(input))return input;
 try{
  const url=new URL(input);
  if(url.protocol!=='https:'||url.hostname!=='drive.google.com')return null;
  const match=url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,200})\/?$/);
  return match?.[1]||null;
 }catch{return null;}
}

export function dhakaDateTime(date=new Date()){
 const parts=Object.fromEntries(dhakaFormatter.formatToParts(date).map(part=>[part.type,part.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}

export function dueBackupDate({now=new Date(),time='01:00',lastSuccess=null}={}){
 const local=dhakaDateTime(now);
 if(!validBackupTime(time))return null;
 if(local.time>=time)return lastSuccess?.date===local.date?null:local.date;
 // A trigger for a late-night target may run just after midnight.
 if(time>='23:30'&&local.time<='00:30'){
  const yesterday=dhakaDateTime(new Date(now.getTime()-86400000)).date;
  return lastSuccess?.date===yesterday||lastSuccess?.date===local.date?null:yesterday;
 }
 return null;
}

export function backupIsDue(options){return dueBackupDate(options)!==null;}

export async function readBackupSchedule(db=pool){
 const rows=(await db.query('SELECT key,value FROM ib_settings WHERE key=ANY($1)',[[scheduleKey,successKey]])).rows;
 const settings=new Map(rows.map(row=>[row.key,row.value]));
 const configured=settings.get(scheduleKey)||{},lastSuccess=settings.get(successKey)||null;
 return {time:validBackupTime(configured.time)?configured.time:'01:00',folder_id:configured.folder_id??lastSuccess?.folder_id??'',timezone:'Asia/Dhaka',last_success:lastSuccess};
}

export async function saveBackupSchedule({time,folder_id},db=pool){
 if(!validBackupTime(time))throw Error('Invalid backup time. Use HH:MM.');
 const normalized=driveFolderId(folder_id);
 if(normalized===null)throw Error('Enter a Google Drive folder link or folder ID.');
 await db.query('INSERT INTO ib_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[scheduleKey,JSON.stringify({time,folder_id:normalized})]);
 return readBackupSchedule(db);
}

export async function markBackupSuccess({date,file_id,filename,folder_id},db=pool){
 await db.query('INSERT INTO ib_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[successKey,JSON.stringify({date,file_id,filename,folder_id,completed_at:new Date().toISOString()})]);
}
