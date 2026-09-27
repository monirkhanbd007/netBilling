import assert from 'node:assert/strict';
import test from 'node:test';
import {paymentNumbers,paymentNumbersKey,readPaymentNumbers} from './payment-numbers.js';

test('payment numbers belong to the selected office', async () => {
  const settings = new Map([
    [paymentNumbersKey(3), {bkash:'01711111111',nagad:'01811111111',rocket:''}],
    [paymentNumbersKey(4), {bkash:'01922222222',nagad:'',rocket:'01622222222'}]
  ]);
  const db = {query: async (_sql, [key]) => ({rows:settings.has(key) ? [{value:settings.get(key)}] : []})};
  assert.deepEqual(await readPaymentNumbers(db,3), {bkash:'01711111111',nagad:'01811111111',rocket:''});
  assert.deepEqual(await readPaymentNumbers(db,4), {bkash:'01922222222',nagad:'',rocket:'01622222222'});
  assert.deepEqual(await readPaymentNumbers(db,5), {bkash:'',nagad:'',rocket:''});
  assert.deepEqual(paymentNumbers({bkash:' 0171 ',nagad:null,rocket:123}), {bkash:'0171',nagad:'',rocket:''});
});
