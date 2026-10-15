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
// Each test's output line ("ok 3 - ..." / "not ok 4 - ...\n# diagnostics") is kept in a temp table,
// so the failures can be printed: the Management API only returns the last statement's rows.
const test = /^select (ok|is|isnt|throws_ok|lives_ok|results_eq|set_eq|bag_eq|is_empty|isnt_empty|has_table|has_column)\(/gm
const setup = /^(create extension if not exists pgtap[^\n]*\n)/m

let failedFiles = 0
for (const file of files) {
  const sql = readFileSync(join(dir, file), 'utf8')
  if (!finish.test(sql)) throw new Error(`${file}: missing "select * from finish();"`)

  // Swap finish() for pgTAP's own counters plus the failed tests' output.
  if (!setup.test(sql)) throw new Error(`${file}: missing "create extension if not exists pgtap ..."`)
  const path = join(tmp, file)
  writeFileSync(
    path,
    sql
      .replace(setup, '$1create temp table __out (line text);\ngrant all on __out to public;\n')
      .replace(test, 'insert into pg_temp.__out select $1(')
      .replace(finish, "select label, value::text from __tcache__ union all select 'not ok', line from pg_temp.__out where line ~ '^not ok';"),
  )

  let counts
  let failures = []
  try {
    const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', path], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const rows = JSON.parse(out.slice(out.indexOf('{'))).rows
    counts = Object.fromEntries(rows.filter((r) => r.label !== 'not ok').map((r) => [r.label, Number(r.value)]))
    failures = rows.filter((r) => r.label === 'not ok').map((r) => r.value)
  } catch (error) {
    failedFiles++
    console.log(`not ok - ${file}: ${error.stdout || error.stderr || error.message}`)
    continue
  }

  const { plan, curr_test: ran, failed } = counts
  const ok = failed === 0 && ran === plan
  if (!ok) failedFiles++
  console.log(`${ok ? 'ok' : 'not ok'} - ${file}: ${ran - failed}/${plan} passed${ran !== plan ? ` (ran ${ran})` : ''}`)
  for (const line of failures) console.log(`  ${line.replaceAll('\n', '\n  ')}`)
}

console.log(failedFiles ? `\n${failedFiles} file(s) failed` : `\nAll ${files.length} file(s) passed`)
process.exit(failedFiles ? 1 : 0)
