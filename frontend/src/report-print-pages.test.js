import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateReportRows} from './report-print-pages.js';

test('print report pages contain at most 20 customers in order', () => {
  const rows = Array.from({length: 41}, (_, index) => ({id: index + 1}));
  const pages = paginateReportRows(rows);
  assert.deepEqual(pages.map(page => page.length), [20, 20, 1]);
  assert.deepEqual(pages.flat(), rows);
});

test('an empty report still has one printable page', () => {
  assert.deepEqual(paginateReportRows([]), [[]]);
});
