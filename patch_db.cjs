const fs = require('fs');
let content = fs.readFileSync('src/services/databaseService.ts', 'utf8');

// Find the broadcastDataSync function and replace it
const marker = 'async function broadcastDataSync(changedKeys: string[]): Promise<void> {';
const idx = content.indexOf(marker);
if (idx < 0) { console.log('NOT FOUND'); process.exit(1); }

// Find the closing } of the function
let depth = 0;
let end = idx;
for (let i = idx; i < content.length; i++) {
  if (content[i] === '{') depth++;
  else if (content[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}

const newFn = `async function broadcastDataSync(changedKeys: string[]): Promise<void> {
  // Primary path: syncService handles broadcast + Supabase DB upsert
  try {
    const { syncAfterWrite } = await import('./syncService');
    await syncAfterWrite(changedKeys);
    return;
  } catch { /* fall through to legacy */ }

  // Legacy fallback via AppContext-registered sender
  if (!_broadcastSender) return;
  for (const key of changedKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      await _broadcastSender(key, data);
    } catch (e) {
      console.warn('[Sync] broadcastDataSync error for key', key, e);
    }
  }
}`;

content = content.slice(0, idx) + newFn + content.slice(end);

// Also fix the old comment
content = content.replace(
  '// Supabase Broadcast sync \u2013 pushes actual data payloads to all connected devices\r\n// AppContext will register a sender function here after connecting',
  '// Supabase Broadcast sync \u2013 delegates to syncService (instant broadcast + Supabase DB upsert)'
);
content = content.replace(
  '// Supabase Broadcast sync \u2013 pushes actual data payloads to all connected devices\n// AppContext will register a sender function here after connecting',
  '// Supabase Broadcast sync \u2013 delegates to syncService (instant broadcast + Supabase DB upsert)'
);

fs.writeFileSync('src/services/databaseService.ts', content, 'utf8');
console.log('DONE - broadcastDataSync patched');
