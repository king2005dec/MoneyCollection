// ============================================================================
// BROWSER CONSOLE SCRIPT: Delete old data & import from PDFs (D1=Section 1, D2=Section 2)
// Paste this into your browser's DevTools Console on the app page.
// ============================================================================

(async () => {
  const ACTOR = { id: 'usr-owner-001', name: 'Raj' };
  const S1_ID = 'sec-elec-001';
  const S2_ID = 'sec-water-002';
  const SK = {
    CUSTOMERS: 'col_db_customers_v6',
    BILLING_PERIODS: 'col_db_billing_periods_v6',
    COLLECTIONS: 'col_db_collections_v6',
    AUDIT_LOGS: 'col_db_audit_logs_v1',
  };

  function getStored(key, def) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) { return def; }
  }
  function setStored(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // Section 1 data from D1.pdf
  const S1_DATA = `PASTE_SECTION1_JSON_HERE`;

  // Section 2 data from D2.pdf
  const S2_DATA = `PASTE_SECTION2_JSON_HERE`;

  const s1 = JSON.parse(S1_DATA);
  const s2 = JSON.parse(S2_DATA);

  console.log('Section 1 rows:', s1.length);
  console.log('Section 2 rows:', s2.length);

  // --- Delete old data for Section 1 & 2 ---
  const customers = getStored(SK.CUSTOMERS, []);
  const periods = getStored(SK.BILLING_PERIODS, []);
  const collections = getStored(SK.COLLECTIONS, []);

  const s1CustomerIds = customers.filter(c => (c.assigned_section_ids || []).includes(S1_ID)).map(c => c.id);
  const s2CustomerIds = customers.filter(c => (c.assigned_section_ids || []).includes(S2_ID)).map(c => c.id);
  const allRemoveIds = [...new Set([...s1CustomerIds, ...s2CustomerIds])];

  console.log('Customers to remove:', allRemoveIds.length);

  const remainingCustomers = customers.filter(c => !allRemoveIds.includes(c.id));
  const remainingPeriods = periods.filter(p => !(allRemoveIds.includes(p.customer_id)));
  const remainingCollections = collections.filter(c => !(allRemoveIds.includes(c.customer_id)));

  setStored(SK.CUSTOMERS, remainingCustomers);
  setStored(SK.BILLING_PERIODS, remainingPeriods);
  setStored(SK.COLLECTIONS, remainingCollections);
  console.log('Old data deleted. Remaining customers:', remainingCustomers.length);

  // --- Import new data ---
  const now = new Date().toISOString();
  let created = 0;
  let errors = 0;

  async function importSection(sectionId, data) {
    let cCount = 0;
    let eCount = 0;

    const custList = getStored(SK.CUSTOMERS, []);
    const periodList = getStored(SK.BILLING_PERIODS, []);
    const colList = getStored(SK.COLLECTIONS, []);

    for (const row of data) {
      try {
        const code = row.customer_code || `UNK-${Date.now()}`;
        const cid = `cust-${code}`;

        // Create customer
        const customer = {
          id: cid,
          customer_code: code,
          full_name: row.full_name || 'Unknown',
          phone: '0000000000',
          email: '',
          house_number: '',
          building_name: '',
          address: 'Indore',
          city: 'Indore',
          notes: `Imported from PDF October-26`,
          is_active: true,
          assigned_section_ids: [sectionId],
          created_by: ACTOR.id,
          created_at: now,
          updated_at: now,
        };
        custList.push(customer);

        // Billing period
        const opening = row.prev_balance || 0;
        const billAmt = row.this_month || 0;
        const paidAmt = row.pay || 0;
        const closing = Math.max(0, opening + billAmt - paidAmt);
        const totalDue = opening + billAmt;
        const curUnit = row.current_unit || 0;
        const prevUnit = row.previous_unit || 0;
        const units = row.units_consumed || Math.max(0, curUnit - prevUnit);
        const periodId = `bp-${cid}-${sectionId}-10-2026`;

        periodList.push({
          id: periodId,
          customer_id: cid,
          section_id: sectionId,
          billing_month: 10,
          billing_year: 2026,
          opening_balance: opening,
          bill_amount: billAmt,
          additional_charges: 0,
          credits_or_adjustments: 0,
          total_amount_due: totalDue,
          paid_amount: paidAmt,
          closing_balance: closing,
          due_date: '2026-10-05',
          payment_status: closing <= 0 ? 'Paid' : 'Pending',
          current_unit: curUnit,
          previous_unit: prevUnit,
          units_consumed: units,
          created_at: now,
          updated_at: now,
        });

        // Collection record if paid
        if (paidAmt > 0) {
          const receiptNum = 1000 + colList.length + 1;
          colList.push({
            id: `col-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4)}`,
            receipt_number: `RCP-202610-${receiptNum}`,
            customer_id: cid,
            billing_period_id: periodId,
            section_id: sectionId,
            amount: paidAmt,
            payment_method: 'Cash',
            transaction_reference: undefined,
            notes: `Imported from PDF October-26`,
            status: 'Confirmed',
            collection_date: '2026-10-05',
            collection_time: '10:00:00',
            created_by: ACTOR.id,
            created_by_name: ACTOR.name,
            created_at: now,
            updated_at: now,
          });
        }

        cCount++;
      } catch (e) {
        eCount++;
        console.error(`Error ${row.customer_code}:`, e.message);
      }
    }

    setStored(SK.CUSTOMERS, custList);
    setStored(SK.BILLING_PERIODS, periodList);
    setStored(SK.COLLECTIONS, colList);
    console.log(`Section ${sectionId}: ${cCount} imported, ${eCount} errors`);
    return { created: cCount, errors: eCount };
  }

  const r1 = await importSection(S1_ID, s1);
  const r2 = await importSection(S2_ID, s2);

  console.log('\n=== IMPORT COMPLETE ===');
  console.log(`Section 1 (D1): ${r1.created} customers`);
  console.log(`Section 2 (D2): ${r2.created} customers`);
  console.log('Page will reload in 3 seconds...');
  setTimeout(() => location.reload(), 3000);
})();
