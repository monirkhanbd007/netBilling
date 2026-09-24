import crypto from 'node:crypto';
import {Router} from 'express';
import {pool,tx,one,all,fail,month,date,money,currentMonth,today} from './db.js';
import {scope,requireOffice,superAdmin} from './auth.js';
import {billLine,financial,cents,taka} from './calculations.js';

export const finance=Router();
const officeOf=(u,v)=>{const n=scope(u,v);return requireOffice(u,n);};
const selectedMonth=q=>month(q||currentMonth());
async function billData(db,officeId,m){
 const batch=await one(db,"SELECT * FROM ib_bill_batches WHERE office_id=$1 AND bill_month=$2 AND status='processed'",[officeId,m]);
 if(batch)return {batch,rows:await all(db,'SELECT * FROM ib_bill_lines WHERE batch_id=$1 ORDER BY customer_name,id',[batch.id])};
 const customers=await all(db,'SELECT * FROM ib_customers WHERE office_id=$1 ORDER BY customer_name,id',[officeId]);
 const payments=await all(db,'SELECT customer_db_id,COALESCE(SUM(amount),0) AS amount FROM ib_payments WHERE office_id=$1 AND bill_month=$2 GROUP BY customer_db_id',[officeId,m]);
 const paidByCustomer=new Map(payments.map(p=>[String(p.customer_db_id),p.amount]));
 return {batch:null,rows:customers.map(c=>({...c,...billLine(c.monthly_bill,c.previous_due,paidByCustomer.get(String(c.id))||0),customer_db_id:c.id}))};
}
finance.get('/dashboard',async(req,res)=>{
 const m=selectedMonth(req.query.month),u=req.user,officeId=scope(u,req.query.office_id);
 const offices=await all(pool,`SELECT * FROM ib_offices WHERE status='active' ${officeId?'AND id=$1':''} ORDER BY office_name`,officeId?[officeId]:[]);
 const rows=[];
 for(const o of offices){const id=o.id;
  const c=await one(pool,"SELECT COUNT(*) FILTER(WHERE status='active') AS active, COUNT(*) FILTER(WHERE status='inactive') AS inactive,COALESCE(SUM(monthly_bill) FILTER(WHERE status='active'),0) AS billing FROM ib_customers WHERE office_id=$1",[id]);
  const received=await one(pool,"SELECT COALESCE(SUM(amount),0) AS n FROM ib_payments WHERE office_id=$1 AND (bill_month=$2 OR (bill_month='' AND TO_CHAR(payment_date,'YYYY-MM')=$2))",[id,m]);
  const isp=await one(pool,"SELECT COALESCE(SUM(amount),0) AS n FROM ib_isp_payments WHERE office_id=$1 AND (bill_month=$2 OR (bill_month='' AND TO_CHAR(payment_date,'YYYY-MM')=$2))",[id,m]);
  const expenses=await one(pool,"SELECT COALESCE(SUM(amount),0) AS n FROM ib_office_expenses WHERE office_id=$1 AND TO_CHAR(expense_date,'YYYY-MM')=$2",[id,m]);
  const salary=await one(pool,'SELECT COALESCE(SUM(total_salary),0) AS n FROM ib_staff_salary WHERE office_id=$1 AND salary_month=$2',[id,m]);
  rows.push({office_id:id,office_name:o.office_name,manager:o.manager,active:Number(c.active),inactive:Number(c.inactive),billing:c.billing,received:received.n,isp:isp.n,expenses:expenses.n,salary:salary.n,...financial(c.billing,received.n,isp.n,expenses.n,salary.n)});
 }
 res.json({month:m,rows});
});
finance.get('/bills',async(req,res)=>{const id=officeOf(req.user,req.query.office_id),m=selectedMonth(req.query.month);res.json({month:m,office_id:id,...await billData(pool,id,m)});});
finance.post('/bills/process',async(req,res)=>{
 const id=officeOf(req.user,req.body.office_id),m=selectedMonth(req.body.month);
 const result=await tx(async db=>{
  if(await one(db,"SELECT id FROM ib_bill_batches WHERE office_id=$1 AND bill_month=$2 AND status='processed'",[id,m]))fail(409,'This month is already processed for the office.');
  const customers=await all(db,'SELECT * FROM ib_customers WHERE office_id=$1 ORDER BY customer_name,id',[id]);
  if(!customers.length)fail(400,'No customers in the selected office.');
  const batch=await one(db,'INSERT INTO ib_bill_batches(office_id,bill_month) VALUES($1,$2) RETURNING *',[id,m]);
  for(const c of customers){
   const x=billLine(c.monthly_bill,c.previous_due);
   const line=await one(db,`INSERT INTO ib_bill_lines(batch_id,customer_db_id,customer_id,customer_name,mobile,area,monthly_bill,previous_due,total_due,paid_amount,balance_due,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[batch.id,c.id,c.customer_id,c.customer_name,c.mobile,c.area,x.monthly_bill,x.previous_due,x.total_due,x.paid_amount,x.balance_due,x.status]);
   // Payments collected against a live customer before processing are attached to this snapshot.
   const prior=await one(db,'SELECT COALESCE(SUM(amount),0) AS n FROM ib_payments WHERE office_id=$1 AND customer_db_id=$2 AND bill_month=$3 AND bill_line_id=0',[id,c.id,m]);
   if(cents(prior.n)>0){const p=billLine(c.monthly_bill,c.previous_due,prior.n);
     if(cents(prior.n)>cents(p.total_due))fail(409,`Existing payments exceed bill for ${c.customer_id}.`);
     await db.query('UPDATE ib_bill_lines SET paid_amount=$1,balance_due=$2,status=$3 WHERE id=$4',[p.paid_amount,p.balance_due,p.status,line.id]);
     await db.query('UPDATE ib_payments SET bill_line_id=$1,batch_id=$2 WHERE office_id=$3 AND customer_db_id=$4 AND bill_month=$5 AND bill_line_id=0',[line.id,batch.id,id,c.id,m]);
   }
  }return batch;
 });res.status(201).json(result);
});
finance.post('/bills/reverse',async(req,res)=>{
 const id=officeOf(req.user,req.body.office_id),m=selectedMonth(req.body.month);
 await tx(async db=>{const batch=await one(db,"SELECT * FROM ib_bill_batches WHERE office_id=$1 AND bill_month=$2 AND status='processed' FOR UPDATE",[id,m]);if(!batch)fail(404,'No processed bill found.');
  if(await one(db,'SELECT 1 FROM ib_payments WHERE batch_id=$1 LIMIT 1',[batch.id]))fail(409,'Reverse the linked payments before reversing the bill.');
  await db.query('DELETE FROM ib_bill_lines WHERE batch_id=$1',[batch.id]);await db.query('DELETE FROM ib_bill_batches WHERE id=$1',[batch.id]);
 });res.json({ok:true});
});
finance.get('/payments',async(req,res)=>{
 const id=scope(req.user,req.query.office_id),m=req.query.month?selectedMonth(req.query.month):null;
 const filters=[],params=[];if(id){params.push(id);filters.push(`office_id=$${params.length}`);}if(m){params.push(m);filters.push(`bill_month=$${params.length}`);}
 if(req.query.method){params.push(String(req.query.method));filters.push(`payment_method=$${params.length}`);}
 if(req.query.date){params.push(date(req.query.date));filters.push(`payment_date=$${params.length}`);}
 res.json(await all(pool,`SELECT * FROM ib_payments ${filters.length?'WHERE '+filters.join(' AND '):''} ORDER BY id DESC LIMIT 2000`,params));
});
finance.post('/payments',async(req,res)=>{
 const u=req.user,b=req.body,id=officeOf(u,b.office_id),m=selectedMonth(b.month),paymentDate=date(b.payment_date||today()),amount=money(b.amount);
 if(amount<=0)fail(400,'Payment amount must be greater than zero.');
 const methods=['Cash','bKash','Nagad','Rocket','Bank','Other'],method=methods.includes(b.payment_method)?b.payment_method:'Other';
 const row=await tx(async db=>{
  const batch=await one(db,"SELECT * FROM ib_bill_batches WHERE office_id=$1 AND bill_month=$2 AND status='processed' FOR UPDATE",[id,m]);
  let c,line;
  if(batch){line=await one(db,'SELECT * FROM ib_bill_lines WHERE batch_id=$1 AND customer_db_id=$2 FOR UPDATE',[batch.id,b.customer_db_id]);if(!line)fail(404,'Customer is not in the processed bill.');}
  else {c=await one(db,"SELECT * FROM ib_customers WHERE id=$1 AND office_id=$2 AND status='active' FOR UPDATE",[b.customer_db_id,id]);if(!c)fail(404,'Active customer not found.');}
  const total=cents(line?line.total_due:billLine(c.monthly_bill,c.previous_due).total_due);
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
  const p=await one(db,'SELECT * FROM ib_payments WHERE id=$1 FOR UPDATE',[req.params.id]);if(!p)fail(404,'Payment not found.');requireOffice(req.user,p.office_id);
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
 const support=await one(pool,"SELECT value FROM ib_settings WHERE key='support_phone'");
 const enriched=filtered.map(r=>({...r,address:lookup.get(String(r.customer_db_id))?.address||'',pppoe_username:lookup.get(String(r.customer_db_id))?.pppoe_username||'',bill_month:m}));
 res.json({office,month:m,processed:!!batch,support_phone:support?.value||'01979900247',rows:enriched});
});
finance.get('/report',async(req,res)=>{
 const id=officeOf(req.user,req.query.office_id),m=selectedMonth(req.query.month),{batch,rows}=await billData(pool,id,m);
 const sum=key=>taka(rows.reduce((n,r)=>n+cents(r[key]),0));
 const isp=await one(pool,"SELECT COALESCE(SUM(amount),0) AS n FROM ib_isp_payments WHERE office_id=$1 AND (bill_month=$2 OR TO_CHAR(payment_date,'YYYY-MM')=$2 OR bill_month LIKE $3)",[id,m,m+'%']);
 res.json({month:m,office_id:id,processed:!!batch,count:rows.length,monthly:sum('monthly_bill'),previous_due:sum('previous_due'),total_due:sum('total_due'),paid:sum('paid_amount'),balance:sum('balance_due'),isp:isp.n,profit:taka(cents(sum('paid_amount'))-cents(isp.n)),rows});
});
