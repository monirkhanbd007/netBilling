import {bengaliMoney,bengaliMonth,escapeHtml,valueOrDash,printableSlipRows} from './slip-print.js';

export function buildPosSlipHtml(slips) {
  const rows=printableSlipRows(slips);
  if(rows.length!==1)throw Error('Select one billable customer for POS printing.');
  const row=rows[0],office=slips.office||{};
  const details=[
    ['গ্রাহকের নাম',row.customer_name],
    ['গ্রাহক আইডি',row.customer_id],
    ['PPPoE',row.pppoe_username||row.customer_id],
    ['এলাকা',row.area],
    ['ঠিকানা',row.address||office.address],
    ['ফোন',row.mobile]
  ].map(([label,value])=>`<div class="detail"><span>${label}</span><strong>${valueOrDash(value)}</strong></div>`).join('');
  const paymentMethods=[['বিকাশ',slips.payment_numbers?.bkash],['নগদ',slips.payment_numbers?.nagad],['রকেট',slips.payment_numbers?.rocket]]
    .filter(([,number])=>String(number??'').trim());
  const payment=paymentMethods.length
    ? paymentMethods.map(([label,number])=>`<div class="payment-row"><span>${label}</span><strong>${valueOrDash(number)}</strong></div>`).join('')
    : `<div class="payment-row"><span>বিল পরিশোধ</span><strong>${valueOrDash(office.phone)}</strong></div>`;
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>POS বিল স্লিপ · ${valueOrDash(office.office_name)} · ${valueOrDash(row.customer_id)}</title>
  <style>
    *{box-sizing:border-box}html{background:#e8edef}body{margin:0;color:#000;font-family:'Noto Sans Bengali','Nirmala UI','Vrinda',sans-serif;font-size:10pt}
    .toolbar{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 20px;background:#102d3b;color:#fff;font:13px Arial,sans-serif}
    .toolbar-actions{display:flex;gap:8px}.toolbar button{border:0;border-radius:8px;padding:10px 15px;background:#139d98;color:#fff;font:700 13px Arial,sans-serif;cursor:pointer}.toolbar #back-button{background:#ffffff22}
    .receipt{width:80mm;margin:22px auto;padding:4mm;background:#fff;box-shadow:0 7px 28px #1234;color:#000}
    .receipt *{color:#000}.office{text-align:center}.office h1{font-size:16pt;line-height:1.2;margin:0;overflow-wrap:anywhere}.office p{font-size:8pt;line-height:1.35;margin:1.5mm 0 0;overflow-wrap:anywhere}
    .rule{border:0;border-top:1px dashed #000;margin:3mm 0}.receipt-title{text-align:center;font-weight:800;font-size:12pt;margin:0}.month{text-align:center;font-size:9pt;margin:1mm 0 0}
    .detail,.amount,.payment-row{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;padding:1mm 0;border-bottom:1px dotted #777;line-height:1.25}
    .detail span,.amount span,.payment-row span{flex:none;font-size:8pt}.detail strong,.amount strong,.payment-row strong{text-align:right;font-size:9pt;font-weight:700;overflow-wrap:anywhere;min-width:0}
    .amounts{margin-top:2mm}.amount.total{border-top:1px solid #000;border-bottom:2px solid #000;padding:1.7mm 0}.amount.total span,.amount.total strong{font-size:11pt;font-weight:800}
    .section-label{font-weight:800;font-size:9pt;margin:3mm 0 1mm}.payment-row:last-child{border-bottom:0}.support{margin-top:3mm;font-size:8pt;line-height:1.3;overflow-wrap:anywhere}.signature{margin:7mm 0 0 32mm;border-top:1px dotted #000;padding-top:1mm;text-align:center;font-size:8pt}
    .thank-you{text-align:center;font-size:8pt;margin:4mm 0 0}
    @media print{html{background:#fff}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}.receipt{width:80mm;margin:0;padding:4mm;box-shadow:none}}
  </style><style id="page-size"></style></head><body>
    <div class="toolbar"><span>৮০ মিমি POS বিল স্লিপ · 80 mm কাগজ, কোনো মার্জিন বা হেডার/ফুটার নয়</span><div class="toolbar-actions"><button type="button" id="back-button">← Back</button><button type="button" id="search-button">Search New Customer</button><button type="button" id="print-button">POS প্রিন্ট</button></div></div>
    <article class="receipt"><header class="office"><h1>${valueOrDash(office.office_name)}</h1><p>${valueOrDash(office.address)}</p></header>
      <hr class="rule"><h2 class="receipt-title">ইন্টারনেট বিল স্লিপ</h2><p class="month">${escapeHtml(bengaliMonth(slips.month))} · গ্রাহক কপি</p><hr class="rule">
      <div class="details">${details}</div><div class="amounts"><div class="amount"><span>মাসিক বিল</span><strong>${bengaliMoney(row.monthly_bill)}</strong></div><div class="amount"><span>আগের বকেয়া</span><strong>${bengaliMoney(row.previous_due)}</strong></div><div class="amount total"><span>মোট বিল</span><strong>${bengaliMoney(row.total_due)}</strong></div></div>
      <p class="section-label">বিল পরিশোধের নম্বর</p><div class="payment-methods">${payment}</div><p class="support"><b>Support 24/7 Person:</b> ${valueOrDash(slips.support_phone)}</p><div class="signature">আদায়কারীর স্বাক্ষর</div><p class="thank-you">ইন্টারনেট সেবা ব্যবহারের জন্য ধন্যবাদ</p>
    </article></body></html>`;
}
