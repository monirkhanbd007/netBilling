import assert from 'node:assert/strict';
import test from 'node:test';
import {buildPosSlipHtml} from './pos-slip-print.js';

const slips={month:'2026-09',office:{office_name:'GNS-2',address:'Shafipur',phone:'01700000000'},support_phone:'01979900247',payment_numbers:{bkash:'01711111111',nagad:'01822222222',rocket:''},rows:[{customer_id:'ibn05',customer_name:'<Abdul Jalil>',pppoe_username:'ibn05',area:'IBN SINA',monthly_bill:'600.00',previous_due:'600.00',total_due:'1200.00',paid_amount:'0.00',balance_due:'1200.00'}]};

test('80 mm POS slip prints one escaped customer bill without settlement amounts',()=>{
  const html=buildPosSlipHtml(slips);
  assert.match(html,/width:80mm/);
  assert.match(html,/সেপ্টেম্বর ২০২৬/);
  assert.match(html,/&lt;Abdul Jalil&gt;/);
  assert.match(html,/৳১,২০০\.০০/);
  assert.match(html,/01711111111/);
  assert.match(html,/01822222222/);
  assert.match(html,/Support 24\/7 Person:<\/b> 01979900247/);
  assert.doesNotMatch(html,/পরিশোধিত|<span>বাকি<\/span>|01700000000/);
});

test('POS print refuses a batch of customers',()=>{
  assert.throws(()=>buildPosSlipHtml({...slips,rows:[...slips.rows,...slips.rows]}),/Select one/);
  assert.throws(()=>buildPosSlipHtml({...slips,rows:[]}),/Select one/);
});
