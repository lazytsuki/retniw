import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

export type ThoughtCheckpointRecord = {
  id: string
  user_id: string
  thought_id: string
  client_request_id: string
  note: string
  created_at: string
}

export type ThoughtCheckpoint = {
  id: string
  thoughtId: string
  clientRequestId: string
  note: string
  createdAt: string
}

function toCheckpoint(row: ThoughtCheckpointRecord): ThoughtCheckpoint {
  return {
    id: row.id,
    thoughtId: row.thought_id,
    clientRequestId: row.client_request_id,
    note: row.note,
    createdAt: row.created_at,
  }
}

function isUnwritableThoughtError(error: { code?: string; message?: string } | null) {
  return error?.code === 'P0001' && error.message?.startsWith('RETNIW_THOUGHT_')
}

export class CheckpointRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByThought(userId: string, thoughtId: string) {
    const { data, error } = await this.client
      .from('thought_checkpoints')
      .select('*')
      .eq('user_id', userId)
      .eq('thought_id', thoughtId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .returns<ThoughtCheckpointRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list checkpoints')
    return data.map(toCheckpoint)
  }

  async createIdempotent(input: {
    id: string
    userId: string
    thoughtId: string
    clientRequestId: string
    note: string
  }) {
    const row = {
      id: input.id,
      user_id: input.userId,
      thought_id: input.thoughtId,
      client_request_id: input.clientRequestId,
      note: input.note,
    }
    const { data, error } = await this.client
      .from('thought_checkpoints')
      .insert(row)
      .select('*')
      .single<ThoughtCheckpointRecord>()
    if (!error && data) return { checkpoint: toCheckpoint(data), created: true }
    if (isUnwritableThoughtError(error)) {
      throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
    }
    if (error?.code !== '23505') {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to save checkpoint')
    }
    const existing = await this.client
      .from('thought_checkpoints')
      .select('*')
      .eq('user_id', input.userId)
      .eq('client_request_id', input.clientRequestId)
      .maybeSingle<ThoughtCheckpointRecord>()
    if (existing.error || !existing.data) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read checkpoint')
    }
    if (
      existing.data.id !== input.id ||
      existing.data.thought_id !== input.thoughtId ||
      existing.data.note !== input.note
    ) {
      throw new ApiError(409, 'STATE_CONFLICT', 'This request id is already used')
    }
    return { checkpoint: toCheckpoint(existing.data), created: false }
  }
}
