import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/src/lib/api-error'
import { ProductEventRepository } from '@/src/server/repositories/product-event-repository'

const ids = {
  user: '018f6f3a-a1c2-47a8-8f1e-b00000000001',
  request: '018f6f3a-a1c2-47a8-8f1e-b00000000002',
  connection: '018f6f3a-a1c2-47a8-8f1e-b00000000003',
  sourceThought: '018f6f3a-a1c2-47a8-8f1e-b00000000004',
  targetThought: '018f6f3a-a1c2-47a8-8f1e-b00000000005',
  unrelatedThought: '018f6f3a-a1c2-47a8-8f1e-b00000000006',
}

function mockClient(options?: {
  connection?: { source_thought_id: string; target_thought_id: string } | null
  connectionError?: { code?: string } | null
  insertError?: { code?: string } | null
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options?.connection ?? null,
    error: options?.connectionError ?? null,
  })
  const connectionQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
  }
  connectionQuery.select.mockReturnValue(connectionQuery)
  connectionQuery.eq.mockReturnValue(connectionQuery)
  const insert = vi.fn().mockResolvedValue({ error: options?.insertError ?? null })
  const from = vi.fn((table: string) => table === 'thought_connections'
    ? connectionQuery
    : { insert })

  return {
    client: { from } as unknown as SupabaseClient,
    connectionQuery,
    from,
    insert,
  }
}

describe('ProductEventRepository', () => {
  it('treats a daily uniqueness conflict as an idempotent replay', async () => {
    const { client, insert } = mockClient({ insertError: { code: '23505' } })

    await expect(
      new ProductEventRepository(client).recordDaily(ids.user, 'workspace_active_day'),
    ).resolves.toEqual({ created: false })
    expect(insert).toHaveBeenCalledWith({
      user_id: ids.user,
      event_name: 'workspace_active_day',
    })
  })

  it('records a connection click only when the thought is one of its owned endpoints', async () => {
    const { client, connectionQuery, insert } = mockClient({
      connection: {
        source_thought_id: ids.sourceThought,
        target_thought_id: ids.targetThought,
      },
    })

    await expect(new ProductEventRepository(client).recordConnectionOpened({
      userId: ids.user,
      requestId: ids.request,
      connectionId: ids.connection,
      thoughtId: ids.targetThought,
    })).resolves.toEqual({ created: true })

    expect(connectionQuery.eq).toHaveBeenNthCalledWith(1, 'id', ids.connection)
    expect(connectionQuery.eq).toHaveBeenNthCalledWith(2, 'user_id', ids.user)
    expect(insert).toHaveBeenCalledWith({
      user_id: ids.user,
      event_name: 'connection_opened',
      client_request_id: ids.request,
      thought_id: ids.targetThought,
      connection_id: ids.connection,
    })
  })

  it('rejects a thought outside the owned connection before inserting', async () => {
    const { client, insert } = mockClient({
      connection: {
        source_thought_id: ids.sourceThought,
        target_thought_id: ids.targetThought,
      },
    })

    const result = new ProductEventRepository(client).recordConnectionOpened({
      userId: ids.user,
      requestId: ids.request,
      connectionId: ids.connection,
      thoughtId: ids.unrelatedThought,
    })

    await expect(result).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('keeps scan status and created count within the fixed contract', async () => {
    const { client, insert } = mockClient()
    const repository = new ProductEventRepository(client)

    await expect(repository.recordScanFinished({
      userId: ids.user,
      requestId: ids.request,
      status: 'processed',
      created: 3,
    })).resolves.toEqual({ created: true })
    expect(insert).toHaveBeenCalledWith({
      user_id: ids.user,
      event_name: 'review_scan_finished',
      client_request_id: ids.request,
      scan_status: 'processed',
      created_count: 3,
    })

    expect(() => repository.recordScanFinished({
      userId: ids.user,
      requestId: ids.request,
      status: 'processed',
      created: 4,
    })).toThrowError(ApiError)
  })
})
