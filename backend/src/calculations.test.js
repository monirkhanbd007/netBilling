import test from 'node:test';import assert from 'node:assert/strict';
import {billLine,financial,outstanding} from './calculations.js';
test('bill snapshot includes previous due and exact partial payment balance',()=>{
 assert.deepEqual(billLine('900.25','150.10','400.20'),{monthly_bill:'900.25',previous_due:'150.10',total_due:'1050.35',paid_amount:'400.20',balance_due:'650.15',status:'due'});
 assert.equal(billLine('100','0','100').status,'paid');
});
test('dashboard due sums bill balances including previous due and partial payments',()=>{
 const rows=[billLine('600','600','0'),billLine('800','0','500'),billLine('500','0','500')];
 assert.equal(outstanding(rows),'1500.00');
 assert.deepEqual(financial('2000','700','200','100'),{net_balance:'1000.00'});
});
