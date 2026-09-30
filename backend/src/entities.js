import bcrypt from 'bcryptjs';
import {Router} from 'express';
import {pool,tx,one,all,fail,money,month,date,today} from './db.js';
import {scope,requireOffice,onlySuper,superAdmin,allOfficeAccess} from './auth.js';

const definitions={
 offices:{table:'ib_offices',fields:['office_name','address','phone','manager','status'],required:['office_name'],global:true},
 users:{table:'ib_users',fields:['office_id','name','username','role','status'],required:['name','username','role'],secret:true},
 customers:{table:'ib_customers',fields:['office_id','customer_id','pppoe_username','pppoe_password','customer_name','mobile','address','area','package_id','monthly_bill','previous_due','connection_date','status'],required:['customer_id','customer_name'],money:['monthly_bill','previous_due'],dates:['connection_date']},
 packages:{table:'ib_packages',fields:['office_id','package_name','speed','price','status'],required:['package_name'],money:['price']},
 'isp-payments':{table:'ib_isp_payments',fields:['office_id','payment_date','provider','bill_month','amount','note'],required:['provider','bill_month','payment_date'],money:['amount'],dates:['payment_date'],invoice:true},
 expenses:{table:'ib_office_expenses',fields:['office_id','expense_date','expense_type','amount','note'],required:['expense_type','expense_date'],money:['amount'],dates:['expense_date']},
 salary:{table:'ib_staff_salary',fields:['office_id','staff_name','salary_month','total_salary','payment_date','note'],required:['staff_name','salary_month'],money:['total_salary'],dates:['payment_date']},
 transfers:{table:'ib_line_transfer',fields:['customer_db_id','new_package','type'],append:true},
 'new-lines':{table:'ib_new_line',fields:['customer_db_id'],append:true}
};
const errorIfMissing=(v,label)=>{if(v===undefined||v===null||String(v).trim()==='')fail(400,`${label} is required.`);};
const knownOffice=async(id)=>{if(!await one(pool,'SELECT id FROM ib_offices WHERE id=$1',[id]))fail(400,'Office does not exist.');};
async function userOffice(role,requested){
 if(role==='Super Admin')return 0;
 if(requested===undefined||requested===null||requested==='')fail(400,'Select an office or All offices.');
 const id=Number(requested);
 if(!Number.isSafeInteger(id)||id<0)fail(400,'Invalid office.');
 if(id)await knownOffice(id);
 return id;
}
const expenseTypeKey=id=>`expense_types_office_${id}`;
const normalizedExpenseType=value=>{const type=String(value??'').trim();if(!type||type.length>100)fail(400,'Enter an expense type of up to 100 characters.');return type;};
async function accessRecord(db,u,def,id){
  const record=await one(db,`SELECT * FROM ${def.table} WHERE id=$1`,[id]);if(!record)fail(404,'Record not found.');
  if(def.secret){onlySuper(u);return record;}
  if(def.global){if(!superAdmin(u)&&Number(record.id)!==Number(u.office_id))fail(403,'Office access denied.');}
  else if(def.append){const c=await one(db,'SELECT office_id FROM ib_customers WHERE id=$1',[record.customer_db_id]);if(!allOfficeAccess(u)&&Number(c?.office_id)!==Number(u.office_id))fail(403,'Office access denied.');}
  else requireOffice(u,record.office_id);
  return record;
}
export const entities=Router();
entities.get('/expense-types',async(req,res)=>{
  const officeId=requireOffice(req.user,scope(req.user,req.query.office_id));
  const [saved,rows]=await Promise.all([
    one(pool,'SELECT value FROM ib_settings WHERE key=$1',[expenseTypeKey(officeId)]),
    all(pool,"SELECT DISTINCT BTRIM(expense_type) AS expense_type FROM ib_office_expenses WHERE office_id=$1 AND BTRIM(expense_type)<>'' ORDER BY expense_type LIMIT 100",[officeId])
  ]);
  const seen=new Set(),types=[];
  for(const value of [...(Array.isArray(saved?.value)?saved.value:[]),...rows.map(row=>row.expense_type)]){
    const type=String(value??'').trim(),key=type.toLocaleLowerCase();
    if(type&&!seen.has(key)){seen.add(key);types.push(type);}
  }
  res.json(types.sort((a,b)=>a.localeCompare(b)).slice(0,100));
});
entities.post('/expense-types',async(req,res)=>{
  const officeId=requireOffice(req.user,scope(req.user,req.body?.office_id));
  await knownOffice(officeId);
  const type=normalizedExpenseType(req.body?.expense_type);
  await pool.query("INSERT INTO ib_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=CASE WHEN jsonb_typeof(ib_settings.value)='array' THEN ib_settings.value || EXCLUDED.value ELSE EXCLUDED.value END",[expenseTypeKey(officeId),JSON.stringify([type])]);
  res.status(201).json({expense_type:type});
});
entities.get('/:name',async(req,res)=>{
  const def=definitions[req.params.name];if(!def)fail(404,'Unknown module.');const u=req.user;
  if(def.secret)onlySuper(u);
  if(def.global){const rows=await all(pool,`SELECT * FROM ${def.table} ${allOfficeAccess(u)?'':'WHERE id=$1'} ORDER BY id DESC`,allOfficeAccess(u)?[]:[scope(u)]);return res.json(rows);}
  let where='',params=[];
  if(def.append){where=allOfficeAccess(u)?'':'WHERE customer_db_id IN (SELECT id FROM ib_customers WHERE office_id=$1)';params=allOfficeAccess(u)?[]:[scope(u)];}
  else if(!allOfficeAccess(u)){where='WHERE office_id=$1';params=[scope(u)];}
  else if(req.query.office_id){where='WHERE office_id=$1';params=[scope(u,req.query.office_id)];}
  if(req.query.search&&['customers','packages'].includes(req.params.name)){
    const field=req.params.name==='customers'?"(customer_id ILIKE $N OR customer_name ILIKE $N OR mobile ILIKE $N OR area ILIKE $N)":"package_name ILIKE $N";
    const token='$'+(params.length+1);where+=(where?' AND ':'WHERE ')+field.replaceAll('$N',token);params.push('%'+String(req.query.search).slice(0,100)+'%');
  }
  if(req.params.name==='isp-payments'&&req.query.month){
    params.push(month(req.query.month));
    where+=(where?' AND ':'WHERE ')+`bill_month=$${params.length}`;
  }
  const order=req.params.name==='customers'?"CASE WHEN customer_id ~* '^gns[0-9]{1,12}$' THEN 0 ELSE 1 END,CASE WHEN customer_id ~* '^gns[0-9]{1,12}$' THEN SUBSTRING(customer_id FROM 4)::BIGINT END,customer_id,id":'id DESC';
  const rows=await all(pool,`SELECT ${def.secret?'id,office_id,name,username,role,status,created_date':'*'} FROM ${def.table} ${where} ORDER BY ${order} LIMIT 2000`,params);res.json(rows);
});
entities.post('/:name',async(req,res)=>{
  const def=definitions[req.params.name];if(!def)fail(404,'Unknown module.');const u=req.user,b=req.body||{};
  if(def.secret)onlySuper(u);
  if(def.global)onlySuper(u);
  let data={};for(const key of def.fields)if(Object.hasOwn(b,key))data[key]=b[key];
  if(!def.global&&!def.append&&!def.secret){data.office_id=scope(u,b.office_id);requireOffice(u,data.office_id);await knownOffice(data.office_id);}
  if(Object.hasOwn(data,'expense_type'))data.expense_type=normalizedExpenseType(data.expense_type);
  for(const key of def.required||[])errorIfMissing(data[key],key);
  for(const key of def.money||[])if(data[key]!=null)data[key]=(money(data[key])/100).toFixed(2);
  for(const key of def.dates||[])if(data[key])data[key]=date(data[key]);else if(data[key]==='')data[key]=null;
  if(data.bill_month)data.bill_month=month(data.bill_month);
  if(data.salary_month)data.salary_month=month(data.salary_month);
  if(data.status&&!['active','inactive'].includes(data.status))fail(400,'Invalid status.');
  if(req.params.name==='customers'&&Number(data.package_id||0)>0){const p=await one(pool,'SELECT id FROM ib_packages WHERE id=$1 AND office_id=$2',[data.package_id,data.office_id]);if(!p)fail(400,'Package does not belong to this office.');}
  if(req.params.name==='users'){
    if(!['Super Admin','Office Admin','Collection User','Support User','Payment Collector'].includes(data.role))fail(400,'Invalid role.');
    data.office_id=await userOffice(data.role,b.office_id);
    errorIfMissing(b.password,'password');if(String(b.password).length<8)fail(400,'Password must contain at least 8 characters.');data.password=await bcrypt.hash(String(b.password),12);
  }
  if(def.append){const c=await one(pool,'SELECT * FROM ib_customers WHERE id=$1 AND status=$2',[b.customer_db_id,'active']);if(!c)fail(400,'Select an active customer.');requireOffice(u,c.office_id);
    data={customer_db_id:c.id,customer_id:c.customer_id};
    if(req.params.name==='transfers'){data.old_package=String(c.package_id);data.new_package=String(b.new_package||'');data.type=['Package Upgrade','Line Transfer'].includes(b.type)?b.type:'Line Transfer';data.transfer_date=today();}
    else Object.assign(data,{customer_name:c.customer_name,package_id:c.package_id,monthly_bill:c.monthly_bill,entry_date:today()});
  }
  if(def.invoice){const tag=today().replaceAll('-','');const last=await one(pool,"SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no FROM '[0-9]+$') AS INTEGER)),0) AS n FROM ib_isp_payments WHERE invoice_no LIKE $1",[`ISP-${tag}-%`]);data.invoice_no=`ISP-${tag}-${String(Number(last.n)+1).padStart(4,'0')}`;}
  const keys=Object.keys(data);if(!keys.length)fail(400,'No fields provided.');
  const row=await one(pool,`INSERT INTO ${def.table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(data));if(def.secret)delete row.password;res.status(201).json(row);
});
entities.put('/:name/:id',async(req,res)=>{
  const def=definitions[req.params.name];if(!def||def.append)fail(404,'Unknown module.');const u=req.user;
  if(def.secret)onlySuper(u);
  if(def.global)onlySuper(u);
  const old=await accessRecord(pool,u,def,req.params.id),b=req.body||{},data={};
  for(const key of def.fields)if(Object.hasOwn(b,key))data[key]=b[key];
  if(!def.global&&!def.secret){const office=scope(u,data.office_id??old.office_id);requireOffice(u,office);await knownOffice(office);data.office_id=office;}
  if(Object.hasOwn(data,'expense_type'))data.expense_type=normalizedExpenseType(data.expense_type);
  for(const key of def.required||[])if(Object.hasOwn(data,key))errorIfMissing(data[key],key);
  for(const key of def.money||[])if(Object.hasOwn(data,key))data[key]=(money(data[key])/100).toFixed(2);
  for(const key of def.dates||[])if(Object.hasOwn(data,key))data[key]=data[key]?date(data[key]):null;
  if(data.bill_month)data.bill_month=month(data.bill_month);
  if(data.salary_month)data.salary_month=month(data.salary_month);
  if(data.status&&!['active','inactive'].includes(data.status))fail(400,'Invalid status.');
  if(req.params.name==='customers'&&Number(data.package_id??old.package_id)>0){const p=await one(pool,'SELECT id FROM ib_packages WHERE id=$1 AND office_id=$2',[data.package_id??old.package_id,data.office_id]);if(!p)fail(400,'Package does not belong to this office.');}
  if(req.params.name==='users'){
    if(data.role&&!['Super Admin','Office Admin','Collection User','Support User','Payment Collector'].includes(data.role))fail(400,'Invalid role.');
    if(Object.hasOwn(b,'password'))fail(403,'Use the password reset action to change a user password.');
    data.office_id=await userOffice(data.role??old.role,data.office_id??old.office_id);
  }
  delete data.invoice_no;
  const keys=Object.keys(data);if(!keys.length)fail(400,'No fields provided.');
  const row=await one(pool,`UPDATE ${def.table} SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${keys.length+1} RETURNING *`,[...Object.values(data),old.id]);if(def.secret)delete row.password;res.json(row);
});
entities.delete('/:name/:id',async(req,res)=>{
  const def=definitions[req.params.name];if(!def||def.append)fail(404,'Unknown module.');if(def.global||def.secret)onlySuper(req.user);
  await tx(async db=>{
    const record=await accessRecord(db,req.user,def,req.params.id);
    if(req.params.name==='users'&&String(record.id)===String(req.user.id))fail(400,'Cannot delete your own account.');
    if(req.params.name==='offices'&&await one(db,"SELECT 1 FROM ib_customers WHERE office_id=$1 UNION ALL SELECT 1 FROM ib_users WHERE office_id=$1 LIMIT 1",[record.id]))fail(409,'Office contains customers or users.');
    if(req.params.name==='customers'&&!await one(db,'SELECT 1 FROM ib_payments WHERE customer_db_id=$1 LIMIT 1',[record.id])){
      await db.query('DELETE FROM ib_bill_lines WHERE customer_db_id=$1 AND monthly_bill=0 AND previous_due=0 AND total_due=0 AND paid_amount=0 AND balance_due=0',[record.id]);
    }
    await db.query(`DELETE FROM ${def.table} WHERE id=$1`,[record.id]);
  });
  res.status(204).end();
});
