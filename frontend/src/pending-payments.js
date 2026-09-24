export function pendingBillCustomers(bill, customers, officeId, month) {
  if (!bill || Number(bill.office_id) !== Number(officeId) || bill.month !== month) return [];

  const activeIds = new Set(customers
    .filter(customer => Number(customer.office_id) === Number(officeId) && customer.status === 'active')
    .map(customer => Number(customer.id)));

  return (bill.rows ?? []).filter(row => Number(row.balance_due) > 0 &&
    (bill.batch || activeIds.has(Number(row.customer_db_id))));
}
