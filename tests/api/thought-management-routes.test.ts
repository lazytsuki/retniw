import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getOwned: vi.fn(),
  createCheckpoint: vi.fn(),
  renameCollection: vi.fn(),
  deleteCollection: vi.fn(),
}))

vi.mock('@/src/lib/auth/require-user', () => ({
  requireMutationUser: mocks.requireUser,
  requireRequestUser: mocks.requireUser,
  requireUser: mocks.requireUser,
}))
vi.mock('@/src/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/src/server/repositories/thought-repository', () => ({
  ThoughtRepository: class {
    getOwned = mocks.getOwned
  },
}))
vi.mock('@/src/server/repositories/checkpoint-repository', () => ({
  CheckpointRepository: class {
    createIdempotent = mocks.createCheckpoint
  },
}))
vi.mock('@/src/server/repositories/collection-repository', () => ({
  CollectionRepository: class {
    rename = mocks.renameCollection
    deleteOwned = mocks.deleteCollection
  },
}))

import { POST as createCheckpoint } from '@/app/api/thoughts/[id]/checkpoints/route'
import { DELETE as deleteCollection, PATCH as renameCollection } from '@/app/api/collections/[id]/route'

const userId = '018f6f3a-a1c2-47a8-8f1e-800000000001'
const entryId = '018f6f3a-a1c2-47a8-8f1e-800000000002'
const requestId = '018f6f3a-a1c2-47a8-8f1e-800000000003'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: userId })
})

describe('management route ids', () => {
  it('rejects an invalid checkpoint thought id before reading or writing data', async () => {
    const response = await createCheckpoint(
      new Request('http://localhost/api/thoughts/not-a-uuid/checkpoints', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId, clientRequestId: requestId, note: '' }),
      }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    )

    expect(response.status).toBe(400)
    expect(mocks.getOwned).not.toHaveBeenCalled()
    expect(mocks.createCheckpoint).not.toHaveBeenCalled()
  })

  it.each([
    ['PATCH', renameCollection, mocks.renameCollection],
    ['DELETE', deleteCollection, mocks.deleteCollection],
  ] as const)('rejects an invalid collection id for %s', async (method, handler, repositoryCall) => {
    const request = new Request('http://localhost/api/collections/not-a-uuid', {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'PATCH' ? { body: JSON.stringify({ name: '工作' }) } : {}),
    })
    const response = await handler(request, { params: Promise.resolve({ id: 'not-a-uuid' }) })

    expect(response.status).toBe(400)
    expect(repositoryCall).not.toHaveBeenCalled()
  })
})
