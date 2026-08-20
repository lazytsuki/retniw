import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error('Missing Supabase environment')

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const legacyTables = ['fragments', 'clarifications', 'connections']

async function legacyCounts() {
  const counts = {}
  for (const table of legacyTables) {
    const { count, error } = await service.from(table).select('*', { count: 'exact', head: true })
    assert.ifError(error)
    counts[table] = count
  }
  return counts
}

function run(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    process.stderr.write(result.stdout)
    throw new Error(`${script} failed`)
  }
  const line = result.stdout.trim().split('\n').filter(Boolean).at(-1)
  const payload = JSON.parse(line)
  assert.equal(payload.result, 'PASS')
  return payload
}

const before = await legacyCounts()
const thoughts = run('scripts/verify-thoughts-live.mjs')
const ai = run('scripts/verify-ai-stream-live.mjs')
const relations = run('scripts/verify-thought-connections-live.mjs')
const transfer = run('scripts/verify-import-export-live.mjs')
const after = await legacyCounts()
assert.deepEqual(after, before)
const withinTarget = ai.firstDeltaMs.filter((value) => value <= 3000).length
const targetRate = withinTarget / ai.firstDeltaMs.length
assert.ok(targetRate >= 0.8)

console.log(JSON.stringify({
  result: 'PASS',
  checks: {
    thoughts: thoughts.checks,
    aiActions: ai.actionsCovered,
    relations: relations.checks,
    transfer: transfer.checks,
    ownerIsolation: true,
    legacyTablesUnchanged: true,
  },
  timing: {
    targetFirstDeltaMs: 3000,
    observedFirstDeltaMs: ai.firstDeltaMs,
    withinTarget,
    targetRate,
    targetMet: targetRate >= 0.8,
  },
}))
