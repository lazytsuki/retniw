import assert from 'node:assert/strict'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import {
  deterministicUuid,
  migrateFragmentsToThoughts,
} from './migrate-fragments-to-thoughts.mjs'

if (process.env.NODE_ENV !== 'test') process.loadEnvFile('.env.local')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const baseUrl = process.env.RETNIW_BASE_URL ?? 'http://localhost:3000'

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
})) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const temporaryUsers = []
let temporaryThoughtId

async function signIn(email, password) {
  const cookies = new Map()
  const client = createServerClient(url, publicKey, {
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  assert.ifError(error)
  return Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ')
}

async function createTemporaryUser(label) {
  const email = `retniw.thoughts.${label}.${Date.now()}@gmail.com`
  const password = `Rt-${crypto.randomUUID()}`
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  assert.ifError(error)
  assert.ok(data.user)
  temporaryUsers.push(data.user.id)
  return { user: data.user, cookie: await signIn(email, password) }
}

async function api(path, cookie, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
  })
}

async function assertLegacyDataPreserved() {
  const [{ data: fragments, error: fragmentError }, { data: clarifications, error: clarificationError }] =
    await Promise.all([
      service.from('fragments').select('*'),
      service.from('clarifications').select('*'),
    ])
  assert.ifError(fragmentError)
  assert.ifError(clarificationError)

  for (const fragment of fragments) {
    const { data: entry, error } = await service
      .from('entries')
      .select('content, entry_type')
      .eq('id', fragment.client_request_id)
      .single()
    assert.ifError(error)
    assert.equal(entry.content, fragment.content)
    assert.equal(entry.entry_type, 'user')
  }

  for (const clarification of clarifications) {
    const { data: question, error } = await service
      .from('entries')
      .select('content, entry_type, ai_action')
      .eq('id', clarification.id)
      .single()
    assert.ifError(error)
    assert.equal(question.content, clarification.question)
    assert.equal(question.entry_type, 'ai')
    assert.equal(question.ai_action, 'question')

    if (clarification.answer) {
      const { data: answer, error: answerError } = await service
        .from('entries')
        .select('content, entry_type')
        .eq('id', deterministicUuid(`${clarification.id}:answer`))
        .single()
      assert.ifError(answerError)
      assert.equal(answer.content, clarification.answer)
      assert.equal(answer.entry_type, 'user')
    }
  }

  const { data: oldConnections, error: oldConnectionError } = await service
    .from('connections')
    .select('*')
  assert.ifError(oldConnectionError)
  for (const connection of oldConnections) {
    const { data: migrated, error } = await service
      .from('thought_connections')
      .select('rationale, status, decided_at, created_at')
      .eq('id', connection.id)
      .single()
    assert.ifError(error)
    assert.deepEqual(migrated, {
      rationale: connection.rationale,
      status: connection.status,
      decided_at: connection.decided_at,
      created_at: connection.created_at,
    })
  }
}

try {
  const firstMigration = await migrateFragmentsToThoughts(service, { apply: true })
  const secondMigration = await migrateFragmentsToThoughts(service, { apply: true })
  assert.deepEqual(secondMigration, firstMigration)
  await assertLegacyDataPreserved()

  const owner = await createTemporaryUser('owner')
  const other = await createTemporaryUser('other')
  temporaryThoughtId = crypto.randomUUID()
  const entryId = crypto.randomUUID()
  const clientRequestId = crypto.randomUUID()
  const validBody = {
    thoughtId: temporaryThoughtId,
    entryId,
    clientRequestId,
    entryType: 'user',
    content: '持续思考接口真实验收',
    sourceLabel: null,
  }

  const unauthenticated = await api('/api/thoughts', '', { method: 'GET' })
  assert.equal(unauthenticated.status, 401)

  const responses = await Promise.all(
    [0, 1].map(() =>
      api('/api/thoughts', owner.cookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    ),
  )
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 201],
  )

  const appendBody = {
    entryId: crypto.randomUUID(),
    clientRequestId: crypto.randomUUID(),
    entryType: 'user',
    content: '第二段内容',
    sourceLabel: null,
  }
  const appended = await api(`/api/thoughts/${temporaryThoughtId}/entries`, owner.cookie, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(appendBody),
  })
  assert.equal(appended.status, 201)

  const detail = await api(`/api/thoughts/${temporaryThoughtId}`, owner.cookie)
  assert.equal(detail.status, 200)
  const detailBody = await detail.json()
  assert.deepEqual(
    detailBody.data.entries.map((entry) => entry.content),
    [validBody.content, appendBody.content],
  )

  const list = await api('/api/thoughts', owner.cookie)
  assert.equal(list.status, 200)
  assert.ok((await list.json()).data.thoughts.some((thought) => thought.id === temporaryThoughtId))

  const otherDetail = await api(`/api/thoughts/${temporaryThoughtId}`, other.cookie)
  assert.equal(otherDetail.status, 404)

  console.log(
    JSON.stringify({
      result: 'PASS',
      migration: firstMigration.target,
      checks: ['double migration', 'content preservation', 'idempotency', 'append', 'list', 'detail', 'owner isolation'],
    }),
  )
} finally {
  if (temporaryThoughtId) await service.from('thoughts').delete().eq('id', temporaryThoughtId)
  for (const userId of temporaryUsers) await service.auth.admin.deleteUser(userId)
}
