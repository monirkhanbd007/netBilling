import {pool,one} from './db.js';

const scheduleKey='daily_google_drive_backup_schedule';
const successKey='daily_google_drive_backup_last_success';
const dhakaFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

export function validBackupTime(value){return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);}

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
 const configuredTime=settings.get(scheduleKey)?.time;
 return {time:validBackupTime(configuredTime)?configuredTime:'01:00',timezone:'Asia/Dhaka',last_success:settings.get(successKey)||null};
}

export async function saveBackupSchedule(time,db=pool){
 if(!validBackupTime(time))throw Error('Invalid backup time. Use HH:MM.');
 await db.query('INSERT INTO ib_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[scheduleKey,JSON.stringify({time})]);
 return readBackupSchedule(db);
}

export async function markBackupSuccess({date,file_id,filename},db=pool){
 await db.query('INSERT INTO ib_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[successKey,JSON.stringify({date,file_id,filename,completed_at:new Date().toISOString()})]);
}
