const fs = require('fs');
const pdf = require('pdf-parse');

async function extract(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const bytes = new Uint8Array(dataBuffer);
  const parser = new pdf.PDFParse(bytes);
  await parser.load();
  const result = await parser.getText();
  // result is { pages: [...], text: '...' }
  return result.text || '';
}

function parseSection1Rows(text) {
  const rows = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const parts = line.split('\t').map(p => p.trim()).filter(p => p);
    if (parts.length < 4) continue;
    
    const codeMatch = parts[0].match(/^([A-Z]\d+[A-Z]?)$/i);
    if (!codeMatch) continue;
    
    const code = codeMatch[1].toUpperCase();
    if (code.toLowerCase() === 'total') continue;
    
    const name = parts[1] || '';
    const pay = parseFloat(parts[2]) || 0;
    const thisMonth = parseFloat(parts[3]) || 0;
    const prevBalance = parseFloat(parts[4]) || 0;
    const totalBalance = parseFloat(parts[5]) || 0;
    const currentBalance = parseFloat(parts[6]) || 0;
    
    // Find second occurrence of code for unit data
    let currentUnit = 0, previousUnit = 0, unitsConsumed = 0;
    for (let i = 7; i < parts.length; i++) {
      if (parts[i] === code && i + 4 < parts.length) {
        currentUnit = parseFloat(parts[i + 2]) || 0;
        previousUnit = parseFloat(parts[i + 3]) || 0;
        unitsConsumed = parseFloat(parts[i + 4]) || Math.max(0, currentUnit - previousUnit);
        break;
      }
    }
    
    rows.push({
      customer_code: code,
      full_name: name,
      pay: pay,
      this_month: thisMonth,
      prev_balance: prevBalance,
      total_balance: totalBalance,
      current_balance: currentBalance,
      current_unit: currentUnit,
      previous_unit: previousUnit,
      units_consumed: unitsConsumed
    });
  }
  
  return rows;
}

function parseSection2Rows(text) {
  const rows = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const parts = line.split('\t').map(p => p.trim()).filter(p => p);
    if (parts.length < 4) continue;
    
    const codeMatch = parts[0].match(/^([B]\d+[A-Z]?)$/i);
    if (!codeMatch) continue;
    
    const code = codeMatch[1].toUpperCase();
    if (code.toLowerCase() === 'total') continue;
    
    const name = parts[1] || '';
    
    // Find numeric values after name
    const nums = [];
    for (let i = 2; i < parts.length; i++) {
      const v = parseFloat(parts[i]);
      if (!isNaN(v)) nums.push({ index: i, value: v });
    }
    
    if (nums.length < 3) continue;
    
    const pay = nums[0].value;
    const thisMonth = nums[1].value;
    const prevBalance = nums[2].value;
    const totalBalance = nums[3] ? nums[3].value : prevBalance + thisMonth;
    const currentBalance = nums[4] ? nums[4].value : Math.max(0, totalBalance - pay);
    
    let currentUnit = 0, previousUnit = 0, unitsConsumed = 0;
    for (let i = 2; i < parts.length; i++) {
      if (parts[i] === code && i + 4 < parts.length) {
        currentUnit = parseFloat(parts[i + 2]) || 0;
        previousUnit = parseFloat(parts[i + 3]) || 0;
        unitsConsumed = parseFloat(parts[i + 4]) || Math.max(0, currentUnit - previousUnit);
        break;
      }
    }
    
    rows.push({
      customer_code: code,
      full_name: name,
      pay: pay,
      this_month: thisMonth,
      prev_balance: prevBalance,
      total_balance: totalBalance,
      current_balance: currentBalance,
      current_unit: currentUnit,
      previous_unit: previousUnit,
      units_consumed: unitsConsumed
    });
  }
  
  return rows;
}

async function main() {
  const d1Text = await extract('e:/raj/userdata/October-26 - D1.pdf');
  const d2Text = await extract('e:/raj/userdata/October-26 - D2.pdf');
  
  const s1Rows = parseSection1Rows(d1Text);
  const s2Rows = parseSection2Rows(d2Text);
  
  console.log('Section 1 rows:', s1Rows.length);
  console.log('Section 2 rows:', s2Rows.length);
  
  console.log('\n--- Section 1 sample ---');
  s1Rows.slice(0, 5).forEach(r => console.log(JSON.stringify(r)));
  console.log('\n--- Section 2 sample ---');
  s2Rows.slice(0, 5).forEach(r => console.log(JSON.stringify(r)));
  
  fs.writeFileSync('e:/raj/section1_data.json', JSON.stringify(s1Rows, null, 2));
  fs.writeFileSync('e:/raj/section2_data.json', JSON.stringify(s2Rows, null, 2));
  console.log('\nSaved JSON files');
}

main().catch(e => { console.error(e); process.exit(1); });
