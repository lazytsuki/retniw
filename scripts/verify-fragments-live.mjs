import assert from 'node:assert/strict'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.RETNIW_OWNER_EMAIL
const ownerPassword = process.env.RETNIW_OWNER_PASSWORD
const baseUrl = process.env.RETNIW_BASE_URL

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  RETNIW_OWNER_EMAIL: ownerEmail,
  RETNIW_OWNER_PASSWORD: ownerPassword,
  RETNIW_BASE_URL: baseUrl,
})) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
let testUserId
let fragmentId
let otherFragmentId

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

async function api(path, cookie, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
  })
}

try {
  const { data: users, error: usersError } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  assert.ifError(usersError)
  const owner = users.users.find((user) => user.email?.toLowerCase() === ownerEmail.toLowerCase())
  assert.ok(owner)

  const testEmail = `retniw.fragments.${Date.now()}@gmail.com`
  const testPassword = `Rt-${crypto.randomUUID()}`
  const { data: testUser, error: testUserError } = await service.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  })
  assert.ifError(testUserError)
  assert.ok(testUser.user)
  testUserId = testUser.user.id

  const ownerCookie = await signIn(ownerEmail, ownerPassword)
  const testCookie = await signIn(testEmail, testPassword)

  const requestId = crypto.randomUUID()
  const validBody = { clientRequestId: requestId, content: 'live idempotency probe', inputMode: 'text' }

  const unauthenticated = await api('/api/fragments', '', { method: 'GET' })
  assert.equal(unauthenticated.status, 401)

  const invalidBodies = [
    { ...validBody, clientRequestId: 'invalid' },
    { ...validBody, content: '   ' },
    { ...validBody, content: 'x'.repeat(10_001) },
    { ...validBody, inputMode: 'other' },
  ]
  for (const body of invalidBodies) {
    const response = await api('/api/fragments', ownerCookie, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'INVALID_INPUT')
  }

  const responses = await Promise.all(
    [0, 1].map(() =>
      api('/api/fragments', ownerCookie, {
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
  const payloads = await Promise.all(responses.map((response) => response.json()))
  assert.equal(payloads[0].data.fragment.id, payloads[1].data.fragment.id)
  fragmentId = payloads[0].data.fragment.id

  const { count, error: countError } = await service
    .from('fragments')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', owner.id)
    .eq('client_request_id', requestId)
  assert.ifError(countError)
  assert.equal(count, 1)

  const listResponse = await api('/api/fragments', ownerCookie)
  assert.equal(listResponse.status, 200)
  const list = await listResponse.json()
  assert.ok(list.data.fragments.some((fragment) => fragment.id === fragmentId))

  const detailResponse = await api(`/api/fragments/${fragmentId}`, ownerCookie)
  assert.equal(detailResponse.status, 200)
  const detail = await detailResponse.json()
  assert.equal(detail.data.fragment.content, validBody.content)
  assert.equal(detail.data.fragment.clarification, null)
  assert.deepEqual(detail.data.fragment.connections, [])

  const { data: clarification, error: clarificationError } = await service
    .from('clarifications')
    .insert({ user_id: owner.id, fragment_id: fragmentId, question: '这件事最重要的部分是什么？' })
    .select('id')
    .single()
  assert.ifError(clarificationError)

  const answer = '保留最初出现时的方向感'
  const answerResponse = await api(`/api/clarifications/${clarification.id}`, ownerCookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  assert.equal(answerResponse.status, 200)
  assert.equal((await answerResponse.json()).data.clarification.answer, answer)

  const sameAnswerResponse = await api(`/api/clarifications/${clarification.id}`, ownerCookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  assert.equal(sameAnswerResponse.status, 200)

  const conflictingAnswerResponse = await api(`/api/clarifications/${clarification.id}`, ownerCookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer: '另一个答案' }),
  })
  assert.equal(conflictingAnswerResponse.status, 409)

  const otherUserAnswerResponse = await api(`/api/clarifications/${clarification.id}`, testCookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  assert.equal(otherUserAnswerResponse.status, 404)

  const { data: otherFragment, error: otherFragmentError } = await service
    .from('fragments')
    .insert({
      user_id: owner.id,
      client_request_id: crypto.randomUUID(),
      content: '另一条相关的原始碎片',
      input_mode: 'text',
    })
    .select('id')
    .single()
  assert.ifError(otherFragmentError)
  otherFragmentId = otherFragment.id
  const [sourceFragmentId, targetFragmentId] = [fragmentId, otherFragmentId].sort()
  const { data: connection, error: connectionError } = await service
    .from('connections')
    .insert({
      user_id: owner.id,
      source_fragment_id: sourceFragmentId,
      target_fragment_id: targetFragmentId,
      rationale: '两条碎片都在追问同一个方向',
    })
    .select('id')
    .single()
  assert.ifError(connectionError)

  const connectedDetailResponse = await api(`/api/fragments/${fragmentId}`, ownerCookie)
  assert.equal(connectedDetailResponse.status, 200)
  const connectedDetail = await connectedDetailResponse.json()
  assert.equal(connectedDetail.data.fragment.clarification.answer, answer)
  assert.equal(connectedDetail.data.fragment.connections[0].otherFragment.content, otherFragment.content ?? '另一条相关的原始碎片')

  const decisionResponse = await api(`/api/connections/${connection.id}`, ownerCookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'confirmed' }),
  })
  assert.equal(decisionResponse.status, 200)
  assert.equal((await decisionResponse.json()).data.connection.status, 'confirmed')

  const sameDecisionResponse = await api(`/api/connections/${connection.id}`, ownerCookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'confirmed' }),
  })
  assert.equal(sameDecisionResponse.status, 200)

  const conflictingDecisionResponse = await api(`/api/connections/${connection.id}`, ownerCookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'rejected' }),
  })
  assert.equal(conflictingDecisionResponse.status, 409)

  const otherUserDecisionResponse = await api(`/api/connections/${connection.id}`, testCookie, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'confirmed' }),
  })
  assert.equal(otherUserDecisionResponse.status, 404)

  await service
    .from('fragments')
    .update({ reconnect_checked_at: new Date().toISOString() })
    .eq('id', fragmentId)
  const decidedReconnectResponse = await api(`/api/fragments/${fragmentId}/reconnect`, ownerCookie, {
    method: 'POST',
  })
  assert.equal(decidedReconnectResponse.status, 200)
  assert.equal((await decidedReconnectResponse.json()).data.connection, null)

  const otherDetailResponse = await api(`/api/fragments/${fragmentId}`, testCookie)
  assert.equal(otherDetailResponse.status, 404)

  console.log(
    'PASS fragments, clarification answers, connection decisions, detail joins and owner isolation',
  )
} finally {
  if (otherFragmentId) await service.from('fragments').delete().eq('id', otherFragmentId)
  if (fragmentId) await service.from('fragments').delete().eq('id', fragmentId)
  if (testUserId) await service.auth.admin.deleteUser(testUserId)
}
