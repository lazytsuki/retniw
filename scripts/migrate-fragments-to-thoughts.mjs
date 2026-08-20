import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function deterministicUuid(value) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function latestTimestamp(values) {
  return values.filter(Boolean).sort().at(-1)
}

export function buildMigrationPlan({ fragments, clarifications, connections }) {
  const clarificationsByFragment = new Map()
  for (const clarification of clarifications) {
    const rows = clarificationsByFragment.get(clarification.fragment_id) ?? []
    rows.push(clarification)
    clarificationsByFragment.set(clarification.fragment_id, rows)
  }

  const thoughts = []
  const entries = []
  const firstEntryByThought = new Map()

  for (const fragment of fragments) {
    const fragmentClarifications = (clarificationsByFragment.get(fragment.id) ?? []).sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
    )
    const activityTimes = [fragment.created_at]
    thoughts.push({
      id: fragment.id,
      user_id: fragment.user_id,
      last_activity_at: fragment.created_at,
      relation_checked_at: fragment.reconnect_checked_at,
      created_at: fragment.created_at,
    })
    entries.push({
      id: fragment.client_request_id,
      user_id: fragment.user_id,
      thought_id: fragment.id,
      client_request_id: fragment.client_request_id,
      entry_type: 'user',
      content: fragment.content,
      source_label: null,
      ai_action: null,
      created_at: fragment.created_at,
    })
    firstEntryByThought.set(fragment.id, fragment.client_request_id)

    for (const clarification of fragmentClarifications) {
      entries.push({
        id: clarification.id,
        user_id: clarification.user_id,
        thought_id: clarification.fragment_id,
        client_request_id: clarification.id,
        entry_type: 'ai',
        content: clarification.question,
        source_label: null,
        ai_action: 'question',
        created_at: clarification.created_at,
      })
      activityTimes.push(clarification.created_at)

      if (clarification.answer && clarification.answered_at) {
        const answerId = deterministicUuid(`${clarification.id}:answer`)
        entries.push({
          id: answerId,
          user_id: clarification.user_id,
          thought_id: clarification.fragment_id,
          client_request_id: answerId,
          entry_type: 'user',
          content: clarification.answer,
          source_label: null,
          ai_action: null,
          created_at: clarification.answered_at,
        })
        activityTimes.push(clarification.answered_at)
      }
    }

    thoughts.at(-1).last_activity_at = latestTimestamp(activityTimes)
  }

  const migratedConnections = connections.map((connection) => {
    const [sourceThoughtId, targetThoughtId] = [
      connection.source_fragment_id,
      connection.target_fragment_id,
    ].sort()
    const sourceEntryId = firstEntryByThought.get(sourceThoughtId)
    const targetEntryId = firstEntryByThought.get(targetThoughtId)
    if (!sourceEntryId || !targetEntryId) {
      throw new Error(`Connection ${connection.id} references a missing fragment`)
    }

    return {
      id: connection.id,
      user_id: connection.user_id,
      source_thought_id: sourceThoughtId,
      target_thought_id: targetThoughtId,
      source_entry_id: sourceEntryId,
      target_entry_id: targetEntryId,
      rationale: connection.rationale,
      status: connection.status,
      decided_at: connection.decided_at,
      created_at: connection.created_at,
    }
  })

  return { thoughts, entries, connections: migratedConnections }
}

async function readAll(client, table) {
  const rows = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Unable to read ${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}

async function writeInChunks(client, table, rows) {
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client
      .from(table)
      .upsert(rows.slice(index, index + 500), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(`Unable to write ${table}: ${error.message}`)
  }
}

export async function migrateFragmentsToThoughts(client, { apply = false } = {}) {
  const source = {
    fragments: await readAll(client, 'fragments'),
    clarifications: await readAll(client, 'clarifications'),
    connections: await readAll(client, 'connections'),
  }
  const plan = buildMigrationPlan(source)

  if (apply) {
    await writeInChunks(client, 'thoughts', plan.thoughts)
    await writeInChunks(client, 'entries', plan.entries)
    await writeInChunks(client, 'thought_connections', plan.connections)
  }

  return {
    apply,
    source: {
      fragments: source.fragments.length,
      clarifications: source.clarifications.length,
      connections: source.connections.length,
    },
    target: {
      thoughts: plan.thoughts.length,
      entries: plan.entries.length,
      connections: plan.connections.length,
    },
  }
}

async function main() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase server environment variables')
  }

  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  })
  const summary = await migrateFragmentsToThoughts(client, {
    apply: process.argv.includes('--apply'),
  })
  console.log(JSON.stringify(summary, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
