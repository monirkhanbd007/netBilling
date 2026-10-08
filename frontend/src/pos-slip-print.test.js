import assert from 'node:assert/strict';
import test from 'node:test';
import {buildPosSlipHtml} from './pos-slip-print.js';

const slips={month:'2026-09',office:{id:4,office_name:'GNS-2',address:'Shafipur',phone:'01700000000'},support_phone:'01979900247',payment_numbers:{bkash:'01711111111',nagad:'01822222222',rocket:''},rows:[{customer_db_id:5,customer_id:'ibn05',customer_name:'<Abdul Jalil>',pppoe_username:'ibn05',area:'IBN SINA',monthly_bill:'600.00',previous_due:'600.00',total_due:'1200.00',paid_amount:'0.00',balance_due:'1200.00'}]};

test('80 mm POS slip prints one escaped customer bill without settlement amounts',()=>{
  const html=buildPosSlipHtml(slips);
  assert.match(html,/width:80mm/);
  assert.match(html,/সেপ্টেম্বর ২০২৬/);
  assert.match(html,/&lt;Abdul Jalil&gt;/);
  assert.match(html,/৳১,২০০\.০০/);
  assert.match(html,/01711111111/);
  assert.match(html,/01822222222/);
  assert.match(html,/Support 24\/7 Person:<\/b> 01979900247/);
  assert.match(html,/id="back-button"[^>]*>← Back/);
  assert.match(html,/id="search-button"[^>]*>Search New Bill Slip/);
  assert.doesNotMatch(html,/পরিশোধিত|<span>বাকি<\/span>|01700000000/);
});

test('POS print refuses a batch of customers',()=>{
  assert.throws(()=>buildPosSlipHtml({...slips,rows:[...slips.rows,...slips.rows]}),/Select one/);
  assert.throws(()=>buildPosSlipHtml({...slips,rows:[]}),/Select one/);
});

test('POS slip prints a zero bill without requiring a payment',()=>{
  const html=buildPosSlipHtml({...slips,rows:[{...slips.rows[0],monthly_bill:'0.00',previous_due:'0.00',total_due:'0.00',paid_amount:'0.00',balance_due:'0.00'}]});
  assert.match(html,/&lt;Abdul Jalil&gt;/);
  assert.equal((html.match(/৳০\.০০/g)||[]).length,3);
  assert.doesNotMatch(html,/পেমেন্ট রসিদ/);
});

test('recorded POS payment shows the saved amount and receipt details',()=>{
  const payment={office_id:4,customer_db_id:5,bill_month:'2026-09',amount:'350.00',receipt_no:'RC-123',payment_date:'2026-09-27T00:00:00.000Z',payment_method:'bKash'};
  const html=buildPosSlipHtml(slips,payment);
  assert.match(html,/পরিশোধিত টাকা/);
  assert.match(html,/৳৩৫০\.০০/);
  assert.match(html,/RC-123/);
  assert.match(html,/২৭ সেপ্টেম্বর/);
  assert.match(html,/bKash/);
  assert.doesNotMatch(html,/<span>বাকি<\/span>/);
  assert.throws(()=>buildPosSlipHtml(slips,{...payment,customer_db_id:6}),/does not match/);
  assert.throws(()=>buildPosSlipHtml(slips,{...payment,bill_month:'2026-08'}),/does not match/);
});
