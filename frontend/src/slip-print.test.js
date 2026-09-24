import assert from 'node:assert/strict';
import test from 'node:test';
import {buildSlipPrintHtml,printableSlipRows} from './slip-print.js';

test('A4 slips render two customer pairs per page from escaped database fields', () => {
  const slips = {
    month: '2026-09',
    office: {office_name:'GNS-2',address:'Ansar Academy, Shafipur',phone:'01713818085'},
    support_phone:'01979900247',
    rows:[
      {customer_id:'ibn05',customer_name:'Abdul Jalil',monthly_bill:'600.00',previous_due:'600.00',total_due:'1200.00',paid_amount:'0.00',balance_due:'1200.00'},
      {customer_id:'test',customer_name:'No bill',total_due:'0.00'},
      {customer_id:'ibn11',customer_name:'Abdur Rashid',monthly_bill:'600.00',previous_due:'0.00',total_due:'600.00',paid_amount:'600.00',balance_due:'0.00'},
      {customer_id:'unsafe',customer_name:'<script>alert(1)</script>',monthly_bill:'1.00',previous_due:'0.00',total_due:'1.00',paid_amount:'0.00',balance_due:'1.00'}
    ]
  };
  assert.equal(printableSlipRows(slips).length,3);
  const html=buildSlipPrintHtml(slips);
  assert.equal((html.match(/class="page"/g)||[]).length,2);
  assert.equal((html.match(/class="slip"/g)||[]).length,6);
  assert.match(html,/@page\{size:A4 landscape/);
  assert.match(html,/অফিস কপি/);
  assert.match(html,/গ্রাহক কপি/);
  assert.match(html,/সেপ্টেম্বর ২০২৬/);
  assert.match(html,/01713818085/);
  assert.match(html,/01979900247/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
});
