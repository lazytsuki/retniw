import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const ownerEmail = process.env.RETNIW_OWNER_EMAIL
const ownerPassword = process.env.RETNIW_OWNER_PASSWORD

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  RETNIW_OWNER_EMAIL: ownerEmail,
  RETNIW_OWNER_PASSWORD: ownerPassword,
})) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const createPublicClient = () =>
  createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

const testEmail = `retniw.live.${Date.now()}@gmail.com`
const testPassword = `Rt-${crypto.randomUUID()}`
let testUserId
let ownerProbeId

async function getOwner() {
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
  assert.ifError(error)
  const existing = data.users.find((user) => user.email?.toLowerCase() === ownerEmail.toLowerCase())

  if (existing) {
    const { data: updated, error: updateError } = await service.auth.admin.updateUserById(existing.id, {
      password: ownerPassword,
      email_confirm: true,
    })
    assert.ifError(updateError)
    return updated.user
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  })
  assert.ifError(createError)
  assert.ok(created.user)
  return created.user
}

async function assertClientTablesClosed(client) {
  for (const table of ['fragments', 'clarifications', 'connections']) {
    const { data, error } = await client.from(table).select('*')
    assert.ifError(error)
    assert.deepEqual(data, [])
  }

  const { error } = await client.from('fragments').insert({
    user_id: crypto.randomUUID(),
    client_request_id: crypto.randomUUID(),
    content: 'client write must be blocked',
    input_mode: 'text',
  })
  assert.ok(error)
  assert.equal(error.code, '42501')
}

try {
  const owner = await getOwner()
  const { data: testUserData, error: testUserError } = await service.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  })
  assert.ifError(testUserError)
  assert.ok(testUserData.user)
  testUserId = testUserData.user.id

  const ownerClient = createPublicClient()
  const testClient = createPublicClient()
  const { error: ownerSignInError } = await ownerClient.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  })
  const { error: testSignInError } = await testClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })
  assert.ifError(ownerSignInError)
  assert.ifError(testSignInError)

  await assertClientTablesClosed(ownerClient)
  await assertClientTablesClosed(testClient)

  const { data: ownerProbe, error: ownerProbeError } = await service
    .from('fragments')
    .insert({
      user_id: owner.id,
      client_request_id: crypto.randomUUID(),
      content: 'owner isolation probe',
      input_mode: 'text',
    })
    .select('id')
    .single()
  assert.ifError(ownerProbeError)
  ownerProbeId = ownerProbe.id

  const { data: ownerVisible, error: ownerVisibleError } = await service
    .from('fragments')
    .select('id')
    .eq('id', ownerProbeId)
    .eq('user_id', owner.id)
    .maybeSingle()
  assert.ifError(ownerVisibleError)
  assert.ok(ownerVisible)

  const { data: otherVisible, error: otherVisibleError } = await service
    .from('fragments')
    .select('id')
    .eq('id', ownerProbeId)
    .eq('user_id', testUserId)
    .maybeSingle()
  assert.ifError(otherVisibleError)
  assert.equal(otherVisible, null)

  const fragmentRows = [
    {
      user_id: testUserId,
      client_request_id: crypto.randomUUID(),
      content: 'cascade source',
      input_mode: 'text',
    },
    {
      user_id: testUserId,
      client_request_id: crypto.randomUUID(),
      content: 'cascade target',
      input_mode: 'text',
    },
  ]
  const { data: fragments, error: fragmentsError } = await service
    .from('fragments')
    .insert(fragmentRows)
    .select('id')
  assert.ifError(fragmentsError)
  assert.equal(fragments.length, 2)
  fragments.sort((a, b) => a.id.localeCompare(b.id))

  const { error: clarificationError } = await service.from('clarifications').insert({
    user_id: testUserId,
    fragment_id: fragments[0].id,
    question: 'cascade clarification',
  })
  assert.ifError(clarificationError)

  const { error: connectionError } = await service.from('connections').insert({
    user_id: testUserId,
    source_fragment_id: fragments[0].id,
    target_fragment_id: fragments[1].id,
    rationale: 'cascade connection',
  })
  assert.ifError(connectionError)

  const { error: deleteUserError } = await service.auth.admin.deleteUser(testUserId)
  assert.ifError(deleteUserError)
  testUserId = undefined

  for (const table of ['fragments', 'clarifications', 'connections']) {
    const { count, error } = await service
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', testUserData.user.id)
    assert.ifError(error)
    assert.equal(count, 0)
  }

  console.log('PASS owner session, closed client tables, owner isolation, account cascade')
} finally {
  if (ownerProbeId) await service.from('fragments').delete().eq('id', ownerProbeId)
  if (testUserId) await service.auth.admin.deleteUser(testUserId)
}
