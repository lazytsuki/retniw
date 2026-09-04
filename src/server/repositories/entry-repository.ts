import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

export type EntryType = 'user' | 'import' | 'ai'
export type AiAction = 'advance' | 'question' | 'organize'

export type EntryRecord = {
  id: string
  user_id: string
  thought_id: string
  client_request_id: string
  entry_type: EntryType
  content: string
  source_label: string | null
  ai_action: AiAction | null
  created_at: string
}

export type Entry = {
  id: string
  thoughtId: string
  clientRequestId: string
  entryType: EntryType
  content: string
  sourceLabel: string | null
  aiAction: AiAction | null
  createdAt: string
}

export function toEntry(row: EntryRecord): Entry {
  return {
    id: row.id,
    thoughtId: row.thought_id,
    clientRequestId: row.client_request_id,
    entryType: row.entry_type,
    content: row.content,
    sourceLabel: row.source_label,
    aiAction: row.ai_action,
    createdAt: row.created_at,
  }
}

function isUnwritableThoughtError(error: { code?: string; message?: string } | null) {
  return error?.code === 'P0001' && error.message?.startsWith('RETNIW_THOUGHT_')
}

type CreateEntryInput = {
  id: string
  userId: string
  thoughtId: string
  clientRequestId: string
  entryType: EntryType
  content: string
  sourceLabel?: string | null
  aiAction?: AiAction | null
}

export class EntryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createIdempotent(input: CreateEntryInput) {
    const row = {
      id: input.id,
      user_id: input.userId,
      thought_id: input.thoughtId,
      client_request_id: input.clientRequestId,
      entry_type: input.entryType,
      content: input.content,
      source_label: input.sourceLabel ?? null,
      ai_action: input.aiAction ?? null,
    }
    const { data, error } = await this.client
      .from('entries')
      .insert(row)
      .select('*')
      .single<EntryRecord>()

    if (!error && data) return { entry: toEntry(data), created: true }
    if (isUnwritableThoughtError(error)) {
      throw new ApiError(409, 'THOUGHT_DELETED', 'Thought is no longer writable')
    }
    if (error?.code !== '23505') {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to save entry')
    }

    const existing = await this.client
      .from('entries')
      .select('*')
      .eq('user_id', input.userId)
      .eq('client_request_id', input.clientRequestId)
      .single<EntryRecord>()

    if (existing.error || !existing.data) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read saved entry')
    }

    const saved = existing.data
    if (
      saved.id !== row.id ||
      saved.thought_id !== row.thought_id ||
      saved.entry_type !== row.entry_type ||
      saved.content !== row.content ||
      saved.source_label !== row.source_label ||
      saved.ai_action !== row.ai_action
    ) {
      throw new ApiError(409, 'STATE_CONFLICT', 'This request id is already used')
    }

    return { entry: toEntry(saved), created: false }
  }

  async listByThought(userId: string, thoughtId: string) {
    const { data, error } = await this.client
      .from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('thought_id', thoughtId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .returns<EntryRecord[]>()

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list entries')
    return data.map(toEntry)
  }

  async claimForReview(userId: string, thoughtId: string, entryId: string) {
    const { data, error } = await this.client
      .from('entries')
      .update({ review_checked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('thought_id', thoughtId)
      .eq('id', entryId)
      .in('entry_type', ['user', 'import'])
      .is('review_checked_at', null)
      .select('*')
      .maybeSingle<EntryRecord>()

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to claim review entry')
    return data ? toEntry(data) : null
  }

  async firstUserEntry(userId: string, thoughtId: string) {
    const { data, error } = await this.client
      .from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('thought_id', thoughtId)
      .in('entry_type', ['user', 'import'])
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle<EntryRecord>()

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read review anchor')
    return data ? toEntry(data) : null
  }

  async latestUserEntry(userId: string, thoughtId: string) {
    const { data, error } = await this.client
      .from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('thought_id', thoughtId)
      .in('entry_type', ['user', 'import'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle<EntryRecord>()

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read current review anchor')
    return data ? toEntry(data) : null
  }

  async findByClientRequest(userId: string, clientRequestId: string) {
    const { data, error } = await this.client
      .from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('client_request_id', clientRequestId)
      .maybeSingle<EntryRecord>()

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read entry request')
    return data ? toEntry(data) : null
  }
}
