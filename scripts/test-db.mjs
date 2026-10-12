// Runs supabase/tests/database/*.test.sql against the linked Supabase project without Docker.
// `supabase test db` needs Docker for pg_prove; this sends each file through the Management API instead.
// Every test file must end with `select * from finish();` then `rollback;`, so nothing is kept.
// Usage: npm run test:db  (or: node scripts/test-db.mjs 00_foundation)

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = 'supabase/tests/database'
const only = process.argv[2]
const files = readdirSync(dir).filter((f) => f.endsWith('.test.sql') && (!only || f.includes(only))).sort()
const tmp = mkdtempSync(join(tmpdir(), 'test-db-'))
const finish = /^select \* from finish\(\);$/m

let failedFiles = 0
for (const file of files) {
  const sql = readFileSync(join(dir, file), 'utf8')
  if (!finish.test(sql)) throw new Error(`${file}: missing "select * from finish();"`)

  // Swap finish() for pgTAP's own counters, the only result the Management API returns.
  const path = join(tmp, file)
  writeFileSync(path, sql.replace(finish, 'select label, value from __tcache__;'))

  let counts
  try {
    const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', path], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const rows = JSON.parse(out.slice(out.indexOf('{'))).rows
    counts = Object.fromEntries(rows.map((r) => [r.label, Number(r.value)]))
  } catch (error) {
    failedFiles++
    console.log(`not ok - ${file}: ${error.stdout || error.stderr || error.message}`)
    continue
  }

  const { plan, curr_test: ran, failed } = counts
  const ok = failed === 0 && ran === plan
  if (!ok) failedFiles++
  console.log(`${ok ? 'ok' : 'not ok'} - ${file}: ${ran - failed}/${plan} passed${ran !== plan ? ` (ran ${ran})` : ''}`)
}

console.log(failedFiles ? `\n${failedFiles} file(s) failed` : `\nAll ${files.length} file(s) passed`)
process.exit(failedFiles ? 1 : 0)
