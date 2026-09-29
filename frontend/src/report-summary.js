export const reportStatus = row => Number(row.balance_due) > 0 ? 'Pending' : 'Paid';

const csvCell = value => {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

const columns = ['SL No.', 'Customer ID', 'Customer Name', 'Mobile', 'Address', 'PPPoE Username',
  'Monthly Bill', 'Previous Due', 'Total Due', 'Paid Amount', 'Pending Due', 'Status'];

export function buildBillReportCsv(report, officeName, monthName) {
  const line = cells => cells.map(csvCell).join(',');
  const rows = report.rows.map((row, index) => line([
    index + 1, row.customer_id, row.customer_name, row.mobile, row.address, row.pppoe_username,
    row.monthly_bill, row.previous_due, row.total_due, row.paid_amount, row.balance_due, reportStatus(row)
  ]));
  const total = line(['', 'TOTAL', '', '', '', '', report.monthly, report.previous_due,
    report.total_due, report.paid, report.balance, '']);
  return '\uFEFF' + [line([`${officeName} - Bill Report - ${monthName}`]), line(columns), ...rows, total].join('\r\n');
}
