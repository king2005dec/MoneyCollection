const fs = require('fs');
const pdf = require('pdf-parse');

async function extract(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const bytes = new Uint8Array(dataBuffer);
  const parser = new pdf.PDFParse(bytes);
  await parser.load();
  const text = await parser.getText();
  console.log('===== FILE: ' + filePath + ' =====');
  console.log(text);
  console.log('===== END =====');
}

async function main() {
  await extract('e:/raj/userdata/October-26 - D1.pdf');
  await extract('e:/raj/userdata/October-26 - D2.pdf');
}

main().catch(e => { console.error(e); process.exit(1); });
