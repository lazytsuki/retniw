import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ApiError } from '@/src/lib/api-error'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDetail: vi.fn(),
  listRecent: vi.fn(),
  pending: vi.fn(),
  markChecked: vi.fn(),
  createCandidate: vi.fn(),
  decide: vi.fn(),
  findConnection: vi.fn(),
}))

vi.mock('@/src/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/src/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/src/server/repositories/thought-repository', () => ({
  ThoughtRepository: class {
    getDetail = mocks.getDetail
    listRecent = mocks.listRecent
  },
}))
vi.mock('@/src/server/repositories/thought-connection-repository', () => ({
  ThoughtConnectionRepository: class {
    pendingForThought = mocks.pending
    markChecked = mocks.markChecked
    createCandidate = mocks.createCandidate
    decide = mocks.decide
  },
}))
vi.mock('@/src/server/ai/deepseek-text-provider', () => ({
  DeepSeekTextProvider: class {
    findConnection = mocks.findConnection
  },
}))

import { POST as checkRelation } from '@/app/api/thoughts/[id]/relations/check/route'
import { PATCH as decideRelation } from '@/app/api/thought-connections/[id]/route'

const currentId = '018f6f3a-a1c2-47a8-8f1e-400000000001'
const targetId = '018f6f3a-a1c2-47a8-8f1e-400000000002'
const currentEntryId = '018f6f3a-a1c2-47a8-8f1e-400000000003'
const targetEntryId = '018f6f3a-a1c2-47a8-8f1e-400000000004'
const connection = {
  id: '018f6f3a-a1c2-47a8-8f1e-400000000005',
  sourceThoughtId: currentId,
  targetThoughtId: targetId,
  sourceEntry: { id: currentEntryId, content: '当前内容', thoughtId: currentId },
  targetEntry: { id: targetEntryId, content: '候选内容', thoughtId: targetId },
  rationale: '共同关注同一问题',
  status: 'pending',
  decidedAt: null,
  createdAt: '2026-08-20T10:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'owner' })
  mocks.pending.mockResolvedValue(null)
  mocks.markChecked.mockResolvedValue(undefined)
  mocks.getDetail.mockImplementation(async (_userId: string, thoughtId: string) => ({
    thought: {
      id: thoughtId,
      relationCheckedAt: null,
      lastActivityAt: '2026-08-20T10:00:00.000Z',
    },
    entries: [
      {
        id: thoughtId === currentId ? currentEntryId : targetEntryId,
        content: thoughtId === currentId ? '当前内容' : '候选内容',
      },
    ],
    connections: [],
  }))
  mocks.listRecent.mockResolvedValue({
    thoughts: [{ id: currentId }, { id: targetId }],
    nextCursor: null,
  })
  mocks.findConnection.mockResolvedValue({
    targetThoughtId: targetId,
    sourceEntryId: currentEntryId,
    targetEntryId,
    rationale: connection.rationale,
  })
  mocks.createCandidate.mockResolvedValue({ connection, created: true })
})

describe('thought relation check', () => {
  it('marks a single thought checked without invoking the model', async () => {
    mocks.listRecent.mockResolvedValue({ thoughts: [{ id: currentId }], nextCursor: null })

    const response = await checkRelation(new Request('http://localhost'), {
      params: Promise.resolve({ id: currentId }),
    })

    expect(response.status).toBe(200)
    expect((await response.json()).data.connection).toBeNull()
    expect(mocks.findConnection).not.toHaveBeenCalled()
    expect(mocks.markChecked).toHaveBeenCalledWith('owner', currentId)
  })

  it('returns at most one validated candidate and marks the check complete', async () => {
    const response = await checkRelation(new Request('http://localhost'), {
      params: Promise.resolve({ id: currentId }),
    })

    expect(response.status).toBe(201)
    expect((await response.json()).data.connection.id).toBe(connection.id)
    expect(mocks.createCandidate).toHaveBeenCalledTimes(1)
    expect(mocks.markChecked).toHaveBeenCalledWith('owner', currentId)
  })

  it('returns an existing pending candidate without invoking the model', async () => {
    mocks.pending.mockResolvedValue(connection)

    const response = await checkRelation(new Request('http://localhost'), {
      params: Promise.resolve({ id: currentId }),
    })

    expect(response.status).toBe(200)
    expect(mocks.findConnection).not.toHaveBeenCalled()
    expect((await response.json()).data.connection.id).toBe(connection.id)
  })
})

describe('thought connection decision', () => {
  it('maps a non-owned connection to 404', async () => {
    mocks.decide.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Resource not found'))
    const request = new NextRequest(`http://localhost/api/thought-connections/${connection.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'confirmed' }),
    })

    const response = await decideRelation(request, {
      params: Promise.resolve({ id: connection.id }),
    })

    expect(response.status).toBe(404)
  })
})
