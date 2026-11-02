import {one,currentMonth,month,fail} from './db.js';

// Existing customers had no status dates. The owner confirmed this starting month.
export const legacyInactiveFrom='2026-11';
export const billingStatusKey=officeId=>`customer_billing_status_office_${Number(officeId)}`;
export async function readBillingStatus(db,officeId){
 const saved=await one(db,'SELECT value FROM ib_settings WHERE key=$1',[billingStatusKey(officeId)]);
 return saved?.value?.customers?saved.value:{customers:{}};
}
function statusHistory(customer,history){
 return history.customers[String(customer.id)]||{initial_status:'active',changes:customer.status==='inactive'?[{month:legacyInactiveFrom,status:'inactive'}]:[]};
}
export function billingStatusAt(customer,billMonth,history){
 if(!customer)return billMonth<legacyInactiveFrom?'active':'inactive';
 const entry=statusHistory(customer,history);
 let status=entry.initial_status;
 for(const change of entry.changes){if(change.month>billMonth)break;status=change.status;}
 return status;
}
export function statusEffectiveMonth(customer,history){
 return statusHistory(customer,history).changes.at(-1)?.month||'';
}
export async function recordBillingStatus(db,customer,previous,effectiveMonth){
 const history=await readBillingStatus(db,customer.office_id);
 const source=previous&&Number(previous.office_id)!==Number(customer.office_id)?await readBillingStatus(db,previous.office_id):history;
 const original=previous?statusHistory(previous,source):{initial_status:'active',changes:[]};
 const entry={initial_status:original.initial_status,changes:original.changes.map(change=>({...change}))};
 const changed=previous?customer.status!==previous.status:customer.status==='inactive';
 const last=entry.changes.at(-1);
 const effective=effectiveMonth?month(effectiveMonth):changed?currentMonth():last?.month;
 if(effective&&effective>currentMonth())fail(400,'Status effective month cannot be in the future.');
 if(changed){
  if(last&&effective<last.month)fail(400,'Status effective month cannot precede the last status change.');
  if(last?.month===effective)last.status=customer.status;
  else entry.changes.push({month:effective,status:customer.status});
 }else if(last&&effective&&effective!==last.month){
  const earlier=entry.changes.at(-2);
  if(earlier&&effective<=earlier.month)fail(400,'Status effective month must follow the previous status change.');
  last.month=effective;
 }
 history.customers[String(customer.id)]=entry;
 await db.query('INSERT INTO ib_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[billingStatusKey(customer.office_id),JSON.stringify(history)]);
 return statusEffectiveMonth(customer,history);
}
