import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/src/lib/api-error'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findActiveByToken: vi.fn(),
  touchToken: vi.fn(),
  listActive: vi.fn(),
  createToken: vi.fn(),
  revoke: vi.fn(),
  ensureForToken: vi.fn(),
  touchThought: vi.fn(),
  setSummaryIfEmpty: vi.fn(),
  createEntry: vi.fn(),
  scheduleSavedEntryReview: vi.fn(),
}))

vi.mock('@/src/lib/auth/require-user', () => ({
  requireMutationUser: mocks.requireUser,
  requireRequestUser: mocks.requireUser,
  requireUser: mocks.requireUser,
}))
vi.mock('@/src/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/src/server/repositories/access-token-repository', () => ({
  AccessTokenRepository: class {
    findActiveByToken = mocks.findActiveByToken
    touch = mocks.touchToken
    listActive = mocks.listActive
    create = mocks.createToken
    revoke = mocks.revoke
  },
}))
vi.mock('@/src/server/repositories/thought-repository', () => ({
  ThoughtRepository: class {
    ensureForToken = mocks.ensureForToken
    touch = mocks.touchThought
    setSummaryIfEmpty = mocks.setSummaryIfEmpty
  },
}))
vi.mock('@/src/server/repositories/entry-repository', () => ({
  EntryRepository: class {
    createIdempotent = mocks.createEntry
  },
}))
vi.mock('@/src/server/review/schedule-saved-entry-review', () => ({
  scheduleSavedEntryReview: mocks.scheduleSavedEntryReview,
}))

import { generateAccessToken, hashAccessToken, readBearerToken } from '@/src/lib/auth/access-token'
import { requireTokenUser } from '@/src/lib/auth/require-token-user'
import { parseAccessTokenName, parseTokenEntryInput } from '@/src/server/access-tokens/parse-access-token-input'
import { POST as writeEntry } from '@/app/api/v1/entries/route'
import { GET as listTokens, POST as createToken } from '@/app/api/access-tokens/route'
import { DELETE as revokeToken } from '@/app/api/access-tokens/[id]/route'

const ids = {
  user: '018f6f3a-a1c2-47a8-8f1e-200000000001',
  token: '018f6f3a-a1c2-47a8-8f1e-200000000002',
  thought: '018f6f3a-a1c2-47a8-8f1e-200000000003',
  entry: '018f6f3a-a1c2-47a8-8f1e-200000000004',
  request: '018f6f3a-a1c2-47a8-8f1e-200000000005',
}
const token = generateAccessToken()
const tokenRecord = {
  id: ids.token,
  user_id: ids.user,
  name: '小冬',
  token_hash: hashAccessToken(token),
  created_at: '2026-10-27T00:00:00.000Z',
  last_used_at: null,
  revoked_at: null,
}
const entryBody = {
  thoughtId: ids.thought,
  entryId: ids.entry,
  requestId: ids.request,
  content: '我好像更在意过程，而不是结果。',
}

function bearer(value: string | null, body: unknown = entryBody) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (value) headers.set('authorization', `Bearer ${value}`)
  return new Request('http://localhost/api/v1/entries', { method: 'POST', headers, body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findActiveByToken.mockImplementation(async (value: string) => (value === token ? tokenRecord : null))
  mocks.touchToken.mockResolvedValue(undefined)
  mocks.ensureForToken.mockResolvedValue({ thought: { id: ids.thought }, created: true })
  mocks.createEntry.mockImplementation(async (input: Record<string, unknown>) => ({
    entry: { id: input.id, entryType: input.entryType, content: input.content, sourceLabel: input.sourceLabel, createdAt: '2026-10-27T01:00:00.000Z' },
    created: true,
  }))
})

describe('access token format', () => {
  it('generates prefixed random tokens and stores only a sha256 hash', () => {
    expect(token).toMatch(/^rtw_[A-Za-z0-9_-]{43}$/)
    expect(generateAccessToken()).not.toBe(token)
    expect(hashAccessToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashAccessToken(token)).toBe(hashAccessToken(token))
  })

  it.each([
    [null, null],
    ['Basic abc', null],
    [`Bearer ${token}x`, null],
    ['Bearer rtw_short', null],
    [`Bearer ${token}`, token],
    [`bearer   ${token}`, token],
  ])('reads only a well-formed bearer token (%s)', (header, expected) => {
    const headers = new Headers()
    if (header) headers.set('authorization', header)
    expect(readBearerToken(new Request('http://localhost', { headers }))).toBe(expected)
  })
})

describe('token identity', () => {
  it('rejects missing, unknown and revoked tokens without touching the session', async () => {
    await expect(requireTokenUser(bearer(null), { findActiveByToken: mocks.findActiveByToken }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    await expect(requireTokenUser(bearer(generateAccessToken()), { findActiveByToken: mocks.findActiveByToken }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(mocks.requireUser).not.toHaveBeenCalled()
  })

  it('resolves the owner and the token name', async () => {
    await expect(requireTokenUser(bearer(token), { findActiveByToken: mocks.findActiveByToken }))
      .resolves.toEqual({ userId: ids.user, tokenId: ids.token, tokenName: '小冬' })
  })
})

describe('token entry input', () => {
  it('keeps the original text and trims only the source label', () => {
    expect(parseTokenEntryInput({ ...entryBody, content: '  原话\n保留换行  ', sourceLabel: '  QQ  ' }))
      .toEqual({ ...entryBody, content: '  原话\n保留换行  ', sourceLabel: 'QQ' })
    expect(parseTokenEntryInput(entryBody).sourceLabel).toBeNull()
  })

  it.each([
    null,
    { ...entryBody, thoughtId: 'nope' },
    { ...entryBody, entryId: undefined },
    { ...entryBody, requestId: 'nope' },
    { ...entryBody, content: '   ' },
    { ...entryBody, content: 'x'.repeat(10_001) },
    { ...entryBody, sourceLabel: 3 },
    { ...entryBody, sourceLabel: 'x'.repeat(256) },
  ])('rejects invalid input', (input) => {
    expect(() => parseTokenEntryInput(input)).toThrowError(
      expect.objectContaining<Partial<ApiError>>({ status: 400, code: 'INVALID_INPUT' }),
    )
  })

  it.each([null, {}, { name: '  ' }, { name: 'x'.repeat(41) }])('requires a 1-40 char token name', (input) => {
    expect(() => parseAccessTokenName(input)).toThrowError(expect.objectContaining({ status: 400 }))
  })
})

describe('POST /api/v1/entries', () => {
  it('saves the text as an import labelled with the token name and schedules review', async () => {
    const response = await writeEntry(bearer(token))
    expect(response.status).toBe(201)
    expect(mocks.ensureForToken).toHaveBeenCalledWith(ids.user, ids.token, ids.thought)
    expect(mocks.createEntry).toHaveBeenCalledWith({
      id: ids.entry,
      userId: ids.user,
      thoughtId: ids.thought,
      clientRequestId: ids.request,
      entryType: 'import',
      content: entryBody.content,
      sourceLabel: '小冬',
    })
    expect(mocks.scheduleSavedEntryReview).toHaveBeenCalledWith(expect.objectContaining({
      userId: ids.user, thoughtId: ids.thought, entryId: ids.entry,
    }))
    expect(mocks.touchToken).toHaveBeenCalledWith(ids.token)
    expect(mocks.requireUser).not.toHaveBeenCalled()
  })

  it('returns 200 for an idempotent replay and honours an explicit source label', async () => {
    mocks.ensureForToken.mockResolvedValueOnce({ thought: { id: ids.thought }, created: false })
    const response = await writeEntry(bearer(token, { ...entryBody, sourceLabel: 'QQ' }))
    expect(response.status).toBe(200)
    expect(mocks.createEntry).toHaveBeenCalledWith(expect.objectContaining({ sourceLabel: 'QQ' }))
  })

  it('rejects unauthenticated calls before any repository work', async () => {
    const response = await writeEntry(bearer(null))
    expect(response.status).toBe(401)
    expect(mocks.ensureForToken).not.toHaveBeenCalled()
    expect(mocks.createEntry).not.toHaveBeenCalled()
  })

  it('passes through the forbidden-thought guard without writing', async () => {
    mocks.ensureForToken.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'not yours'))
    const response = await writeEntry(bearer(token))
    expect(response.status).toBe(403)
    expect((await response.json()).error.code).toBe('FORBIDDEN')
    expect(mocks.createEntry).not.toHaveBeenCalled()
  })

  it('still succeeds when recording last use fails', async () => {
    mocks.touchToken.mockRejectedValueOnce(new Error('db down'))
    expect((await writeEntry(bearer(token))).status).toBe(201)
  })
})

describe('access token management routes', () => {
  beforeEach(() => mocks.requireUser.mockResolvedValue({ id: ids.user, email: null, nickname: null }))

  it('lists active tokens for the page account', async () => {
    mocks.listActive.mockResolvedValue([{ id: ids.token, name: '小冬', createdAt: 'x', lastUsedAt: null }])
    const response = await listTokens(new Request('http://localhost/api/access-tokens'))
    expect(await response.json()).toEqual({ data: { accessTokens: [{ id: ids.token, name: '小冬', createdAt: 'x', lastUsedAt: null }] } })
    expect(mocks.listActive).toHaveBeenCalledWith(ids.user)
  })

  it('creates a token and returns the plaintext once', async () => {
    mocks.createToken.mockResolvedValue({ token, accessToken: { id: ids.token, name: '小冬', createdAt: 'x', lastUsedAt: null } })
    const response = await createToken(new Request('http://localhost/api/access-tokens', {
      method: 'POST', body: JSON.stringify({ name: ' 小冬 ' }),
    }))
    expect(response.status).toBe(201)
    expect(mocks.createToken).toHaveBeenCalledWith(ids.user, '小冬')
    expect((await response.json()).data.token).toBe(token)
  })

  it('revokes by id and validates the id', async () => {
    const ok = await revokeToken(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: ids.token }) })
    expect(ok.status).toBe(204)
    expect(mocks.revoke).toHaveBeenCalledWith(ids.user, ids.token)
    const bad = await revokeToken(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ id: 'x' }) })
    expect(bad.status).toBe(400)
  })
})
