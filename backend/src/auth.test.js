import assert from 'node:assert/strict';
import {test} from 'node:test';
import {allOfficeAccess,paymentCollectorRoute,requireOffice,scope} from './auth.js';

test('all-office users can select a real office without gaining Super Admin status',()=>{
 const user={role:'Payment Collector',office_id:0};
 assert.equal(allOfficeAccess(user),true);
 assert.equal(requireOffice(user,scope(user,4)),4);
 assert.throws(()=>requireOffice(user,scope(user,0)),{status:403});
});

test('single-office users remain scoped to their assigned office',()=>{
 const user={role:'Payment Collector',office_id:4};
 assert.equal(allOfficeAccess(user),false);
 assert.equal(requireOffice(user,scope(user,9)),4);
 assert.throws(()=>requireOffice(user,9),{status:403});
});

test('payment collector API permits collecting and printing but not management or reversals',()=>{
 for(const [method,path] of [['GET','/me'],['GET','/entities/offices'],['GET','/bills'],['GET','/payments'],['GET','/payments/12'],['POST','/payments'],['GET','/slips'],['PUT','/me/password'],['POST','/logout']]){
  assert.equal(paymentCollectorRoute(method,path),true,`${method} ${path}`);
 }
 for(const [method,path] of [['GET','/dashboard'],['GET','/entities/customers'],['GET','/entities/users'],['GET','/report'],['GET','/backup'],['POST','/bills/process'],['DELETE','/payments/12'],['PUT','/settings']]){
  assert.equal(paymentCollectorRoute(method,path),false,`${method} ${path}`);
 }
});
