import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

export type DailyProductEventName = 'workspace_active_day' | 'review_opened'
export type ReviewScanStatus =
  | 'disabled'
  | 'not-enough-content'
  | 'processed'
  | 'provider-failed'
  | 'persistence-failed'

type ConnectionRecord = {
  source_thought_id: string
  target_thought_id: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REVIEW_SCAN_STATUSES = new Set<ReviewScanStatus>([
  'disabled',
  'not-enough-content',
  'processed',
  'provider-failed',
  'persistence-failed',
])

function isDuplicate(error: { code?: string } | null) {
  return error?.code === '23505'
}

async function insertEvent(client: SupabaseClient, row: Record<string, unknown>) {
  const { error } = await client.from('product_events').insert(row)
  if (!error) return { created: true }
  if (isDuplicate(error)) return { created: false }
  throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to record product event')
}

export class ProductEventRepository {
  constructor(private readonly client: SupabaseClient) {}

  recordDaily(userId: string, eventName: DailyProductEventName) {
    return insertEvent(this.client, {
      user_id: userId,
      event_name: eventName,
    })
  }

  recordScanFinished(input: {
    userId: string
    requestId: string
    status: ReviewScanStatus
    created: number
  }) {
    if (
      !UUID_PATTERN.test(input.requestId) ||
      !REVIEW_SCAN_STATUSES.has(input.status) ||
      !Number.isInteger(input.created) ||
      input.created < 0 ||
      input.created > 3
    ) {
      throw new ApiError(400, 'INVALID_INPUT', 'Invalid review scan event')
    }

    return insertEvent(this.client, {
      user_id: input.userId,
      event_name: 'review_scan_finished',
      client_request_id: input.requestId,
      scan_status: input.status,
      created_count: input.created,
    })
  }

  async recordConnectionOpened(input: {
    userId: string
    requestId: string
    connectionId: string
    thoughtId: string
  }) {
    if (
      !UUID_PATTERN.test(input.requestId) ||
      !UUID_PATTERN.test(input.connectionId) ||
      !UUID_PATTERN.test(input.thoughtId)
    ) {
      throw new ApiError(400, 'INVALID_INPUT', 'Invalid connection event')
    }

    const { data, error } = await this.client
      .from('thought_connections')
      .select('source_thought_id, target_thought_id')
      .eq('id', input.connectionId)
      .eq('user_id', input.userId)
      .maybeSingle<ConnectionRecord>()

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to verify connection')
    if (
      !data ||
      (data.source_thought_id !== input.thoughtId && data.target_thought_id !== input.thoughtId)
    ) {
      throw new ApiError(404, 'NOT_FOUND', 'Resource not found')
    }

    return insertEvent(this.client, {
      user_id: input.userId,
      event_name: 'connection_opened',
      client_request_id: input.requestId,
      thought_id: input.thoughtId,
      connection_id: input.connectionId,
    })
  }
}
