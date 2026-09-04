import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ApiError } from '@/src/lib/api-error'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  decide: vi.fn(),
}))

vi.mock('@/src/lib/auth/require-user', () => ({
  requireMutationUser: mocks.requireUser,
  requireUser: mocks.requireUser,
}))
vi.mock('@/src/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/src/server/repositories/thought-connection-repository', () => ({
  ThoughtConnectionRepository: class {
    decide = mocks.decide
  },
}))

import { PATCH as decideRelation } from '@/app/api/thought-connections/[id]/route'

const connectionId = '018f6f3a-a1c2-47a8-8f1e-400000000005'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'owner' })
})

describe('thought connection decision', () => {
  it('rejects an invalid connection id before calling the repository', async () => {
    const request = new NextRequest('http://localhost/api/thought-connections/not-a-uuid', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'confirmed' }),
    })

    const response = await decideRelation(request, {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.decide).not.toHaveBeenCalled()
  })

  it('maps a non-owned connection to 404', async () => {
    mocks.decide.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Resource not found'))
    const request = new NextRequest(`http://localhost/api/thought-connections/${connectionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'confirmed' }),
    })

    const response = await decideRelation(request, {
      params: Promise.resolve({ id: connectionId }),
    })

    expect(response.status).toBe(404)
  })
})
