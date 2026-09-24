import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pendingBillCustomers} from './pending-payments.js';

const customers = [
  {id: 1, office_id: 4, status: 'active'},
  {id: 2, office_id: 4, status: 'active'},
  {id: 3, office_id: 4, status: 'inactive'}
];
const rows = [
  {customer_db_id: 1, balance_due: '0.00'},
  {customer_db_id: 2, balance_due: '150.00'},
  {customer_db_id: 3, balance_due: '300.00'}
];

test('live collection offers only active customers with a remaining balance', () => {
  const bill = {office_id: 4, month: '2026-09', batch: null, rows};
  assert.deepEqual(pendingBillCustomers(bill, customers, 4, '2026-09').map(row => row.customer_db_id), [2]);
  assert.deepEqual(pendingBillCustomers(bill, customers, 4, '2026-10'), []);
  assert.deepEqual(pendingBillCustomers(bill, customers, 5, '2026-09'), []);
});

test('processed collection retains unpaid bill lines even if service is now inactive', () => {
  const bill = {office_id: 4, month: '2026-09', batch: {id: 8}, rows};
  assert.deepEqual(pendingBillCustomers(bill, customers, 4, '2026-09').map(row => row.customer_db_id), [2, 3]);
});
