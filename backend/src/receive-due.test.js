import assert from 'node:assert/strict';
import test from 'node:test';
import app from './index.js';
import {pool} from './db.js';
import {buildPosSlipHtml} from '../../frontend/src/pos-slip-print.js';

test('Receive due bill posts once to the latest office bill and preserves the selected historical snapshot',async t=>{
 const originalQuery=pool.query,originalConnect=pool.connect;
 const batches=[{id:9,office_id:4,bill_month:'2026-09'},{id:10,office_id:4,bill_month:'2026-10'},{id:11,office_id:4,bill_month:'2026-11'},{id:12,office_id:5,bill_month:'2026-12'}];
 const customer={id:1,office_id:4,customer_id:'gns481faruk',customer_name:'Faruk',status:'active'};
 const lines=new Map([
  [9,{id:91,batch_id:9,customer_db_id:1,customer_id:customer.customer_id,customer_name:'Faruk',monthly_bill:'600.00',previous_due:'100.00',total_due:'700.00',paid_amount:'300.00',balance_due:'400.00',status:'due'}],
  [10,{id:101,batch_id:10,customer_db_id:1,customer_id:customer.customer_id,customer_name:'Faruk',monthly_bill:'600.00',previous_due:'400.00',total_due:'1000.00',paid_amount:'0.00',balance_due:'1000.00',status:'due'}],
  [11,{id:111,batch_id:11,customer_db_id:1,customer_id:customer.customer_id,customer_name:'Faruk',monthly_bill:'600.00',previous_due:'1000.00',total_due:'1600.00',paid_amount:'100.00',balance_due:'1500.00',status:'due'}]
 ]);
 const previousSnapshots=structuredClone([lines.get(9),lines.get(10)]),payments=[],queries=[];
 let role='Super Admin',officeId=0;
 const query=async(sql,params=[])=>{
  queries.push({sql,params});
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
  if(sql.includes('FROM ib_sessions'))return {rows:[{id:7,role,office_id:officeId}]};
  if(sql.includes('FROM ib_offices WHERE id=$1 FOR UPDATE'))return {rows:[{id:params[0]}]};
  if(sql==='SELECT * FROM ib_offices WHERE id=$1')return {rows:[{id:params[0],office_name:'Gazipur Network System'}]};
  if(sql.includes('FROM ib_settings'))return {rows:[]};
  if(sql.includes('FROM ib_bill_batches')&&sql.includes('bill_month>$2'))return {rows:batches.filter(batch=>batch.office_id===params[0]&&batch.bill_month>params[1]).sort((a,b)=>b.bill_month.localeCompare(a.bill_month)).slice(0,1)};
  if(sql.startsWith('SELECT * FROM ib_bill_batches'))return {rows:batches.filter(batch=>batch.office_id===params[0]&&batch.bill_month===params[1])};
  if(sql.startsWith('SELECT * FROM ib_bill_lines'))return {rows:lines.has(params[0])&&(!params[1]||params[1]===1)?[{...lines.get(params[0])}]:[]};
  if(sql.startsWith('SELECT id,status FROM ib_customers')||sql.startsWith('SELECT id,pppoe_username,address,status FROM ib_customers')||sql.startsWith('SELECT id,address,pppoe_username,status FROM ib_customers'))return {rows:[customer]};
  if(sql.includes('FROM ib_isp_payments'))return {rows:[{n:'0.00'}]};
  if(sql.startsWith('SELECT * FROM ib_payments'))return {rows:payments.filter(payment=>payment.office_id===params[0]&&payment.bill_month===params[1])};
  if(sql.startsWith('INSERT INTO ib_payments')){
   const keys=sql.match(/ib_payments\(([^)]+)\)/)[1].split(',');
   const row={id:payments.length+1,...Object.fromEntries(keys.map((key,index)=>[key,params[index]]))};
   payments.push(row);return {rows:[row]};
  }
  if(sql.startsWith('UPDATE ib_bill_lines SET paid_amount=')){
   const line=[...lines.values()].find(line=>line.id===params[3]);
   Object.assign(line,{paid_amount:params[0],balance_due:params[1],status:params[2]});return {rows:[]};
  }
  throw Error('Unexpected query: '+sql);
 };
 pool.query=query;pool.connect=async()=>({query,release(){}});
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{pool.query=originalQuery;pool.connect=originalConnect;await new Promise(resolve=>server.close(resolve));});
 const base=`http://127.0.0.1:${server.address().port}/api`,headers={cookie:'ibm_session=test','Content-Type':'application/json'};
 const get=path=>fetch(base+path,{headers});
 const collect=overrides=>fetch(base+'/payments',{method:'POST',headers,body:JSON.stringify({office_id:4,month:'2026-10',customer_db_id:1,amount:'400.00',payment_date:'2026-10-31',payment_method:'bKash',reference:'due-reference',note:'October due',...overrides})});
 const preview=await get('/bills?office_id=4&month=2026-10&active_only=1&collection=1');
 assert.equal(preview.status,200);
 const bill=await preview.json();
 assert.equal(bill.month,'2026-10');assert.equal(bill.collection_month,'2026-11');
 assert.equal(bill.rows[0].balance_due,'1000.00');
 assert.match(queries.find(call=>call.sql.includes('bill_month>$2')).sql,/ORDER BY bill_month DESC LIMIT 1/);
 const oldSlips=await get('/slips?office_id=4&month=2026-10&customer_db_id=1&collection=1');
 assert.equal(oldSlips.status,200);assert.equal((await oldSlips.json()).collection_month,'2026-11');
 for(const receive_due of [undefined,'true']){
  const blocked=await collect({receive_due});assert.equal(blocked.status,409);
  assert.equal((await blocked.json()).collection_month,'2026-11');
 }
 const changedMonth=await collect({receive_due:true,collection_month:'2026-10'});
 assert.equal(changedMonth.status,409);assert.equal((await changedMonth.json()).collection_month,'2026-11');
 assert.equal(payments.length,0);
 role='Payment Collector';officeId=4;
 // A scoped collector's requested office cannot redirect the receipt to another office.
 const received=await collect({office_id:5,receive_due:true,collection_month:'2026-11'});
 assert.equal(received.status,201);
 const payment=await received.json();
 assert.deepEqual([payment.office_id,payment.batch_id,payment.bill_line_id,payment.bill_month,payment.amount,payment.payment_date,payment.payment_method,payment.reference,payment.note],[4,11,111,'2026-11','400.00','2026-10-31','bKash','due-reference','October due']);
 assert.deepEqual([lines.get(11).paid_amount,lines.get(11).balance_due],['500.00','1100.00']);
 const receiptSlips=await get(`/slips?office_id=${payment.office_id}&month=${payment.bill_month}&customer_db_id=${payment.customer_db_id}`);
 assert.equal(receiptSlips.status,200);
 const receipt=buildPosSlipHtml(await receiptSlips.json(),payment);
 assert.match(receipt,/নভেম্বর ২০২৬/);assert.match(receipt,/৩১ অক্টোবর/);assert.match(receipt,/৳৪০০\.০০/);assert.ok(receipt.includes(payment.receipt_no));
 const overpaid=await collect({receive_due:true,amount:'1100.01'});
 assert.equal(overpaid.status,400);assert.match((await overpaid.json()).error,/1100\.00/);
 assert.equal(payments.length,1);
 const fullyPaid=await collect({receive_due:true,amount:'1100.00'});
 assert.equal(fullyPaid.status,201);
 assert.deepEqual([lines.get(11).paid_amount,lines.get(11).balance_due,lines.get(11).status],['1600.00','0.00','paid']);
 const duplicate=await collect({receive_due:true,amount:'0.01'});
 assert.equal(duplicate.status,400);assert.equal(payments.length,2);
 const missingCustomer=await collect({receive_due:true,customer_db_id:99});
 assert.equal(missingCustomer.status,404);assert.equal(payments.length,2);
 assert.deepEqual([lines.get(9),lines.get(10)],previousSnapshots);
 const currentHistory=await get('/payments?office_id=4&month=2026-11');
 assert.equal((await currentHistory.json()).length,2);
 const oldHistory=await get('/payments?office_id=4&month=2026-10');
 assert.deepEqual(await oldHistory.json(),[]);
 role='Super Admin';officeId=0;
 const report=await get('/report?office_id=4&month=2026-11');
 const currentReport=await report.json();
 assert.equal(report.status,200);assert.equal(currentReport.paid,'1600.00');assert.equal(currentReport.balance,'0.00');
 const oldReport=await get('/report?office_id=4&month=2026-10');
 assert.equal((await oldReport.json()).paid,'0.00');
 const noCarry=await get('/bills?office_id=4&month=2026-11&collection=1');
 assert.equal((await noCarry.json()).collection_month,'2026-11');
});
