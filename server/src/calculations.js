export const cents=value=>Math.round(Number(value||0)*100);
export const taka=value=>(value/100).toFixed(2);
export function billLine(monthly,previous,paid=0){
 const total=cents(monthly)+cents(previous),received=Math.min(total,cents(paid)),balance=Math.max(0,total-received);
 return {monthly_bill:taka(cents(monthly)),previous_due:taka(cents(previous)),total_due:taka(total),paid_amount:taka(received),balance_due:taka(balance),status:balance?'due':'paid'};
}
export function financial(billing,received,isp,expense,salary){
 const [b,r,i,e,s]=[billing,received,isp,expense,salary].map(cents);
 return {due:taka(Math.max(0,b-r)),net_balance:taka(r-i-e-s)};
}
