import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getPreference: vi.fn(),
  setPreference: vi.fn(),
  listForReview: vi.fn(),
  countForReview: vi.fn(),
  decodeCursor: vi.fn(),
}))

vi.mock('@/src/lib/auth/require-user', () => ({ requireUser: mocks.requireUser }))
vi.mock('@/src/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/src/server/repositories/review-preference-repository', () => ({
  ReviewPreferenceRepository: class {
    get = mocks.getPreference
    set = mocks.setPreference
  },
}))
vi.mock('@/src/server/repositories/thought-connection-repository', () => ({
  decodeReviewCursor: mocks.decodeCursor,
  ThoughtConnectionRepository: class {
    listForReview = mocks.listForReview
    countForReview = mocks.countForReview
  },
}))

import { GET as getReview } from '@/app/api/review/route'
import { PATCH as updatePreference } from '@/app/api/review/preference/route'

const userId = '018f6f3a-a1c2-47a8-8f1e-b00000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: userId })
  mocks.getPreference.mockResolvedValue({ enabled: false, updatedAt: null })
  mocks.listForReview.mockResolvedValue({ connections: [], nextCursor: null })
  mocks.countForReview.mockResolvedValue(0)
  mocks.setPreference.mockResolvedValue({ enabled: true, updatedAt: '2026-08-24T01:00:00.000Z' })
})

describe('review routes', () => {
  it('returns a default-off preference with pending review data', async () => {
    const response = await getReview(new NextRequest('http://localhost/api/review'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        preference: { enabled: false, updatedAt: null },
        connections: [],
        pendingCount: 0,
        nextCursor: null,
      },
    })
    expect(mocks.listForReview).toHaveBeenCalledWith(userId, 'pending', undefined)
    expect(mocks.countForReview).toHaveBeenCalledWith(userId, 'pending')
  })

  it('does not count pending items for confirmed history', async () => {
    const response = await getReview(
      new NextRequest('http://localhost/api/review?status=confirmed'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).not.toHaveProperty('pendingCount')
    expect(mocks.listForReview).toHaveBeenCalledWith(userId, 'confirmed', undefined)
    expect(mocks.countForReview).not.toHaveBeenCalled()
  })

  it('does not recount pending items while loading another page', async () => {
    const cursor = { createdAt: '2026-08-24T00:00:00.000Z', id: userId }
    mocks.decodeCursor.mockReturnValue(cursor)
    const response = await getReview(
      new NextRequest('http://localhost/api/review?status=pending&cursor=next'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).not.toHaveProperty('pendingCount')
    expect(mocks.listForReview).toHaveBeenCalledWith(userId, 'pending', cursor)
    expect(mocks.countForReview).not.toHaveBeenCalled()
  })

  it('rejects unsupported review states before reading connections', async () => {
    const response = await getReview(
      new NextRequest('http://localhost/api/review?status=rejected'),
    )

    expect(response.status).toBe(400)
    expect(mocks.listForReview).not.toHaveBeenCalled()
  })

  it('updates only a boolean preference for the authenticated user', async () => {
    const response = await updatePreference(new NextRequest('http://localhost/api/review/preference', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.setPreference).toHaveBeenCalledWith(userId, true)
    expect((await response.json()).data.preference.enabled).toBe(true)
  })

  it('rejects a non-boolean preference without writing', async () => {
    const response = await updatePreference(new NextRequest('http://localhost/api/review/preference', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: 'yes' }),
    }))

    expect(response.status).toBe(400)
    expect(mocks.setPreference).not.toHaveBeenCalled()
  })
})
