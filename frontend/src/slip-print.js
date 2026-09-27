const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const valueOrDash = value => escapeHtml(String(value ?? '').trim() || '—');
const bengaliNumber = value => new Intl.NumberFormat('bn-BD', { useGrouping: false }).format(value);
const bengaliMoney = value => `৳${new Intl.NumberFormat('bn-BD', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(Number(value || 0))}`;
const bengaliMonth = month => new Intl.DateTimeFormat('bn-BD', {
  month: 'long', year: 'numeric', timeZone: 'UTC'
}).format(new Date(`${month}-01T00:00:00Z`));

export const printableSlipRows = slips => (slips?.rows || []).filter(row => Number(row.total_due) > 0);

function slipCard(slips, row, index, count, copy) {
  const office = slips.office || {};
  const serial = `${bengaliNumber(index + 1).padStart(2, '০')} / ${bengaliNumber(count)}`;
  const detail = (label, value, wide = false) => `<div class="detail${wide ? ' wide' : ''}"><dt>${label}</dt><dd>${valueOrDash(value)}</dd></div>`;
  const methods = [['বিকাশ', slips.payment_numbers?.bkash], ['নগদ', slips.payment_numbers?.nagad], ['রকেট', slips.payment_numbers?.rocket]]
    .filter(([, number]) => String(number ?? '').trim());
  const payment = methods.length
    ? methods.map(([label, number]) => `<span><b>${label}:</b> ${valueOrDash(number)}</span>`).join('')
    : `<span><b>বিল পরিশোধ:</b> ${valueOrDash(office.phone)}</span>`;
  return `<article class="slip">
    <div class="slip-top"><span class="copy-name">${copy}</span><span class="slip-number">বিল স্লিপ নং ${serial}</span></div>
    <header class="office"><h1>${valueOrDash(office.office_name)}</h1><p>${valueOrDash(office.address)}</p></header>
    <div class="month-band"><span>ইন্টারনেট বিল</span><strong>${escapeHtml(bengaliMonth(slips.month))}</strong></div>
    <dl class="details">
      ${detail('গ্রাহকের নাম', row.customer_name)}
      ${detail('গ্রাহক আইডি', row.customer_id)}
      ${detail('সিরিয়াল / PPPoE', row.pppoe_username || row.customer_id)}
      ${detail('এলাকা', row.area)}
      ${detail('ঠিকানা', row.address || office.address, true)}
      ${detail('ফোন', row.mobile, true)}
    </dl>
    <div class="amounts">
      <div><span>মাসিক বিল</span><strong>${bengaliMoney(row.monthly_bill)}</strong></div>
      <div><span>আগের বকেয়া</span><strong>${bengaliMoney(row.previous_due)}</strong></div>
      <div class="total"><span>মোট বিল</span><strong>${bengaliMoney(row.total_due)}</strong></div>
    </div>
    <div class="settlement"><span>পরিশোধিত <b>${bengaliMoney(row.paid_amount)}</b></span><span>বাকি <b>${bengaliMoney(row.balance_due)}</b></span></div>
    <footer class="footer"><div class="payment-numbers">${payment}</div><div class="footer-bottom"><span><b>সহায়তা:</b> ${valueOrDash(slips.support_phone)}</span><small class="signature">আদায়কারীর স্বাক্ষর</small></div></footer>
  </article>`;
}

export function buildSlipPrintHtml(slips) {
  const rows = printableSlipRows(slips);
  const sheets = [];
  for (let i = 0; i < rows.length; i += 4) {
    const cards = [];
    for (let j = i; j < i + 4; j++) {
      if (rows[j]) cards.push(slipCard(slips, rows[j], j, rows.length, 'অফিস কপি'), slipCard(slips, rows[j], j, rows.length, 'গ্রাহক কপি'));
      else cards.push('<div class="blank"></div>', '<div class="blank"></div>');
    }
    sheets.push(`<section class="page"><span class="cut-line cut-quarter"></span><span class="cut-line cut-three-quarter"></span>${cards.join('')}</section>`);
  }
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>বিল স্লিপ · ${escapeHtml(slips.office?.office_name)} · ${escapeHtml(slips.month)}</title>
  <style>
    *{box-sizing:border-box}html{background:#eaf0f2}body{margin:0;color:#173340;font-family:'Noto Sans Bengali','Nirmala UI','Vrinda',sans-serif;font-size:9pt}
    .toolbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 24px;background:#102d3b;color:#fff;font:13px Arial,sans-serif}
    .toolbar-actions{display:flex;gap:8px}.toolbar button{border:0;border-radius:8px;background:#11a69e;color:white;font:700 13px Arial,sans-serif;padding:10px 18px;cursor:pointer}.toolbar #back-button{background:#ffffff20}
    .page{position:relative;width:200mm;height:287mm;margin:20px auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));background:white;box-shadow:0 8px 32px #18364425;break-after:page;page-break-after:always}
    .page:last-child{break-after:auto;page-break-after:auto}
    .page:before,.page:after{content:'';position:absolute;z-index:1;pointer-events:none}
    .page:before{top:0;bottom:0;left:50%;border-left:1px dashed #879ba2}
    .page:after{left:0;right:0;top:50%;border-top:1px dashed #879ba2}
    .cut-line{position:absolute;left:0;right:0;z-index:1;pointer-events:none;border-top:1px dashed #879ba2}.cut-quarter{top:25%}.cut-three-quarter{top:75%}
    .slip{min-width:0;min-height:0;margin:1mm;padding:1.9mm 2mm 1.6mm;border:1px solid #a7bac2;border-top:.7mm solid #119b96;overflow:hidden;display:flex;flex-direction:column;gap:1mm}
    .slip-top{display:flex;justify-content:space-between;align-items:center;gap:2mm;color:#237a79;font-weight:800;font-size:6.4pt;line-height:1}
    .copy-name{background:#e4f5f2;border-radius:3px;padding:.8mm 1.2mm}.slip-number{white-space:nowrap}
    .office{text-align:center;min-height:9mm}.office h1{margin:0;color:#143946;font-size:13pt;line-height:1.12;letter-spacing:.02em}.office p{margin:.5mm 0 0;color:#526b75;font-size:6.5pt;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .month-band{display:flex;justify-content:space-between;align-items:center;background:#eaf5f4;color:#176864;border-radius:3px;padding:.8mm 1.2mm;font-size:6.3pt;line-height:1}.month-band strong{font-size:7.3pt}
    .details{display:grid;grid-template-columns:1fr 1fr;column-gap:1.5mm;row-gap:.5mm;margin:0}.detail{min-width:0;display:flex;align-items:baseline;gap:.7mm;border-bottom:1px solid #e0e9ec;padding:0 0 .5mm;line-height:1.08}.detail.wide{grid-column:1/-1}.detail dt{flex:none;color:#5e7780;font-size:6pt}.detail dd{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;font-size:7.2pt}
    .amounts{display:grid;grid-template-columns:1fr 1fr 1.13fr;gap:.7mm}.amounts>div{border:1px solid #dae7e8;border-radius:3px;padding:1mm .8mm;min-width:0}.amounts .total{border-color:#158f89;background:#eff8f6}.amounts span{display:block;color:#5e7880;font-size:5.8pt;line-height:1}.amounts strong{display:block;margin-top:.5mm;color:#173943;font-size:9pt;line-height:1.12}.amounts .total strong{color:#087a75}
    .settlement{display:flex;justify-content:space-between;align-items:center;gap:2mm;border-bottom:1px solid #d5e3e6;padding-bottom:.6mm;color:#58717a;font-size:6.5pt;line-height:1}.settlement b{color:#163b48;font-size:7.5pt}.settlement span:last-child b{color:#b45332}
    .footer{display:flex;flex-direction:column;gap:1mm;margin-top:auto;font-size:6.3pt;line-height:1.1}.footer b{color:#42616b}.payment-numbers{display:flex;justify-content:space-between;gap:1mm;flex-wrap:wrap}.payment-numbers span{white-space:nowrap}.footer-bottom{display:flex;align-items:end;justify-content:space-between;gap:1mm}.footer small{color:#6e8790;font-size:5.8pt}.signature{border-top:1px dotted #91a7ad;text-align:center;padding-top:.5mm;min-width:23mm}
    @page{size:A4 portrait;margin:5mm}
    @media print{html{background:white}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}.page{width:200mm;height:287mm;margin:0 auto;box-shadow:none}}
  </style></head><body><div class="toolbar"><span>এ৪ পোর্ট্রেট · প্রতি পাতায় ৮ কপি (৪ অফিস + ৪ গ্রাহক) · কাটার দাগ অনুসরণ করুন</span><div class="toolbar-actions"><button type="button" id="back-button">← অ্যাপে ফিরে যান</button><button type="button" id="print-button">প্রিন্ট / PDF সংরক্ষণ</button></div></div>${sheets.join('')}</body></html>`;
}
