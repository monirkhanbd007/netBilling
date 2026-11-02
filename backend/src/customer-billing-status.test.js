import assert from 'node:assert/strict';
import test from 'node:test';
import {billingStatusAt,recordBillingStatus,statusEffectiveMonth,billingStatusKey} from './customer-billing-status.js';

test('legacy inactive customers retain earlier months and stay inactive after November 2026',()=>{
 const customer={id:3,status:'inactive'},history={customers:{}};
 assert.equal(billingStatusAt(customer,'2026-10',history),'active');
 assert.equal(billingStatusAt(customer,'2026-11',history),'inactive');
 assert.equal(billingStatusAt(customer,'2027-01',history),'inactive');
 assert.equal(statusEffectiveMonth(customer,history),'2026-11');
});

test('status dates survive edits and reactivation without changing the inactive months',async()=>{
 const settings=new Map();
 const db={query:async(sql,params)=>{
  if(sql.startsWith('SELECT'))return {rows:settings.has(params[0])?[{value:structuredClone(settings.get(params[0]))}]:[]};
  settings.set(params[0],JSON.parse(params[1]));return {rows:[]};
 }};
 const active={id:3,office_id:4,status:'active'},inactive={...active,status:'inactive'};
 assert.equal(await recordBillingStatus(db,inactive,active,'2000-10'),'2000-10');
 await recordBillingStatus(db,inactive,inactive,'2000-10');
 await recordBillingStatus(db,active,inactive,'2001-01');
 const history=settings.get(billingStatusKey(4));
 assert.equal(history.customers['3'].changes.length,2);
 for(const [month,status] of [['2000-09','active'],['2000-10','inactive'],['2000-12','inactive'],['2001-01','active']]){
  assert.equal(billingStatusAt(active,month,history),status);
 }
 await assert.rejects(recordBillingStatus(db,inactive,active,'2000-09'),/cannot precede/);
 await assert.rejects(recordBillingStatus(db,active,active,'2000-10'),/must follow/);
 await assert.rejects(recordBillingStatus(db,inactive,active,'9999-01'),/future/);
 assert.equal(settings.get(billingStatusKey(4)).customers['3'].changes.length,2);
});

test('correcting an existing inactive starting month preserves the current status',async()=>{
 let history={customers:{}};
 const db={query:async(sql,params)=>{
  if(sql.startsWith('SELECT'))return {rows:[{value:structuredClone(history)}]};
  history=JSON.parse(params[1]);return {rows:[]};
 }};
 const customer={id:3,office_id:4,status:'inactive'};
 await recordBillingStatus(db,customer,customer,'2026-10');
 assert.equal(billingStatusAt(customer,'2026-09',history),'active');
 assert.equal(billingStatusAt(customer,'2026-10',history),'inactive');
});
