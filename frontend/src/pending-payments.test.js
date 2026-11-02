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

test('processed collection excludes inactive customers with unpaid bill lines', () => {
  const bill = {office_id: 4, month: '2026-09', batch: {id: 8}, rows};
  assert.deepEqual(pendingBillCustomers(bill, customers, 4, '2026-09').map(row => row.customer_db_id), [2]);
});

test('payment collector can use active status from bill data without customer credentials', () => {
  const bill = {office_id: 4, month: '2026-09', batch: null, rows: [
    {customer_db_id: 1, balance_due: '150.00', customer_status: 'active'},
    {customer_db_id: 2, balance_due: '300.00', customer_status: 'inactive'}
  ]};
  assert.deepEqual(pendingBillCustomers(bill, [], 4, '2026-09').map(row => row.customer_db_id), [1]);
  bill.batch = {id: 8};
  assert.deepEqual(pendingBillCustomers(bill, [], 4, '2026-09').map(row => row.customer_db_id), [1]);
});

test('previous-month bill status keeps historical pending bills available after inactivation', () => {
  const bill = {office_id: 4, month: '2026-10', batch: {id: 9}, rows: [
    {customer_db_id: 3, balance_due: '300.00', customer_status: 'active'}
  ]};
  assert.deepEqual(pendingBillCustomers(bill, customers, 4, '2026-10').map(row=>row.customer_db_id), [3]);
  bill.month='2026-11';
  bill.rows[0].customer_status='inactive';
  assert.deepEqual(pendingBillCustomers(bill, customers, 4, '2026-11'), []);
});
