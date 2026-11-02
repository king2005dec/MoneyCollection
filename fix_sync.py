import re

with open('src/services/databaseService.ts', 'rb') as f:
    content = f.read().decode('utf-8')

# Find and replace the broadcastDataSync block
old_comment = '// Supabase Broadcast sync \u2013 pushes actual data payloads to all connected devices\r\n// AppContext will register a sender function here after connecting'
new_comment = '// Supabase Broadcast sync \u2013 delegates to syncService (broadcast + DB upsert)'

old_fn = '''async function broadcastDataSync(changedKeys: string[]): Promise<void> {\r\n  if (!_broadcastSender) return;\r\n  for (const key of changedKeys) {\r\n    try {\r\n      const raw = localStorage.getItem(key);\r\n      if (!raw) continue;\r\n      const data = JSON.parse(raw);\r\n      await _broadcastSender(key, data);\r\n    } catch (e) {\r\n      console.warn('[Sync] broadcastDataSync error for key', key, e);\r\n    }\r\n  }\r\n}'''

new_fn = '''async function broadcastDataSync(changedKeys: string[]): Promise<void> {\r\n  // Primary: use syncService (broadcasts to all devices + upserts to Supabase DB)\r\n  try {\r\n    const { syncAfterWrite } = await import('./syncService');\r\n    await syncAfterWrite(changedKeys);\r\n    return;\r\n  } catch { /* fall through to legacy */ }\r\n\r\n  // Legacy fallback via AppContext-registered sender\r\n  if (!_broadcastSender) return;\r\n  for (const key of changedKeys) {\r\n    try {\r\n      const raw = localStorage.getItem(key);\r\n      if (!raw) continue;\r\n      const data = JSON.parse(raw);\r\n      await _broadcastSender(key, data);\r\n    } catch (e) {\r\n      console.warn('[Sync] broadcastDataSync error for key', key, e);\r\n    }\r\n  }\r\n}'''

if old_comment in content:
    content = content.replace(old_comment, new_comment, 1)
    print('Comment replaced')
else:
    print('Comment NOT found - searching...')
    idx = content.find('Supabase Broadcast sync')
    print(repr(content[idx-5:idx+200]))

if old_fn in content:
    content = content.replace(old_fn, new_fn, 1)
    print('Function replaced')
else:
    print('Function NOT found')
    idx = content.find('broadcastDataSync')
    print(repr(content[idx-5:idx+400]))

with open('src/services/databaseService.ts', 'wb') as f:
    f.write(content.encode('utf-8'))

print('Done')

