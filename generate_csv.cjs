const fs = require('fs');
const path = require('path');

const s1Data = JSON.parse(fs.readFileSync('e:/raj/section1_data.json', 'utf8'));
const s2Data = JSON.parse(fs.readFileSync('e:/raj/section2_data.json', 'utf8'));

function toCsv(rows) {
  const headers = [
    'customer_code', 'full_name', 'phone', 'email', 'house_number', 'building_name',
    'address', 'city', 'notes', 'is_active', 'assigned_section_ids',
    'opening_balance', 'bill_amount', 'paid_amount', 'closing_balance',
    'current_unit', 'previous_unit', 'units_consumed', 'due_date'
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const openingBalance = r.prev_balance || 0;
    const billAmount = r.this_month || 0;
    const paidAmount = r.pay || 0;
    const currentBalance = Math.max(0, openingBalance + billAmount - paidAmount);
    const totalDue = openingBalance + billAmount;
    const currentUnit = r.current_unit || 0;
    const previousUnit = r.previous_unit || 0;
    const unitsConsumed = r.units_consumed || Math.max(0, currentUnit - previousUnit);
    
    const row = [
      r.customer_code || '',
      `"${(r.full_name || 'Unknown').replace(/"/g, '""')}"`,
      '0000000000',
      '',
      '',
      '',
      'Indore',
      'Indore',
      '"Imported from PDF October-26"',
      'true',
      '["sec-elec-001"]',
      openingBalance,
      billAmount,
      paidAmount,
      currentBalance,
      currentUnit,
      previousUnit,
      unitsConsumed,
      '2026-10-05'
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

// Section 1 CSV (uses sec-elec-001)
let s1Csv = toCsv(s1Data.map(r => ({...r, assigned_section_ids: '["sec-elec-001"]'})));
fs.writeFileSync('e:/raj/section1_import.csv', s1Csv);
console.log(`Section 1 CSV: ${s1Data.length} rows written to section1_import.csv`);

// Section 2 CSV (uses sec-water-002)
let s2Csv = toCsv(s2Data.map(r => ({...r, assigned_section_ids: '["sec-water-002"]'})));
fs.writeFileSync('e:/raj/section2_import.csv', s2Csv);
console.log(`Section 2 CSV: ${s2Data.length} rows written to section2_import.csv`);

console.log('\nCSV files ready for import via the app UI.');
