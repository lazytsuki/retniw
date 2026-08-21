import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ApiError } from '@/src/lib/api-error'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  ensure: vi.fn(),
  getOwned: vi.fn(),
  touch: vi.fn(),
  listRecent: vi.fn(),
  getDetail: vi.fn(),
  createEntry: vi.fn(),
  listEntries: vi.fn(),
  decodeThoughtCursor: vi.fn(),
}))

vi.mock('@/src/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/src/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/src/server/repositories/thought-repository', () => ({
  decodeThoughtCursor: mocks.decodeThoughtCursor,
  ThoughtRepository: class {
    ensure = mocks.ensure
    getOwned = mocks.getOwned
    touch = mocks.touch
    listRecent = mocks.listRecent
    getDetail = mocks.getDetail
  },
}))
vi.mock('@/src/server/repositories/entry-repository', () => ({
  EntryRepository: class {
    createIdempotent = mocks.createEntry
    listByThought = mocks.listEntries
  },
}))

import { GET as listThoughts, POST as createThought } from '@/app/api/thoughts/route'
import { POST as appendEntry } from '@/app/api/thoughts/[id]/entries/route'

const ids = {
  user: '018f6f3a-a1c2-47a8-8f1e-100000000001',
  thought: '018f6f3a-a1c2-47a8-8f1e-100000000002',
  entry: '018f6f3a-a1c2-47a8-8f1e-100000000003',
  request: '018f6f3a-a1c2-47a8-8f1e-100000000004',
}
const createdAt = '2026-08-19T10:00:00.000Z'
const body = {
  thoughtId: ids.thought,
  entryId: ids.entry,
  clientRequestId: ids.request,
  entryType: 'user',
  content: '继续把这件事想下去',
  sourceLabel: null,
}
const thought = {
  id: ids.thought,
  createdAt,
  lastActivityAt: createdAt,
  relationCheckedAt: null,
}
const entry = {
  id: ids.entry,
  thoughtId: ids.thought,
  clientRequestId: ids.request,
  entryType: 'user',
  content: body.content,
  sourceLabel: null,
  aiAction: null,
  createdAt,
}

function request(payload: object) {
  return new NextRequest('http://localhost/api/thoughts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: ids.user })
  mocks.ensure.mockResolvedValue({ thought, created: true })
  mocks.getOwned.mockResolvedValue(thought)
  mocks.touch.mockResolvedValue(undefined)
  mocks.createEntry.mockResolvedValue({ entry, created: true })
  mocks.decodeThoughtCursor.mockReturnValue({ lastActivityAt: createdAt, id: ids.thought })
})

describe('thought write routes', () => {
  it('creates a thought and its first entry before returning success', async () => {
    const response = await createThought(request(body))

    expect(response.status).toBe(201)
    expect(mocks.ensure).toHaveBeenCalledWith(ids.user, ids.thought)
    expect(mocks.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ids.user, thoughtId: ids.thought, content: body.content }),
    )
    expect(mocks.touch).toHaveBeenCalledWith(ids.user, ids.thought, createdAt)
  })

  it('returns the existing result when the same request is retried', async () => {
    mocks.ensure.mockResolvedValue({ thought, created: false })
    mocks.createEntry.mockResolvedValue({ entry, created: false })

    const response = await createThought(request(body))

    expect(response.status).toBe(200)
    expect(mocks.touch).toHaveBeenCalledWith(ids.user, ids.thought, createdAt)
  })

  it('can repair activity time after a partial first attempt', async () => {
    mocks.touch
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Unable to update activity', true))
      .mockResolvedValueOnce(undefined)

    const first = await createThought(request(body))
    mocks.ensure.mockResolvedValue({ thought, created: false })
    mocks.createEntry.mockResolvedValue({ entry, created: false })
    const retry = await createThought(request(body))

    expect(first.status).toBe(500)
    expect(retry.status).toBe(200)
    expect(mocks.touch).toHaveBeenCalledTimes(2)
  })

  it('returns 404 before writing when the thought belongs to another account', async () => {
    mocks.getOwned.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Thought not found'))
    const appendBody = { ...body }
    delete (appendBody as Partial<typeof body>).thoughtId

    const response = await appendEntry(request(appendBody), {
      params: Promise.resolve({ id: ids.thought }),
    })

    expect(response.status).toBe(404)
    expect(mocks.createEntry).not.toHaveBeenCalled()
  })
})

describe('thought list route', () => {
  it('passes the next-page cursor through and returns the repository page', async () => {
    const result = { thoughts: [thought], nextCursor: 'next-page' }
    mocks.listRecent.mockResolvedValue(result)

    const response = await listThoughts(
      new NextRequest('http://localhost/api/thoughts?cursor=encoded-page'),
    )

    expect(response.status).toBe(200)
    expect(mocks.decodeThoughtCursor).toHaveBeenCalledWith('encoded-page')
    expect(mocks.listRecent).toHaveBeenCalledWith(ids.user, {
      lastActivityAt: createdAt,
      id: ids.thought,
    })
    expect((await response.json()).data).toEqual(result)
  })
})
