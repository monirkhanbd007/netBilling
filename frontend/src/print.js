import {buildSlipPrintHtml,printableSlipRows} from './slip-print.js';

async function showSlips() {
  const params=new URLSearchParams(window.location.search);
  const officeId=params.get('office_id'),month=params.get('month');
  if(!/^\d+$/.test(officeId||'')||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))throw Error('অফিস বা মাস নির্বাচন ঠিক নেই।');
  const response=await fetch(`/api/slips?office_id=${encodeURIComponent(officeId)}&month=${encodeURIComponent(month)}`,{credentials:'same-origin'});
  if(!response.ok)throw Error(response.status===401?'সেশন শেষ হয়েছে। আবার লগইন করুন।':'বিল স্লিপ লোড করা যায়নি।');
  const slips=await response.json();
  if(!printableSlipRows(slips).length)throw Error('এই মাসে ছাপানোর মতো বিল স্লিপ নেই।');
  document.open();
  document.write(buildSlipPrintHtml(slips));
  document.close();
  document.getElementById('print-button').addEventListener('click',()=>window.print());
  document.getElementById('back-button').addEventListener('click',()=>window.location.assign('/'));
}

showSlips().catch(error=>{document.getElementById('status').textContent=error.message;});
