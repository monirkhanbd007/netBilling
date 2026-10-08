import assert from 'node:assert/strict';
import {test} from 'node:test';
import {today,monthNow} from './business-date.js';

test('default billing date and month follow Bangladesh midnight',()=>{
 const before=new Date('2026-09-30T17:59:59Z');
 const after=new Date('2026-09-30T18:00:00Z');
 assert.equal(today(before),'2026-09-30');
 assert.equal(today(after),'2026-10-01');
 assert.equal(monthNow(after),'2026-10');
});
