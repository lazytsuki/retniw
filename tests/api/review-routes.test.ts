import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getPreference: vi.fn(),
  setPreference: vi.fn(),
  listForReview: vi.fn(),
  countForReview: vi.fn(),
  decodeCursor: vi.fn(),
  scanExistingThoughts: vi.fn(),
  recordScanFinished: vi.fn(),
  scheduleAfter: vi.fn(),
  afterCallbacks: [] as Array<() => void | Promise<void>>,
}))

vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: mocks.scheduleAfter,
}))
vi.mock('@/src/lib/auth/require-user', () => ({
  requireMutationUser: mocks.requireUser,
  requireRequestUser: mocks.requireUser,
  requireUser: mocks.requireUser,
}))
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
vi.mock('@/src/server/review/review-service', () => ({
  ReviewService: class {
    static fromClient() {
      return { scanExistingThoughts: mocks.scanExistingThoughts }
    }
  },
}))
vi.mock('@/src/server/repositories/product-event-repository', () => ({
  ProductEventRepository: class {
    recordScanFinished = mocks.recordScanFinished
  },
}))

import { GET as getReview } from '@/app/api/review/route'
import { PATCH as updatePreference } from '@/app/api/review/preference/route'
import { POST as scanExistingThoughts } from '@/app/api/review/scan/route'

const userId = '018f6f3a-a1c2-47a8-8f1e-b00000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.afterCallbacks.splice(0)
  mocks.scheduleAfter.mockImplementation((callback: () => void | Promise<void>) => {
    mocks.afterCallbacks.push(callback)
  })
  mocks.requireUser.mockResolvedValue({ id: userId })
  mocks.getPreference.mockResolvedValue({ enabled: false, updatedAt: null })
  mocks.listForReview.mockResolvedValue({ connections: [], nextCursor: null })
  mocks.countForReview.mockResolvedValue(0)
  mocks.setPreference.mockResolvedValue({ enabled: true, updatedAt: '2026-08-24T01:00:00.000Z' })
  mocks.scanExistingThoughts.mockResolvedValue({ status: 'processed', created: 2 })
  mocks.recordScanFinished.mockResolvedValue({ created: true })
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

  it('starts an explicit existing-thought scan for the authenticated user', async () => {
    const requestId = '018f6f3a-a1c2-47a8-8f1e-b00000000002'
    const response = await scanExistingThoughts(new NextRequest('http://localhost/api/review/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.scanExistingThoughts).toHaveBeenCalledWith(userId)
    expect(mocks.recordScanFinished).not.toHaveBeenCalled()
    expect(mocks.afterCallbacks).toHaveLength(1)
    await mocks.afterCallbacks[0]()
    expect(mocks.recordScanFinished).toHaveBeenCalledWith({
      userId,
      requestId,
      status: 'processed',
      created: 2,
    })
    expect(await response.json()).toEqual({
      data: { status: 'processed', created: 2 },
    })
  })

  it('returns the scan result when event recording fails', async () => {
    mocks.recordScanFinished.mockRejectedValue(new Error('write failed'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await scanExistingThoughts(new NextRequest('http://localhost/api/review/scan', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(mocks.recordScanFinished).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({
      data: { status: 'processed', created: 2 },
    })
    await mocks.afterCallbacks[0]()
    expect(error).toHaveBeenCalledWith('product_event_failed', {
      eventName: 'review_scan_finished',
    })
    error.mockRestore()
  })
})
