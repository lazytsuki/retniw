import assert from 'node:assert/strict'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const baseUrl = process.env.RETNIW_BASE_URL ?? 'http://localhost:3000'
if (!url || !publicKey || !serviceRoleKey) throw new Error('Missing Supabase environment')

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
let temporaryUserId = null

async function createSession() {
  const email = `retniw.export.${Date.now()}@example.com`
  const password = `Rt-${crypto.randomUUID()}`
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(error)
  assert.ok(data.user)
  temporaryUserId = data.user.id

  const cookies = new Map()
  const client = createServerClient(url, publicKey, {
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  assert.ifError(signInError)
  return Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ')
}

async function api(path, cookie, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...init.headers, cookie },
  })
}

try {
  const cookie = await createSession()
  const thoughtIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()].sort()
  const entries = []
  const original = '  中文原文。\n第二行，“标点”保持不变。\n'
  for (let index = 0; index < 6; index += 1) {
    const entryId = crypto.randomUUID()
    const content = index === 0 ? original : `${index}:${'x'.repeat(899_990)}`
    const response = await api(index === 0 ? '/api/thoughts' : `/api/thoughts/${thoughtIds[0]}/entries`, cookie, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(index === 0 ? { thoughtId: thoughtIds[0] } : {}),
        entryId,
        clientRequestId: crypto.randomUUID(),
        entryType: 'import',
        content,
        sourceLabel: index === 0 ? null : 'large.txt',
      }),
    })
    assert.equal(response.status, 201)
    entries.push({ id: entryId, content })
  }

  for (const thoughtId of thoughtIds.slice(1)) {
    const response = await api('/api/thoughts', cookie, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        thoughtId,
        entryId: crypto.randomUUID(),
        clientRequestId: crypto.randomUUID(),
        entryType: 'user',
        content: `关系测试 ${thoughtId}`,
        sourceLabel: null,
      }),
    })
    assert.equal(response.status, 201)
  }

  const { data: anchorRows, error: anchorError } = await service
    .from('entries')
    .select('id,thought_id')
    .eq('user_id', temporaryUserId)
  assert.ifError(anchorError)
  const anchor = (thoughtId) => anchorRows.find((entry) => entry.thought_id === thoughtId).id
  const connectionRows = [
    {
      id: crypto.randomUUID(),
      user_id: temporaryUserId,
      source_thought_id: thoughtIds[0],
      target_thought_id: thoughtIds[1],
      source_entry_id: anchor(thoughtIds[0]),
      target_entry_id: anchor(thoughtIds[1]),
      rationale: '应当导出',
      status: 'confirmed',
      decided_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      user_id: temporaryUserId,
      source_thought_id: thoughtIds[0],
      target_thought_id: thoughtIds[2],
      source_entry_id: anchor(thoughtIds[0]),
      target_entry_id: anchor(thoughtIds[2]),
      rationale: '不应导出',
      status: 'rejected',
      decided_at: new Date().toISOString(),
    },
  ]
  const { error: connectionError } = await service.from('thought_connections').insert(connectionRows)
  assert.ifError(connectionError)

  const markdownResponse = await api(`/api/thoughts/${thoughtIds[0]}/export.md`, cookie)
  assert.equal(markdownResponse.status, 200)
  const markdown = await markdownResponse.text()
  assert.ok(markdown.length > 4_500_000)
  assert.ok(markdown.includes(original))
  assert.ok(markdown.includes(`条目 ID：${entries[0].id}`))

  const exportResponse = await api('/api/export', cookie)
  assert.equal(exportResponse.status, 200)
  const exportText = await exportResponse.text()
  assert.ok(exportText.length > 4_500_000)
  const exported = JSON.parse(exportText)
  assert.equal(exported.format, 'retniw.export.v1')
  assert.equal(exported.entries.find((entry) => entry.id === entries[0].id).content, original)
  assert.deepEqual(exported.connections.map((connection) => connection.rationale), ['应当导出'])

  console.log(JSON.stringify({
    result: 'PASS',
    markdownBytes: Buffer.byteLength(markdown),
    jsonBytes: Buffer.byteLength(exportText),
    checks: ['exact import', 'stream over 4.5MB', 'parseable JSON', 'confirmed only'],
  }))
} finally {
  if (temporaryUserId) await service.auth.admin.deleteUser(temporaryUserId)
}
