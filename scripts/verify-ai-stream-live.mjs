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
let userId
let thoughtId

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

async function readEvents(response) {
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const events = []
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const name = block.match(/^event:\s*(.+)$/m)?.[1]
      const data = block.match(/^data:\s*(.+)$/m)?.[1]
      if (name && data) events.push({ name, data: JSON.parse(data), at: performance.now() })
    }
    if (done) return events
  }
}

try {
  const email = `retniw.ai.acceptance.${Date.now()}@example.com`
  const password = `Rt-${crypto.randomUUID()}`
  const createdUser = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(createdUser.error)
  userId = createdUser.data.user.id
  const cookie = await signIn(email, password)
  thoughtId = crypto.randomUUID()
  const firstEntryId = crypto.randomUUID()
  const created = await service.from('thoughts').insert({ id: thoughtId, user_id: userId })
  assert.ifError(created.error)
  const firstEntry = await service.from('entries').insert({
    id: firstEntryId,
    user_id: userId,
    thought_id: thoughtId,
    client_request_id: firstEntryId,
    entry_type: 'user',
    content: '我正在考虑怎样让一个念头自然地继续生长。',
  })
  assert.ifError(firstEntry.error)

  const timings = []
  const actionRuns = ['advance', 'question', 'organize', 'advance', 'question']
  for (const [index, action] of actionRuns.entries()) {
    if (index > 0) {
      const nextUserEntryId = crypto.randomUUID()
      const nextUserEntry = await service.from('entries').insert({
        id: nextUserEntryId,
        user_id: userId,
        thought_id: thoughtId,
        client_request_id: nextUserEntryId,
        entry_type: 'user',
        content: `第 ${index + 1} 次验证的新输入。`,
      })
      assert.ifError(nextUserEntry.error)
    }
    const clientRequestId = crypto.randomUUID()
    const startedAt = performance.now()
    const response = await fetch(`${baseUrl}/api/thoughts/${thoughtId}/ai`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ clientRequestId, action }),
    })
    const events = await readEvents(response)
    assert.equal(events[0].name, 'start')
    assert.ok(events.some((event) => event.name === 'delta'))
    assert.equal(events.at(-1).name, 'saved')
    assert.ok(!events.some((event) => event.name === 'error'))
    timings.push(Math.round(events.find((event) => event.name === 'delta').at - startedAt))

    const { count, error } = await service
      .from('entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('client_request_id', clientRequestId)
    assert.ifError(error)
    assert.equal(count, 1)
  }

  console.log(JSON.stringify({
    result: 'PASS',
    actionsCovered: 3,
    requests: actionRuns.length,
    firstDeltaMs: timings,
    withinTarget: timings.filter((value) => value <= 3000).length,
  }))
} finally {
  if (thoughtId) await service.from('thoughts').delete().eq('id', thoughtId)
  if (userId) await service.auth.admin.deleteUser(userId)
}
