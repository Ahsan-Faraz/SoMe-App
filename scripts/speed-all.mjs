// Runs every speed check in scripts/speed/ against the linked Supabase project and prints one table
// against the targets (backend-design §11). Each script seeds its own data and rolls back, so
// nothing is kept. Run before a deploy: node scripts/speed-all.mjs  (or: node scripts/speed-all.mjs 16_ads)
// Exits with 1 when any query is over its target or a script fails.

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'scripts/speed'
const only = process.argv[2]
const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && (!only || f.includes(only))).sort()

let slow = 0
let failed = 0
for (const file of files) {
  let rows
  try {
    // -o json: a terminal otherwise gets a table. The rows come as a plain array, or as {rows}.
    const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-o', 'json', '-f', join(dir, file)], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    })
    const json = JSON.parse(out.slice(out.search(/[[{]/)))
    rows = Array.isArray(json) ? json : json.rows
  } catch (error) {
    failed++
    console.log(`not ok - ${file}: ${error.stdout || error.stderr || error.message}`)
    continue
  }
  console.log(`\n${file}`)
  for (const row of rows) {
    const over = Number(row.ms) > Number(row.target_ms)
    if (over) slow++
    console.log(`  ${over ? 'SLOW' : 'ok  '} ${String(row.ms).padStart(9)} ms  (target ${row.target_ms})  ${row.name}`)
  }
}

console.log(failed || slow ? `\n${slow} slow, ${failed} script(s) failed` : `\nAll ${files.length} speed checks within target`)
process.exit(failed || slow ? 1 : 0)
