import {one} from './db.js';

export const paymentNumbersKey = officeId => `payment_numbers_office_${officeId}`;

export function paymentNumbers(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(['bkash', 'nagad', 'rocket'].map(method => [method,
    typeof input[method] === 'string' ? input[method].trim() : '']));
}

export async function readPaymentNumbers(db, officeId) {
  const row = await one(db, 'SELECT value FROM ib_settings WHERE key=$1', [paymentNumbersKey(officeId)]);
  return paymentNumbers(row?.value);
}
