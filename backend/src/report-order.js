const customerIdOrder=new Intl.Collator('en',{numeric:true,sensitivity:'base'});

export function sortReportRowsByCustomerId(rows){
 return [...rows].sort((a,b)=>customerIdOrder.compare(String(a.customer_id??''),String(b.customer_id??'')));
}
