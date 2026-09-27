import assert from 'node:assert/strict';
import test from 'node:test';
import {buildSlipPrintHtml,printableSlipRows} from './slip-print.js';

test('A4 slips render four customer pairs per page from escaped database fields', () => {
  const slips = {
    month: '2026-09',
    office: {office_name:'GNS-2',address:'Ansar Academy, Shafipur',phone:'01713818085'},
    support_phone:'01979900247',
    rows:[
      {customer_id:'ibn05',customer_name:'Abdul Jalil',monthly_bill:'600.00',previous_due:'600.00',total_due:'1200.00',paid_amount:'0.00',balance_due:'1200.00'},
      {customer_id:'test',customer_name:'No bill',total_due:'0.00'},
      {customer_id:'ibn11',customer_name:'Abdur Rashid',monthly_bill:'600.00',previous_due:'0.00',total_due:'600.00',paid_amount:'600.00',balance_due:'0.00'},
      {customer_id:'unsafe',customer_name:'<script>alert(1)</script>',monthly_bill:'1.00',previous_due:'0.00',total_due:'1.00',paid_amount:'0.00',balance_due:'1.00'},
      {customer_id:'fourth',customer_name:'Fourth customer',monthly_bill:'500.00',previous_due:'0.00',total_due:'500.00',paid_amount:'0.00',balance_due:'500.00'},
      {customer_id:'fifth',customer_name:'Fifth customer',monthly_bill:'500.00',previous_due:'0.00',total_due:'500.00',paid_amount:'0.00',balance_due:'500.00'}
    ]
  };
  assert.equal(printableSlipRows(slips).length,5);
  const html=buildSlipPrintHtml(slips);
  const pages=html.match(/<section class="page">[\s\S]*?<\/section>/g)||[];
  assert.equal(pages.length,2);
  assert.equal((pages[0].match(/class="slip"/g)||[]).length,8);
  assert.equal((pages[0].match(/অফিস কপি/g)||[]).length,4);
  assert.equal((pages[0].match(/গ্রাহক কপি/g)||[]).length,4);
  assert.equal((pages[1].match(/class="slip"/g)||[]).length,2);
  assert.match(html,/@page\{size:A4 portrait/);
  assert.match(html,/অফিস কপি/);
  assert.match(html,/গ্রাহক কপি/);
  assert.match(html,/সেপ্টেম্বর ২০২৬/);
  assert.match(html,/01713818085/);
  assert.match(html,/01979900247/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
});
