import assert from 'node:assert/strict'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const baseUrl = process.env.RETNIW_BASE_URL ?? 'http://localhost:3000'
for (const [name, value] of Object.entries({ url, publicKey, serviceRoleKey })) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
}

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const userIds = []

async function createUser(label) {
  const email = `retniw.connections.${label}.${Date.now()}@example.com`
  const password = `Rt-${crypto.randomUUID()}`
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(created.error)
  userIds.push(created.data.user.id)
  const cookies = new Map()
  const auth = createServerClient(url, publicKey, {
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  })
  const signedIn = await auth.auth.signInWithPassword({ email, password })
  assert.ifError(signedIn.error)
  return {
    id: created.data.user.id,
    cookie: Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; '),
  }
}

async function api(path, cookie, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...init.headers, cookie },
  })
}

async function createThought(userId, content) {
  const thoughtId = crypto.randomUUID()
  const entryId = crypto.randomUUID()
  let result = await service.from('thoughts').insert({
    id: thoughtId,
    user_id: userId,
    summary_content: content.slice(0, 500),
    summary_entry_type: 'user',
  })
  assert.ifError(result.error)
  result = await service.from('entries').insert({
    id: entryId,
    user_id: userId,
    thought_id: thoughtId,
    client_request_id: entryId,
    entry_type: 'user',
    content,
  })
  assert.ifError(result.error)
  return { thoughtId, entryId }
}

try {
  const owner = await createUser('owner')
  const other = await createUser('other')
  const first = await createThought(owner.id, '第一段关系验收内容')
  const second = await createThought(owner.id, '第二段关系验收内容')
  await createThought(other.id, '只有一个过程时不应虚构关系')

  const anonymousScan = await fetch(`${baseUrl}/api/review/scan`, {
    method: 'POST',
  })
  assert.equal(anonymousScan.status, 401)

  const enableReview = await api('/api/review/preference', other.cookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  })
  assert.equal(enableReview.status, 200)
  assert.equal((await enableReview.json()).data.preference.enabled, true)

  const singleScan = await api('/api/review/scan', other.cookie, { method: 'POST' })
  assert.equal(singleScan.status, 200)
  assert.deepEqual(await singleScan.json(), {
    data: { status: 'not-enough-content', created: 0 },
  })

  const [source, target] = [first, second].sort((left, right) =>
    left.thoughtId.localeCompare(right.thoughtId),
  )
  const baseRow = {
    user_id: owner.id,
    source_thought_id: source.thoughtId,
    target_thought_id: target.thoughtId,
    source_entry_id: source.entryId,
    target_entry_id: target.entryId,
    rationale: '真实唯一约束验收',
  }
  const inserts = await Promise.all(
    [0, 1].map(() =>
      service
        .from('thought_connections')
        .insert({ id: crypto.randomUUID(), ...baseRow })
        .select('id')
        .single(),
    ),
  )
  assert.equal(inserts.filter((result) => !result.error).length, 1)
  assert.equal(inserts.filter((result) => result.error?.code === '23505').length, 1)
  const connectionId = inserts.find((result) => result.data)?.data.id
  assert.ok(connectionId)

  const confirm = await api(`/api/thought-connections/${connectionId}`, owner.cookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'confirmed' }),
  })
  assert.equal(confirm.status, 200)
  assert.equal((await confirm.json()).data.connection.status, 'confirmed')

  const sameDecision = await api(`/api/thought-connections/${connectionId}`, owner.cookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'confirmed' }),
  })
  assert.equal(sameDecision.status, 200)

  const conflicting = await api(`/api/thought-connections/${connectionId}`, owner.cookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'rejected' }),
  })
  assert.equal(conflicting.status, 409)

  const crossAccount = await api(`/api/thought-connections/${connectionId}`, other.cookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'confirmed' }),
  })
  assert.equal(crossAccount.status, 404)

  const revived = await service
    .from('thought_connections')
    .insert({ id: crypto.randomUUID(), ...baseRow })
  assert.equal(revived.error?.code, '23505')

  console.log(
    JSON.stringify({
      result: 'PASS',
      checks: [
        'scan authentication',
        'review preference boundary',
        'single thought scan',
        'concurrent uniqueness',
        'one-time decision',
        'owner isolation',
        'no revival',
      ],
    }),
  )
} finally {
  for (const userId of userIds) await service.auth.admin.deleteUser(userId)
}
