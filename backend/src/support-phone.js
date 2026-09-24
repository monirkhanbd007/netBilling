import {one} from './db.js';

const fallbackPhone = '01979900247';
export const supportPhoneKey = officeId => `support_phone_office_${officeId}`;

export async function readSupportPhone(db, officeId) {
  const key = supportPhoneKey(officeId);
  const row = await one(db,
    "SELECT key,value FROM ib_settings WHERE key IN ($1,'support_phone') ORDER BY CASE WHEN key=$1 THEN 0 ELSE 1 END LIMIT 1",
    [key]);
  return {value: row?.value || fallbackPhone, inherited: row?.key !== key};
}
