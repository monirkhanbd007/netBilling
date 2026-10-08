import {pool} from './db.js';

const scheduleKey='daily_google_drive_backup_schedule';
const successKey='daily_google_drive_backup_last_success';
const dhakaFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

export function validBackupTime(value){return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);}
export function validBackupFrequency(value){return ['daily','weekly','monthly'].includes(value);}
export function validBackupWeekday(value){return Number.isInteger(value)&&value>=1&&value<=7;}
export function validBackupMonthDay(value){return Number.isInteger(value)&&value>=1&&value<=31;}
export function validBackupStartDate(value){
 if(value==='')return true;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(`${value}T12:00:00Z`);
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}

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

const utcDay=date=>new Date(`${date}T12:00:00Z`).getUTCDay()||7;
const weekStart=date=>{
 const day=new Date(`${date}T12:00:00Z`);
 day.setUTCDate(day.getUTCDate()-(day.getUTCDay()||7)+1);
 return day.toISOString().slice(0,10);
};
const addDays=(date,days)=>{
 const value=new Date(`${date}T12:00:00Z`);
 value.setUTCDate(value.getUTCDate()+days);
 return value.toISOString().slice(0,10);
};

export function dueBackupDate({now=new Date(),time='01:00',frequency='daily',weekday=1,month_day=1,start_date='',lastSuccess=null}={}){
 const local=dhakaDateTime(now);
 if(!validBackupTime(time)||!validBackupFrequency(frequency)||!validBackupWeekday(weekday)||!validBackupMonthDay(month_day)||!validBackupStartDate(start_date)||local.date<start_date)return null;
 if(frequency==='weekly'){
  const todayWeekday=utcDay(local.date);
  if(todayWeekday<weekday||(todayWeekday===weekday&&local.time<time))return null;
  if(addDays(weekStart(local.date),weekday-1)<start_date)return null;
  return lastSuccess?.date&&weekStart(lastSuccess.date)===weekStart(local.date)?null:local.date;
 }
 if(frequency==='monthly'){
  const [year,month]=local.date.split('-').map(Number);
  const target=Math.min(month_day,new Date(Date.UTC(year,month,0)).getUTCDate());
  const today=Number(local.date.slice(-2));
  if(today<target||(today===target&&local.time<time))return null;
  if(`${local.date.slice(0,7)}-${String(target).padStart(2,'0')}`<start_date)return null;
  return lastSuccess?.date?.slice(0,7)===local.date.slice(0,7)?null:local.date;
 }
 if(local.time>=time)return lastSuccess?.date===local.date?null:local.date;
 // A trigger for a late-night target may run just after midnight.
 if(time>='23:30'&&local.time<='00:30'){
  const yesterday=dhakaDateTime(new Date(now.getTime()-86400000)).date;
  return yesterday<start_date||lastSuccess?.date===yesterday||lastSuccess?.date===local.date?null:yesterday;
 }
 return null;
}

export function backupIsDue(options){return dueBackupDate(options)!==null;}

export async function readBackupSchedule(db=pool){
 const rows=(await db.query('SELECT key,value FROM ib_settings WHERE key=ANY($1)',[[scheduleKey,successKey]])).rows;
 const settings=new Map(rows.map(row=>[row.key,row.value]));
 const configured=settings.get(scheduleKey)||{},lastSuccess=settings.get(successKey)||null;
 return {time:validBackupTime(configured.time)?configured.time:'01:00',frequency:validBackupFrequency(configured.frequency)?configured.frequency:'daily',weekday:validBackupWeekday(configured.weekday)?configured.weekday:1,month_day:validBackupMonthDay(configured.month_day)?configured.month_day:1,start_date:validBackupStartDate(configured.start_date)?configured.start_date:'',folder_id:configured.folder_id??lastSuccess?.folder_id??'',timezone:'Asia/Dhaka',last_success:lastSuccess};
}

export async function saveBackupSchedule({time,frequency='daily',weekday=1,month_day=1,start_date='',folder_id},db=pool){
 if(!validBackupTime(time))throw Error('Invalid backup time. Use HH:MM.');
 if(!validBackupFrequency(frequency))throw Error('Choose daily, weekly, or monthly backups.');
 if(!validBackupWeekday(weekday))throw Error('Choose a weekday from Monday to Sunday.');
 if(!validBackupMonthDay(month_day))throw Error('Choose a day of the month from 1 to 31.');
 if(!validBackupStartDate(start_date))throw Error('Enter a valid start date (YYYY-MM-DD).');
 const normalized=driveFolderId(folder_id);
 if(normalized===null)throw Error('Enter a Google Drive folder link or folder ID.');
 await db.query('INSERT INTO ib_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[scheduleKey,JSON.stringify({time,frequency,weekday,month_day,start_date,folder_id:normalized})]);
 return readBackupSchedule(db);
}

export async function markBackupSuccess({date,file_id,filename,folder_id},db=pool){
 await db.query('INSERT INTO ib_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[successKey,JSON.stringify({date,file_id,filename,folder_id,completed_at:new Date().toISOString()})]);
}
