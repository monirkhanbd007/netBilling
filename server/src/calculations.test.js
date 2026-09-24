import test from 'node:test';import assert from 'node:assert/strict';
import {billLine,financial} from './calculations.js';
test('bill snapshot includes previous due and exact partial payment balance',()=>{
 assert.deepEqual(billLine('900.25','150.10','400.20'),{monthly_bill:'900.25',previous_due:'150.10',total_due:'1050.35',paid_amount:'400.20',balance_due:'650.15',status:'due'});
 assert.equal(billLine('100','0','100').status,'paid');
});
test('dashboard net and due follow distinct original formulas',()=>{
 assert.deepEqual(financial('5000','2000','700','200','100'),{due:'3000.00',net_balance:'1000.00'});
});
