import crypto from 'node:crypto';
import {Router} from 'express';
import {pool,tx,one,all,fail,month,date,money,currentMonth,today} from './db.js';
import {scope,requireOffice,paymentCollector} from './auth.js';
import {billLine,financial,outstanding,cents,taka} from './calculations.js';
import {readSupportPhone} from './support-phone.js';
import {readPaymentNumbers} from './payment-numbers.js';
import {sortReportRowsByCustomerId} from './report-order.js';
import {previousBillBalances,previousDueFor} from './carry-forward.js';

export const finance=Router();
const officeOf=(u,v)=>{const n=scope(u,v);return requireOffice(u,n);};
const selectedMonth=q=>month(q||currentMonth());
const lockBillingOffice=(db,id)=>one(db,'SELECT id FROM ib_offices WHERE id=$1 FOR UPDATE',[id]);
const laterProcessedBill=(db,id,m)=>one(db,"SELECT id FROM ib_bill_batches WHERE office_id=$1 AND bill_month>$2 AND status='processed' LIMIT 1",[id,m]);
async function billData(db,officeId,m){
 const batch=await one(db,"SELECT * FROM ib_bill_batches WHERE office_id=$1 AND bill_month=$2 AND status='processed'",[officeId,m]);
 if(batch)return {batch,rows:await all(db,'SELECT * FROM ib_bill_lines WHERE batch_id=$1 ORDER BY customer_name,id',[batch.id])};
 const customers=await all(db,'SELECT * FROM ib_customers WHERE office_id=$1 ORDER BY customer_name,id',[officeId]);
 const [payments,priorBalances]=await Promise.all([
  all(db,'SELECT customer_db_id,COALESCE(SUM(amount),0) AS amount FROM ib_payments WHERE office_id=$1 AND bill_month=$2 GROUP BY customer_db_id',[officeId,m]),
  previousBillBalances(db,officeId,m)
 ]);
 const paidByCustomer=new Map(payments.map(p=>[String(p.customer_db_id),p.amount]));
 return {batch:null,rows:customers.map(c=>({...c,customer_status:c.status,...billLine(c.monthly_bill,previousDueFor(c,priorBalances),paidByCustomer.get(String(c.id))||0),customer_db_id:c.id}))};
}
const publicBillRow=({pppoe_password,...row})=>row;
const collectionBillRow=r=>({id:r.id,customer_db_id:r.customer_db_id,customer_id:r.customer_id,customer_name:r.customer_name,customer_status:r.customer_status,monthly_bill:r.monthly_bill,previous_due:r.previous_due,total_due:r.total_due,paid_amount:r.paid_amount,balance_due:r.balance_due,status:r.status});
async function activeCustomerRows(db,rows){
 if(!rows.length)return [];
 const ids=rows.map(r=>r.customer_db_id);
 const active=await all(db,"SELECT id FROM ib_customers WHERE id=ANY($1::BIGINT[]) AND status='active'",[ids]);
 const activeIds=new Set(active.map(c=>String(c.id)));
 return rows.filter(r=>activeIds.has(String(r.customer_db_id)));
}
finance.get('/dashboard',async(req,res)=>{
 const m=selectedMonth(req.query.month),u=req.user,officeId=scope(u,req.query.office_id);
 const data=await all(pool,`SELECT o.id AS office_id,o.office_name,o.manager,c.active,c.inactive,c.billing,p.received,i.isp,e.expenses,s.salary
  FROM ib_offices o
  CROSS JOIN LATERAL (SELECT COUNT(*) FILTER(WHERE status='active') AS active,COUNT(*) FILTER(WHERE status='inactive') AS inactive,COALESCE(SUM(monthly_bill) FILTER(WHERE status='active'),0) AS billing FROM ib_customers WHERE office_id=o.id) c
  CROSS JOIN LATERAL (SELECT COALESCE(SUM(amount),0) AS received FROM ib_payments WHERE office_id=o.id AND (bill_month=$1 OR (bill_month='' AND TO_CHAR(payment_date,'YYYY-MM')=$1))) p
  CROSS JOIN LATERAL (SELECT COALESCE(SUM(amount),0) AS isp FROM ib_isp_payments WHERE office_id=o.id AND (bill_month=$1 OR (bill_month='' AND TO_CHAR(payment_date,'YYYY-MM')=$1))) i
  CROSS JOIN LATERAL (SELECT COALESCE(SUM(amount),0) AS expenses FROM ib_office_expenses WHERE office_id=o.id AND TO_CHAR(expense_date,'YYYY-MM')=$1) e
  CROSS JOIN LATERAL (SELECT COALESCE(SUM(total_salary),0) AS salary FROM ib_staff_salary WHERE office_id=o.id AND salary_month=$1) s
  WHERE o.status='active' ${officeId?'AND o.id=$2':''} ORDER BY o.office_name`,officeId?[m,officeId]:[m]);
 const rows=await Promise.all(data.map(async r=>{
  const bills=await billData(pool,r.office_id,m);
  return {...r,active:Number(r.active),inactive:Number(r.inactive),...financial(r.received,r.isp,r.expenses,r.salary),due:outstanding(bills.rows)};
 }));
 res.json({month:m,rows});
});
finance.get('/bills',async(req,res)=>{const id=officeOf(req.user,req.query.office_id),m=selectedMonth(req.query.month),bill=await billData(pool,id,m);const rows=req.query.active_only==='1'?await activeCustomerRows(pool,bill.rows):bill.rows;res.json({month:m,office_id:id,...bill,rows:sortReportRowsByCustomerId(rows).map(paymentCollector(req.user)?collectionBillRow:publicBillRow)});});
finance.post('/bills/process',async(req,res)=>{
 const id=officeOf(req.user,req.body.office_id),m=selectedMonth(req.body.month);
 const result=await tx(async db=>{
  await lockBillingOffice(db,id);
  if(await one(db,"SELECT id FROM ib_bill_batches WHERE office_id=$1 AND bill_month=$2 AND status='processed'",[id,m]))fail(409,'This month is already processed for the office.');
  if(await laterProcessedBill(db,id,m))fail(409,'A later month is already processed. Reverse it before processing this month.');
  const priorBalances=await previousBillBalances(db,id,m,{lock:true});
  const customers=await all(db,'SELECT * FROM ib_customers WHERE office_id=$1 ORDER BY customer_name,id',[id]);
  if(!customers.length)fail(400,'No customers in the selected office.');
  const batch=await one(db,'INSERT INTO ib_bill_batches(office_id,bill_month) VALUES($1,$2) RETURNING *',[id,m]);
  for(const c of customers){
   const x=billLine(c.monthly_bill,previousDueFor(c,priorBalances));
   const line=await one(db,`INSERT INTO ib_bill_lines(batch_id,customer_db_id,customer_id,customer_name,mobile,area,monthly_bill,previous_due,total_due,paid_amount,balance_due,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[batch.id,c.id,c.customer_id,c.customer_name,c.mobile,c.area,x.monthly_bill,x.previous_due,x.total_due,x.paid_amount,x.balance_due,x.status]);
   // Payments collected against a live customer before processing are attached to this snapshot.
   const prior=await one(db,'SELECT COALESCE(SUM(amount),0) AS n FROM ib_payments WHERE office_id=$1 AND customer_db_id=$2 AND bill_month=$3 AND bill_line_id=0',[id,c.id,m]);
   if(cents(prior.n)>0){const p=billLine(c.monthly_bill,x.previous_due,prior.n);
     if(cents(prior.n)>cents(p.total_due))fail(409,`Existing payments exceed bill for ${c.customer_id}.`);
     await db.query('UPDATE ib_bill_lines SET paid_amount=$1,balance_due=$2,status=$3 WHERE id=$4',[p.paid_amount,p.balance_due,p.status,line.id]);
     await db.query('UPDATE ib_payments SET bill_line_id=$1,batch_id=$2 WHERE office_id=$3 AND customer_db_id=$4 AND bill_month=$5 AND bill_line_id=0',[line.id,batch.id,id,c.id,m]);
   }
  }return batch;
 });res.status(201).json(result);
});
finance.post('/bills/reverse',async(req,res)=>{
 const id=officeOf(req.user,req.body.office_id),m=selectedMonth(req.body.month);
 await tx(async db=>{await lockBillingOffice(db,id);if(await laterProcessedBill(db,id,m))fail(409,'A later bill contains this balance. Reverse the later bill first.');
  const batch=await one(db,"SELECT * FROM ib_bill_batches WHERE office_id=$1 AND bill_month=$2 AND status='processed' FOR UPDATE",[id,m]);if(!batch)fail(404,'No processed bill found.');
  if(await one(db,'SELECT 1 FROM ib_payments WHERE batch_id=$1 LIMIT 1',[batch.id]))fail(409,'Reverse the linked payments before reversing the bill.');
  await db.query('DELETE FROM ib_bill_lines WHERE batch_id=$1',[batch.id]);await db.query('DELETE FROM ib_bill_batches WHERE id=$1',[batch.id]);
 });res.json({ok:true});
});
finance.get('/payments',async(req,res)=>{
 const id=paymentCollector(req.user)?officeOf(req.user,req.query.office_id):scope(req.user,req.query.office_id),m=req.query.month?selectedMonth(req.query.month):null;
 const filters=[],params=[];if(id){params.push(id);filters.push(`office_id=$${params.length}`);}if(m){params.push(m);filters.push(`bill_month=$${params.length}`);}
 if(req.query.method){params.push(String(req.query.method));filters.push(`payment_method=$${params.length}`);}
 if(req.query.date){params.push(date(req.query.date));filters.push(`payment_date=$${params.length}`);}
 res.json(await all(pool,`SELECT * FROM ib_payments ${filters.length?'WHERE '+filters.join(' AND '):''} ORDER BY id DESC LIMIT 2000`,params));
});
finance.get('/payments/:id',async(req,res)=>{
 if(!/^\d+$/.test(req.params.id))fail(400,'Invalid payment ID.');
 const payment=await one(pool,'SELECT * FROM ib_payments WHERE id=$1',[req.params.id]);
 if(!payment)fail(404,'Payment not found.');
 requireOffice(req.user,payment.office_id);
 res.json(payment);
});
finance.post('/payments',async(req,res)=>{
 const u=req.user,b=req.body,id=officeOf(u,b.office_id),m=selectedMonth(b.month),paymentDate=date(b.payment_date||today()),amount=money(b.amount);
 if(amount<=0)fail(400,'Payment amount must be greater than zero.');
 const methods=['Cash','bKash','Nagad','Rocket','Bank','Other'],method=methods.includes(b.payment_method)?b.payment_method:'Other';
 const row=await tx(async db=>{
  await lockBillingOffice(db,id);
  if(await laterProcessedBill(db,id,m))fail(409,'This balance was carried into a later bill. Collect the payment against that bill month.');
  const batch=await one(db,"SELECT * FROM ib_bill_batches WHERE office_id=$1 AND bill_month=$2 AND status='processed' FOR UPDATE",[id,m]);
  let c,line;
  if(batch){line=await one(db,'SELECT * FROM ib_bill_lines WHERE batch_id=$1 AND customer_db_id=$2 FOR UPDATE',[batch.id,b.customer_db_id]);if(!line)fail(404,'Customer is not in the processed bill.');}
  else {c=await one(db,"SELECT * FROM ib_customers WHERE id=$1 AND office_id=$2 AND status='active' FOR UPDATE",[b.customer_db_id,id]);if(!c)fail(404,'Active customer not found.');}
  const priorBalances=line?null:await previousBillBalances(db,id,m);
  const total=cents(line?line.total_due:billLine(c.monthly_bill,previousDueFor(c,priorBalances)).total_due);
  const already=line?cents(line.paid_amount):cents((await one(db,'SELECT COALESCE(SUM(amount),0) AS n FROM ib_payments WHERE office_id=$1 AND customer_db_id=$2 AND bill_month=$3',[id,c.id,m])).n);
  if(amount>total-already)fail(400,`Payment exceeds current balance of Tk ${taka(Math.max(0,total-already))}.`);
  const receipt='RC-'+new Date().toISOString().replace(/\D/g,'').slice(0,14)+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
  const p=await one(db,`INSERT INTO ib_payments(office_id,batch_id,bill_line_id,customer_db_id,customer_id,customer_name,bill_month,payment_date,amount,payment_method,reference,note,receipt_no,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[id,batch?.id||0,line?.id||0,line?.customer_db_id||c.id,line?.customer_id||c.customer_id,line?.customer_name||c.customer_name,m,paymentDate,taka(amount),method,b.reference||null,b.note||null,receipt,u.id]);
  if(line){const next=total-already-amount;await db.query('UPDATE ib_bill_lines SET paid_amount=$1,balance_due=$2,status=$3 WHERE id=$4',[taka(already+amount),taka(next),next?'due':'paid',line.id]);}
  return p;
 });res.status(201).json(row);
});
finance.delete('/payments/:id',async(req,res)=>{
 await tx(async db=>{
  const payment=await one(db,'SELECT office_id FROM ib_payments WHERE id=$1',[req.params.id]);if(!payment)fail(404,'Payment not found.');requireOffice(req.user,payment.office_id);
  await lockBillingOffice(db,payment.office_id);
  const p=await one(db,'SELECT * FROM ib_payments WHERE id=$1 FOR UPDATE',[req.params.id]);if(!p)fail(404,'Payment not found.');
  if(await laterProcessedBill(db,p.office_id,p.bill_month))fail(409,'This payment was carried into a later bill. Reverse the later bill first.');
  if(p.bill_line_id){const l=await one(db,'SELECT * FROM ib_bill_lines WHERE id=$1 FOR UPDATE',[p.bill_line_id]);if(l){const n=Math.max(0,cents(l.paid_amount)-cents(p.amount)),b=Math.max(0,cents(l.total_due)-n);await db.query('UPDATE ib_bill_lines SET paid_amount=$1,balance_due=$2,status=$3 WHERE id=$4',[taka(n),taka(b),b?'due':'paid',l.id]);}}
  await db.query('DELETE FROM ib_payments WHERE id=$1',[p.id]);
 });res.status(204).end();
});
finance.get('/slips',async(req,res)=>{
 const id=officeOf(req.user,req.query.office_id),m=selectedMonth(req.query.month);const office=await one(pool,'SELECT * FROM ib_offices WHERE id=$1',[id]);
 if(!office)fail(404,'Office not found.');const {batch,rows}=await billData(pool,id,m);
 const customerId=Number(req.query.customer_db_id||0),filtered=customerId?rows.filter(r=>Number(r.customer_db_id)===customerId):rows;
 const ids=filtered.map(r=>r.customer_db_id);const customers=ids.length?await all(pool,'SELECT id,address,pppoe_username FROM ib_customers WHERE id=ANY($1::BIGINT[])',[ids]):[];
 const lookup=new Map(customers.map(c=>[String(c.id),c]));
 const [support,paymentNumbers]=await Promise.all([readSupportPhone(pool,id),readPaymentNumbers(pool,id)]);
 const enriched=filtered.map(r=>({...(paymentCollector(req.user)?collectionBillRow(r):publicBillRow(r)),mobile:r.mobile,area:r.area,address:lookup.get(String(r.customer_db_id))?.address||'',pppoe_username:lookup.get(String(r.customer_db_id))?.pppoe_username||'',bill_month:m}));
 res.json({office,month:m,processed:!!batch,support_phone:support.value,payment_numbers:paymentNumbers,rows:enriched});
});
finance.get('/report',async(req,res)=>{
 const id=officeOf(req.user,req.query.office_id),m=selectedMonth(req.query.month),{batch,rows}=await billData(pool,id,m);
 const customerIds=rows.map(r=>r.customer_db_id);
 const customers=customerIds.length?await all(pool,'SELECT id,pppoe_username,address,status FROM ib_customers WHERE id=ANY($1::BIGINT[])',[customerIds]):[];
 const customerDetails=new Map(customers.map(c=>[String(c.id),c]));
 const billRows=sortReportRowsByCustomerId(rows.filter(r=>customerDetails.get(String(r.customer_db_id))?.status==='active'));
 const detailedRows=billRows.map(r=>{
  const customer=customerDetails.get(String(r.customer_db_id));
  return {...publicBillRow(r),address:customer?.address??r.address??'',pppoe_username:customer?.pppoe_username||r.pppoe_username||r.customer_id||''};
 });
 const sum=key=>taka(detailedRows.reduce((n,r)=>n+cents(r[key]),0));
 const isp=await one(pool,"SELECT COALESCE(SUM(amount),0) AS n FROM ib_isp_payments WHERE office_id=$1 AND (bill_month=$2 OR TO_CHAR(payment_date,'YYYY-MM')=$2 OR bill_month LIKE $3)",[id,m,m+'%']);
 res.json({month:m,office_id:id,processed:!!batch,count:detailedRows.length,monthly:sum('monthly_bill'),previous_due:sum('previous_due'),total_due:sum('total_due'),paid:sum('paid_amount'),balance:sum('balance_due'),isp:isp.n,profit:taka(cents(sum('paid_amount'))-cents(isp.n)),rows:detailedRows});
});
