const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('e:/raj/section1_data.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('e:/raj/section2_data.json', 'utf8'));

const s1Min = JSON.stringify(s1);
const s2Min = JSON.stringify(s2);

console.log('Section 1 minified length:', s1Min.length);
console.log('Section 2 minified length:', s2Min.length);

const script = `(async () => {
  const ACTOR = { id: 'usr-owner-001', name: 'Raj' };
  const S1_ID = 'sec-elec-001';
  const S2_ID = 'sec-water-002';
  const SK = { CUSTOMERS: 'col_db_customers_v6', BILLING_PERIODS: 'col_db_billing_periods_v6', COLLECTIONS: 'col_db_collections_v6' };
  function getStored(k, d) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } }
  function setStored(k, d) { localStorage.setItem(k, JSON.stringify(d)); }
  const S1_DATA = ${s1Min};
  const S2_DATA = ${s2Min};
  const s1 = S1_DATA, s2 = S2_DATA;
  console.log('S1 rows:', s1.length, 'S2 rows:', s2.length);
  const customers = getStored(SK.CUSTOMERS, []);
  const periods = getStored(SK.BILLING_PERIODS, []);
  const collections = getStored(SK.COLLECTIONS, []);
  const removeIds = new Set([...customers.filter(c => (c.assigned_section_ids || []).includes(S1_ID) || (c.assigned_section_ids || []).includes(S2_ID)).map(c => c.id)]);
  console.log('Removing customers:', removeIds.size);
  const remCustomers = customers.filter(c => !removeIds.includes(c.id));
  const remPeriods = periods.filter(p => !removeIds.includes(p.customer_id));
  const remCollections = collections.filter(c => !removeIds.includes(c.customer_id));
  setStored(SK.CUSTOMERS, remCustomers);
  setStored(SK.BILLING_PERIODS, remPeriods);
  setStored(SK.COLLECTIONS, remCollections);
  console.log('Old data deleted.');
  const now = new Date().toISOString();
  let created = 0, errors = 0;
  async function importSection(sectionId, data) {
    let cc = 0, ee = 0;
    const cl = getStored(SK.CUSTOMERS, []);
    const pl = getStored(SK.BILLING_PERIODS, []);
    const col = getStored(SK.COLLECTIONS, []);
    for (const row of data) {
      try {
        const code = row.customer_code || 'UNK-' + Date.now();
        const cid = 'cust-' + code;
        const opening = row.prev_balance || 0;
        const billAmt = row.this_month || 0;
        const paidAmt = row.pay || 0;
        const closing = Math.max(0, opening + billAmt - paidAmt);
        const totalDue = opening + billAmt;
        const curUnit = row.current_unit || 0;
        const prevUnit = row.previous_unit || 0;
        const units = row.units_consumed || Math.max(0, curUnit - prevUnit);
        const pid = 'bp-' + cid + '-' + sectionId + '-10-2026';
        cl.push({ id: cid, customer_code: code, full_name: row.full_name || 'Unknown', phone: '0000000000', email: '', house_number: '', building_name: '', address: 'Indore', city: 'Indore', notes: 'Imported from PDF October-26', is_active: true, assigned_section_ids: [sectionId], created_by: ACTOR.id, created_at: now, updated_at: now });
        pl.push({ id: pid, customer_id: cid, section_id: sectionId, billing_month: 10, billing_year: 2026, opening_balance: opening, bill_amount: billAmt, additional_charges: 0, credits_or_adjustments: 0, total_amount_due: totalDue, paid_amount: paidAmt, closing_balance: closing, due_date: '2026-10-05', payment_status: closing <= 0 ? 'Paid' : 'Pending', current_unit: curUnit, previous_unit: prevUnit, units_consumed: units, created_at: now, updated_at: now });
        if (paidAmt > 0) {
          const rn = 1000 + col.length + 1;
          col.push({ id: 'col-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).substr(2, 4), receipt_number: 'RCP-202610-' + rn, customer_id: cid, billing_period_id: pid, section_id: sectionId, amount: paidAmt, payment_method: 'Cash', notes: 'Imported from PDF October-26', status: 'Confirmed', collection_date: '2026-10-05', collection_time: '10:00:00', created_by: ACTOR.id, created_by_name: ACTOR.name, created_at: now, updated_at: now });
        }
        cc++;
      } catch (e) { ee++; console.error('Error ' + row.customer_code + ':', e.message); }
    }
    setStored(SK.CUSTOMERS, cl);
    setStored(SK.BILLING_PERIODS, pl);
    setStored(SK.COLLECTIONS, col);
    console.log('Section ' + sectionId + ': ' + cc + ' imported, ' + ee + ' errors');
    return { created: cc, errors: ee };
  }
  const r1 = await importSection(S1_ID, s1);
  const r2 = await importSection(S2_ID, s2);
  console.log('=== IMPORT COMPLETE ===');
  console.log('Section 1 (D1): ' + r1.created + ' customers');
  console.log('Section 2 (D2): ' + r2.created + ' customers');
  console.log('Reloading in 3s...');
  setTimeout(() => location.reload(), 3000);
})();`;

fs.writeFileSync('e:/raj/import_console_final.js', script);
console.log('Console script written to import_console_final.js');
console.log('Script length:', script.length, 'chars');