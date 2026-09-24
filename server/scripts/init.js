import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import bcrypt from 'bcryptjs';import {pool,one} from '../src/db.js';
const schema=fileURLToPath(new URL('../sql/001_schema.sql',import.meta.url));
export async function setup(){await pool.query(await fs.readFile(schema,'utf8'));}
export async function bootstrap(){
 const count=await one(pool,'SELECT COUNT(*) AS n FROM ib_users');if(Number(count.n))return;
 const username=process.env.BOOTSTRAP_USER,password=process.env.BOOTSTRAP_PASSWORD;
 if(!username||!password||password.length<12)throw new Error('Set BOOTSTRAP_USER and BOOTSTRAP_PASSWORD (12+ characters) before initializing an empty database.');
 const hash=await bcrypt.hash(password,12);
 await pool.query("INSERT INTO ib_users(office_id,name,username,password,role,status) VALUES(0,'System Administrator',$1,$2,'Super Admin','active')",[username,hash]);
 console.log(`Created initial Super Admin: ${username}`);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{await setup();await bootstrap();console.log('Database ready.');}catch(e){console.error(e);process.exitCode=1;}finally{await pool.end();}
}
