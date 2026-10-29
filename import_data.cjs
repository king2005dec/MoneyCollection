// Set env vars before importing ES modules
process.env.VITE_SUPABASE_URL = 'https://wwremqgjkwhprambdlwc.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_UqPFp0hjCCKklqPZx8XzHA_5w93MP9r';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://wwremqgjkwhprambdlwc.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_UqPFp0hjCCKklqPZx8XzHA_5w93MP9r';

const fs = require('fs');

const ACTOR = { id: 'usr-owner-001', name: 'Raj' };
const SECTION_1_ID = 'sec-elec-001';
const SECTION_2_ID = 'sec-water-002';
const STORAGE_KEYS = {
  CUSTOMERS: 'col_db_customers_v6',
  BILLING_PERIODS: 'col_db_billing_periods_v6',
  COLLECTIONS: 'col_db_collections_v6',
};

function getStored(key, defaultData) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultData;
    return JSON.parse(raw);
  } catch (e) { return defaultData; }
}
function setStored(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) { console.error('setStored error:', e); }
}

async function main() {
  console.log('=== Starting Data Import ===');

  const {
    clearSectionData,
    createCustomer,
  } = await import('./src/services/databaseService.js');

  // 1. Delete old data for Section 1
  console.log('\n--- Deleting old data for Section 1 ---');
  try {
    await clearSectionData(SECTION_1_ID, ACTOR);
    console.log('Section 1 old data deleted.');
  } catch (e) {
    console.error('Error deleting Section 1 data:', e.message);
  }

  // 2. Delete old data for Section 2
  console.log('\n--- Deleting old data for Section 2 ---');
  try {
    await clearSectionData(SECTION_2_ID, ACTOR);
    console.log('Section 2 old data deleted.');
  } catch (e) {
    console.error('Error deleting Section 2 data:', e.message);
  }

  async function importSection(sectionId, jsonFile, month, year) {
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    let created = 0;
    let errors = 0;

    const customers = getStored(STORAGE_KEYS.CUSTOMERS, []);
    const periods = getStored(STORAGE_KEYS.BILLING_PERIODS, []);
    const collections = getStored(STORAGE_KEYS.COLLECTIONS, []);

    for (const row of data) {
      try {
        const customer = await createCustomer(
          {
            full_name: row.full_name || 'Unknown',
            phone: '0000000000',
            email: '',
            house_number: '',
            building_name: '',
            address: 'Indore',
            city: 'Indore',
            notes: `Imported from ${path.basename(jsonFile)} October-26`,
            is_active: true,
            assigned_section_ids: [sectionId],
          },
          ACTOR
        );

        const openingBalance = row.prev_balance || 0;
        const billAmount = row.this_month || 0;
        const paidAmount = row.pay || 0;
        const currentBalance = Math.max(0, openingBalance + billAmount - paidAmount);
        const currentUnit = row.current_unit || 0;
        const previousUnit = row.previous_unit || 0;
        const unitsConsumed = row.units_consumed || Math.max(0, currentUnit - previousUnit);
        const totalDue = openingBalance + billAmount;

        const periodId = `bp-${customer.id}-${sectionId}-${month}-${year}`;
        periods.push({
          id: periodId,
          customer_id: customer.id,
          section_id: sectionId,
          billing_month: month,
          billing_year: year,
          opening_balance: openingBalance,
          bill_amount: billAmount,
          additional_charges: 0,
          credits_or_adjustments: 0,
          total_amount_due: totalDue,
          paid_amount: paidAmount,
          closing_balance: currentBalance,
          due_date: `${year}-${String(month).padStart(2, '0')}-05`,
          payment_status: currentBalance <= 0 ? 'Paid' : 'Pending',
          current_unit: currentUnit,
          previous_unit: previousUnit,
          units_consumed: unitsConsumed,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        // Create collection record for the payment
        if (paidAmount > 0) {
          const receiptNum = 1000 + collections.length + 1;
          collections.push({
            id: `col-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4)}`,
            receipt_number: `RCP-${year}${String(month).padStart(2, '0')}-${receiptNum}`,
            customer_id: customer.id,
            billing_period_id: periodId,
            section_id: sectionId,
            amount: paidAmount,
            payment_method: 'Cash',
            collection_date: `${year}-${String(month).padStart(2, '0')}-05`,
            collection_time: '10:00:00',
            status: 'Confirmed',
            created_by: ACTOR.id,
            created_by_name: ACTOR.name,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        created++;
      } catch (e) {
        errors++;
        console.error(`Error importing ${row.customer_code}: ${e.message}`);
      }
    }

    setStored(STORAGE_KEYS.CUSTOMERS, customers);
    setStored(STORAGE_KEYS.BILLING_PERIODS, periods);
    setStored(STORAGE_KEYS.COLLECTIONS, collections);

    console.log(`${path.basename(jsonFile)}: ${created} imported, ${errors} errors`);
    return { created, errors };
  }

  // 3. Import Section 1 (D1.pdf)
  const r1 = await importSection(SECTION_1_ID, 'e:/raj/section1_data.json', 10, 2026);

  // 4. Import Section 2 (D2.pdf)
  const r2 = await importSection(SECTION_2_ID, 'e:/raj/section2_data.json', 10, 2026);

  console.log('\n=== Import Complete ===');
  console.log(`Section 1 (D1): ${r1.created} customers`);
  console.log(`Section 2 (D2): ${r2.created} customers`);
}

const path = require('path');
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
