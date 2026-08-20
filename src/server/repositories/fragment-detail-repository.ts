import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

export type Clarification = {
  id: string
  question: string
  answer: string | null
  answeredAt: string | null
  createdAt: string
}

export type Connection = {
  id: string
  rationale: string
  status: 'pending' | 'confirmed' | 'rejected'
  decidedAt: string | null
  createdAt: string
  otherFragment: { id: string; content: string; createdAt: string }
}

type FragmentRow = {
  id: string
  content: string
  input_mode: 'text' | 'voice'
  reconnect_checked_at: string | null
  created_at: string
}

export class FragmentDetailRepository {
  constructor(private readonly client: SupabaseClient) {}

  async get(userId: string, fragmentId: string) {
    const fragmentResult = await this.client
      .from('fragments')
      .select('id, content, input_mode, reconnect_checked_at, created_at')
      .eq('id', fragmentId)
      .eq('user_id', userId)
      .maybeSingle<FragmentRow>()
    if (fragmentResult.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read fragment')
    if (!fragmentResult.data) throw new ApiError(404, 'NOT_FOUND', 'Resource not found')

    const [clarificationResult, connectionsResult] = await Promise.all([
      this.client
        .from('clarifications')
        .select('id, question, answer, answered_at, created_at')
        .eq('user_id', userId)
        .eq('fragment_id', fragmentId)
        .maybeSingle(),
      this.client
        .from('connections')
        .select('id, source_fragment_id, target_fragment_id, rationale, status, decided_at, created_at')
        .eq('user_id', userId)
        .neq('status', 'rejected')
        .or(`source_fragment_id.eq.${fragmentId},target_fragment_id.eq.${fragmentId}`)
        .order('created_at', { ascending: false }),
    ])
    if (clarificationResult.error || connectionsResult.error) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read fragment detail')
    }

    const connectionRows = connectionsResult.data ?? []
    const otherIds = connectionRows.map((row) =>
      row.source_fragment_id === fragmentId ? row.target_fragment_id : row.source_fragment_id,
    )
    const otherFragmentsResult = otherIds.length
      ? await this.client
          .from('fragments')
          .select('id, content, created_at')
          .eq('user_id', userId)
          .in('id', otherIds)
      : { data: [], error: null }
    if (otherFragmentsResult.error) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read connected fragments')
    }
    const otherFragments = new Map(
      (otherFragmentsResult.data ?? []).map((row) => [row.id, row] as const),
    )

    const clarification = clarificationResult.data
      ? {
          id: clarificationResult.data.id,
          question: clarificationResult.data.question,
          answer: clarificationResult.data.answer,
          answeredAt: clarificationResult.data.answered_at,
          createdAt: clarificationResult.data.created_at,
        }
      : null
    const connections: Connection[] = connectionRows.flatMap((row) => {
      const otherId =
        row.source_fragment_id === fragmentId ? row.target_fragment_id : row.source_fragment_id
      const other = otherFragments.get(otherId)
      if (!other) return []
      return [{
        id: row.id,
        rationale: row.rationale,
        status: row.status as Connection['status'],
        decidedAt: row.decided_at,
        createdAt: row.created_at,
        otherFragment: { id: other.id, content: other.content, createdAt: other.created_at },
      }]
    })

    return {
      id: fragmentResult.data.id,
      content: fragmentResult.data.content,
      inputMode: fragmentResult.data.input_mode,
      reconnectCheckedAt: fragmentResult.data.reconnect_checked_at,
      createdAt: fragmentResult.data.created_at,
      clarification: clarification as Clarification | null,
      connections,
    }
  }
}
