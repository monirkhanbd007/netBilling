import {all,one} from './db.js';

export async function previousBillBalances(db,officeId,billMonth,{lock=false}={}){
 const batch=await one(db,`SELECT id FROM ib_bill_batches WHERE office_id=$1 AND bill_month<$2 AND status='processed' ORDER BY bill_month DESC LIMIT 1${lock?' FOR UPDATE':''}`,[officeId,billMonth]);
 if(!batch)return new Map();
 const lines=await all(db,'SELECT customer_db_id,balance_due FROM ib_bill_lines WHERE batch_id=$1',[batch.id]);
 return new Map(lines.map(line=>[String(line.customer_db_id),line.balance_due]));
}

export function previousDueFor(customer,balances){
 return balances.has(String(customer.id))?balances.get(String(customer.id)):customer.previous_due;
}
