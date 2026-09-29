import assert from 'node:assert/strict';
import test from 'node:test';
import {buildBillReportCsv,reportStatus} from './report-summary.js';

test('report export follows the bill sheet and uses balance for payment status', () => {
  const report={monthly:'1200.00',previous_due:'600.00',total_due:'1800.00',paid:'600.00',balance:'1200.00',rows:[
    {customer_id:'ibn05',customer_name:'Abdul Jalil',mobile:'01712345678',address:'House 12, Road 4',pppoe_username:'ibn05',monthly_bill:'600.00',previous_due:'600.00',total_due:'1200.00',paid_amount:'0.00',balance_due:'1200.00'},
    {customer_id:'ibn11',customer_name:'=HYPERLINK("bad")',mobile:'',address:'IBN SINA',pppoe_username:'ibn11',monthly_bill:'600.00',previous_due:'0.00',total_due:'600.00',paid_amount:'600.00',balance_due:'0.00'}
  ]};
  assert.equal(reportStatus(report.rows[0]),'Pending');
  assert.equal(reportStatus(report.rows[1]),'Paid');
  const csv=buildBillReportCsv(report,'GNS-2','September 2026');
  const lines=csv.trimStart().split('\r\n');
  assert.equal(lines.length,5);
  assert.match(lines[0],/GNS-2 - Bill Report - September 2026/);
  assert.match(lines[1],/"SL No.","Customer ID","Customer Name","Mobile","Address","PPPoE Username"/);
  assert.match(lines[2],/"1","ibn05","Abdul Jalil","01712345678","House 12, Road 4"/);
  assert.match(lines[3],/"'=HYPERLINK\(""bad""\)"/);
  assert.match(lines[4],/"TOTAL".*"1200.00","600.00","1800.00","600.00","1200.00"/);
});
