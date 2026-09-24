import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {pool,one,fail} from './db.js';
const cookie='ibm_session';
const digest=t=>crypto.createHash('sha256').update(t).digest('hex');
const itoa='./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function verifyPhpass(password,hash){
 if(!/^\$P\$[./0-9A-Za-z]{31}$/.test(hash))return false;
 const log=itoa.indexOf(hash[3]);if(log<7||log>19)return false;
 const salt=hash.slice(4,12),pass=Buffer.from(password),md5=x=>crypto.createHash('md5').update(x).digest();
 let result=md5(Buffer.concat([Buffer.from(salt),pass]));
 for(let i=0;i<(1<<log);i++)result=md5(Buffer.concat([result,pass]));
 let out=hash.slice(0,12),i=0;
 do{let v=result[i++];out+=itoa[v&63];if(i<16)v|=result[i]<<8;out+=itoa[(v>>6)&63];if(i++>=16)break;if(i<16)v|=result[i]<<16;out+=itoa[(v>>12)&63];if(i++>=16)break;out+=itoa[(v>>18)&63];}while(i<16);
 return crypto.timingSafeEqual(Buffer.from(out),Buffer.from(hash));
}
export async function verifyPassword(password,hash){
 if(!hash||password.length>4096)return false;
 if(hash.startsWith('$P$'))return verifyPhpass(password,hash);
 if(hash.length===32&&/^[a-f\d]{32}$/i.test(hash))return crypto.timingSafeEqual(Buffer.from(hash.toLowerCase()),Buffer.from(crypto.createHash('md5').update(password).digest('hex')));
 if(hash.startsWith('$wp$2')){const pre=crypto.createHmac('sha384','wp-sha384').update(password).digest('base64');return bcrypt.compare(pre,hash.slice(3).replace(/^\$2y\$/,'$2a$'));}
 if(/^\$2[aby]\$/.test(hash))return bcrypt.compare(password,hash.replace(/^\$2y\$/,'$2a$'));
 return false;
}
export function parseCookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='))?.slice(cookie.length+1);}
export async function authenticate(req,res,next){
  try{const token=parseCookie(req);if(!token)fail(401,'Please sign in.');
    const user=await one(pool,`SELECT u.id,u.name,u.username,u.role,u.office_id FROM ib_sessions s JOIN ib_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active'`,[digest(token)]);
    if(!user)fail(401,'Session expired. Please sign in.');req.user=user;next();}catch(e){next(e);}
}
export function setSessionCookie(res,token){res.cookie(cookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:7*86400000});}
export async function signIn(username,password,res){
  const user=await one(pool,"SELECT * FROM ib_users WHERE username=$1 AND status='active'",[username]);
  if(!user||!await verifyPassword(password,user.password))fail(401,'Invalid username or password.');
  if(!user.password.startsWith('$2a$'))await pool.query('UPDATE ib_users SET password=$1 WHERE id=$2',[await bcrypt.hash(password,12),user.id]);
  const token=crypto.randomBytes(32).toString('hex');
  await pool.query("INSERT INTO ib_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",[digest(token),user.id]);setSessionCookie(res,token);
  return {id:user.id,name:user.name,username:user.username,role:user.role,office_id:user.office_id};
}
export async function signOut(req,res){const token=parseCookie(req);if(token)await pool.query('DELETE FROM ib_sessions WHERE token_hash=$1',[digest(token)]);res.clearCookie(cookie,{path:'/'});}
export const superAdmin=u=>u.role==='Super Admin';
export function scope(u,requested){const id=Number(requested)||0;if(superAdmin(u))return id;if(Number(u.office_id)<1)fail(403,'No office assigned.');return Number(u.office_id);}
export function requireOffice(u,requested){const id=Number(requested);if(!Number.isSafeInteger(id)||id<1||(!superAdmin(u)&&id!==Number(u.office_id)))fail(403,'Office access denied.');return id;}
export function onlySuper(u){if(!superAdmin(u))fail(403,'Super Admin only.');}
