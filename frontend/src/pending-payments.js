export function pendingBillCustomers(bill, customers, officeId, month) {
  if (!bill || Number(bill.office_id) !== Number(officeId) || bill.month !== month) return [];

  const customerStatuses = new Map(customers
    .filter(customer => Number(customer.office_id) === Number(officeId))
    .map(customer => [Number(customer.id), customer.status]));

  return (bill.rows ?? []).filter(row => Number(row.balance_due) > 0 &&
    (row.customer_status ?? customerStatuses.get(Number(row.customer_db_id))) === 'active');
}
