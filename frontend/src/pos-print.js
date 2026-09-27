import {buildPosSlipHtml} from './pos-slip-print.js';

async function showPosSlip() {
  const params=new URLSearchParams(window.location.search);
  const officeId=params.get('office_id'),month=params.get('month'),customerId=params.get('customer_db_id');
  if(!/^\d+$/.test(officeId||'')||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!/^\d+$/.test(customerId||''))throw Error('অফিস, মাস বা গ্রাহক নির্বাচন ঠিক নেই।');
  const query=new URLSearchParams({office_id:officeId,month,customer_db_id:customerId});
  const response=await fetch(`/api/slips?${query}`,{credentials:'same-origin'});
  if(!response.ok)throw Error(response.status===401?'সেশন শেষ হয়েছে। আবার লগইন করুন।':'POS বিল স্লিপ লোড করা যায়নি।');
  const slips=await response.json();
  const html=buildPosSlipHtml(slips);
  document.open();document.write(html);document.close();
  await document.fonts.ready;
  const receipt=document.querySelector('.receipt');
  const heightMm=Math.ceil(receipt.getBoundingClientRect().height/(96/25.4))+2;
  document.getElementById('page-size').textContent=`@page{size:80mm ${Math.max(heightMm,70)}mm;margin:0}`;
  document.getElementById('print-button').addEventListener('click',()=>window.print());
  document.getElementById('back-button').addEventListener('click',()=>window.close());
}

showPosSlip().catch(error=>{document.getElementById('status').textContent=error.message;});
