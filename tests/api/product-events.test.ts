import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  recordDaily: vi.fn(),
  recordConnectionOpened: vi.fn(),
}))

vi.mock('@/src/lib/auth/require-user', () => ({
  requireMutationUser: mocks.requireUser,
  requireUser: mocks.requireUser,
}))
vi.mock('@/src/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/src/server/repositories/product-event-repository', () => ({
  ProductEventRepository: class {
    recordDaily = mocks.recordDaily
    recordConnectionOpened = mocks.recordConnectionOpened
  },
}))

import { POST } from '@/app/api/product-events/route'

const ids = {
  user: '018f6f3a-a1c2-47a8-8f1e-b00000000001',
  otherUser: '018f6f3a-a1c2-47a8-8f1e-b00000000002',
  request: '018f6f3a-a1c2-47a8-8f1e-b00000000003',
  connection: '018f6f3a-a1c2-47a8-8f1e-b00000000004',
  thought: '018f6f3a-a1c2-47a8-8f1e-b00000000005',
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/product-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: ids.user })
  mocks.recordDaily.mockResolvedValue({ created: true })
  mocks.recordConnectionOpened.mockResolvedValue({ created: true })
})

describe('product event route', () => {
  it.each(['workspace_active_day', 'review_opened'] as const)(
    'records %s for the authenticated user',
    async (eventName) => {
      const response = await POST(request({ eventName, userId: ids.otherUser }))

      expect(response.status).toBe(200)
      expect(mocks.recordDaily).toHaveBeenCalledWith(ids.user, eventName)
      expect(await response.json()).toEqual({ data: { recorded: true } })
    },
  )

  it('passes only fixed connection identifiers to the ownership-checking repository', async () => {
    const response = await POST(request({
      eventName: 'connection_opened',
      requestId: ids.request,
      connectionId: ids.connection,
      thoughtId: ids.thought,
      content: '不得进入事件表的正文',
    }))

    expect(response.status).toBe(200)
    expect(mocks.recordConnectionOpened).toHaveBeenCalledWith({
      userId: ids.user,
      requestId: ids.request,
      connectionId: ids.connection,
      thoughtId: ids.thought,
    })
    expect(JSON.stringify(mocks.recordConnectionOpened.mock.calls)).not.toContain('正文')
  })

  it('does not let the client submit server-owned scan results', async () => {
    const response = await POST(request({
      eventName: 'review_scan_finished',
      requestId: ids.request,
      scanStatus: 'processed',
      createdCount: 3,
    }))

    expect(response.status).toBe(400)
    expect(mocks.recordDaily).not.toHaveBeenCalled()
    expect(mocks.recordConnectionOpened).not.toHaveBeenCalled()
  })

  it('rejects an incomplete connection event before any write', async () => {
    const response = await POST(request({
      eventName: 'connection_opened',
      connectionId: ids.connection,
    }))

    expect(response.status).toBe(400)
    expect(mocks.recordConnectionOpened).not.toHaveBeenCalled()
  })
})
