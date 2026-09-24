import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readSupportPhone} from './support-phone.js';

test('support phone prefers the selected office and falls back to the old shared setting', async () => {
  const settings = new Map([
    ['support_phone', '01979900247'],
    ['support_phone_office_4', '01711111111'],
    ['support_phone_office_5', '01822222222']
  ]);
  const db = {query: async (_sql, [key]) => {
    const selected = settings.has(key) ? key : 'support_phone';
    return {rows: settings.has(selected) ? [{key:selected, value:settings.get(selected)}] : []};
  }};

  assert.deepEqual(await readSupportPhone(db, 4), {value:'01711111111', inherited:false});
  assert.deepEqual(await readSupportPhone(db, 5), {value:'01822222222', inherited:false});
  assert.deepEqual(await readSupportPhone(db, 6), {value:'01979900247', inherited:true});
  settings.delete('support_phone');
  assert.deepEqual(await readSupportPhone(db, 6), {value:'01979900247', inherited:true});
});
