import pg from 'pg';
// Each Vercel instance has its own pool. Keep it small and use Neon's pooled URL.
export const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});
export async function tx(fn) {
  const client=await pool.connect();
  try {await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
export const one=async(db,sql,params=[])=> (await db.query(sql,params)).rows[0];
export const all=async(db,sql,params=[])=> (await db.query(sql,params)).rows;
export function fail(status,message){const error=new Error(message);error.status=status;throw error;}
export function money(value){const raw=String(value);const n=Number(raw);if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||!Number.isFinite(n)||n<0||n>9999999999.99)fail(400,'Enter a valid nonnegative amount with at most two decimal places.');return Math.round(n*100);}
export function month(value){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value)))fail(400,'Invalid month (YYYY-MM).');return value;}
export function date(value){let v=String(value||'');const d=v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(d)v=`${d[3]}-${d[2]}-${d[1]}`;if(!/^\d{4}-\d{2}-\d{2}$/.test(v))fail(400,'Invalid date.');const n=new Date(`${v}T00:00:00Z`);if(Number.isNaN(+n)||n.toISOString().slice(0,10)!==v)fail(400,'Invalid date.');return v;}
export const today=()=>new Date().toISOString().slice(0,10);
export const currentMonth=()=>today().slice(0,7);
