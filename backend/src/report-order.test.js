import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sortReportRowsByCustomerId} from './report-order.js';

test('report rows use natural Customer ID order without changing bill rows',()=>{
 const rows=['gns445mehedi','gin10','GNS44','gin2','gns9','gin401'].map(customer_id=>({customer_id}));
 const sorted=sortReportRowsByCustomerId(rows);
 assert.deepEqual(sorted.map(row=>row.customer_id),['gin2','gin10','gin401','gns9','GNS44','gns445mehedi']);
 assert.equal(rows[0].customer_id,'gns445mehedi');
});
