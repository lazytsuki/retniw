import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'
import type { EntryRecord } from './entry-repository'
import { toEntry } from './entry-repository'

export type ThoughtConnectionStatus = 'pending' | 'confirmed' | 'rejected'
export type ThoughtConnectionDecision = 'confirmed' | 'rejected'

type ThoughtConnectionRecord = {
  id: string
  user_id: string
  source_thought_id: string
  target_thought_id: string
  source_entry_id: string
  target_entry_id: string
  rationale: string
  status: ThoughtConnectionStatus
  decided_at: string | null
  created_at: string
}

function isUnwritableThoughtError(error: { code?: string; message?: string } | null) {
  return error?.code === 'P0001' && error.message?.startsWith('RETNIW_THOUGHT_')
}

export class ThoughtConnectionRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async withActiveThoughts(userId: string, records: ThoughtConnectionRecord[]) {
    if (!records.length) return []
    const thoughtIds = Array.from(new Set(records.flatMap((record) => [
      record.source_thought_id,
      record.target_thought_id,
    ])))
    const { data, error } = await this.client
      .from('thoughts')
      .select('id')
      .eq('user_id', userId)
      .in('id', thoughtIds)
      .is('deleted_at', null)
      .returns<Array<{ id: string }>>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read connected thoughts')
    const activeIds = new Set(data.map((thought) => thought.id))
    return records.filter(
      (record) => activeIds.has(record.source_thought_id) && activeIds.has(record.target_thought_id),
    )
  }

  private async toView(userId: string, record: ThoughtConnectionRecord) {
    const { data, error } = await this.client
      .from('entries')
      .select('*')
      .eq('user_id', userId)
      .in('id', [record.source_entry_id, record.target_entry_id])
      .returns<EntryRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read connection entries')
    const entries = new Map(data.map((entry) => [entry.id, toEntry(entry)]))
    return {
      id: record.id,
      sourceThoughtId: record.source_thought_id,
      targetThoughtId: record.target_thought_id,
      sourceEntry: entries.get(record.source_entry_id) ?? null,
      targetEntry: entries.get(record.target_entry_id) ?? null,
      rationale: record.rationale,
      status: record.status,
      decidedAt: record.decided_at,
      createdAt: record.created_at,
    }
  }

  private async readPair(userId: string, firstThoughtId: string, secondThoughtId: string) {
    const [sourceThoughtId, targetThoughtId] = [firstThoughtId, secondThoughtId].sort()
    const { data, error } = await this.client
      .from('thought_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('source_thought_id', sourceThoughtId)
      .eq('target_thought_id', targetThoughtId)
      .maybeSingle<ThoughtConnectionRecord>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read thought connection')
    return data
  }

  async pendingForThought(userId: string, thoughtId: string) {
    const { data, error } = await this.client
      .from('thought_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .or(`source_thought_id.eq.${thoughtId},target_thought_id.eq.${thoughtId}`)
      .order('created_at', { ascending: false })
      .returns<ThoughtConnectionRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read pending connection')
    const [pending] = await this.withActiveThoughts(userId, data)
    return pending ? this.toView(userId, pending) : null
  }

  async createCandidate(input: {
    userId: string
    currentThoughtId: string
    targetThoughtId: string
    currentEntryId: string
    targetEntryId: string
    rationale: string
  }) {
    const sourceFirst = input.currentThoughtId < input.targetThoughtId
    const row = {
      id: crypto.randomUUID(),
      user_id: input.userId,
      source_thought_id: sourceFirst ? input.currentThoughtId : input.targetThoughtId,
      target_thought_id: sourceFirst ? input.targetThoughtId : input.currentThoughtId,
      source_entry_id: sourceFirst ? input.currentEntryId : input.targetEntryId,
      target_entry_id: sourceFirst ? input.targetEntryId : input.currentEntryId,
      rationale: input.rationale,
    }
    const existing = await this.readPair(input.userId, input.currentThoughtId, input.targetThoughtId)
    if (existing) {
      const [active] = await this.withActiveThoughts(input.userId, [existing])
      if (!active) throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
      return {
        connection: active.status === 'pending' ? await this.toView(input.userId, active) : null,
        created: false,
      }
    }

    const inserted = await this.client
      .from('thought_connections')
      .insert(row)
      .select('*')
      .single<ThoughtConnectionRecord>()
    if (!inserted.error && inserted.data) {
      return { connection: await this.toView(input.userId, inserted.data), created: true }
    }
    if (isUnwritableThoughtError(inserted.error)) {
      throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
    }
    if (inserted.error?.code !== '23505') {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to save thought connection')
    }

    const raced = await this.readPair(input.userId, input.currentThoughtId, input.targetThoughtId)
    if (!raced) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read thought connection')
    const [active] = await this.withActiveThoughts(input.userId, [raced])
    if (!active) throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
    return {
      connection: active.status === 'pending' ? await this.toView(input.userId, active) : null,
      created: false,
    }
  }

  async markChecked(userId: string, thoughtId: string) {
    const { data, error } = await this.client
      .from('thoughts')
      .update({ relation_checked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', thoughtId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle<{ id: string }>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to complete relation check')
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Thought not found')
  }

  async decide(userId: string, connectionId: string, decision: ThoughtConnectionDecision) {
    const existing = await this.client
      .from('thought_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', userId)
      .maybeSingle<ThoughtConnectionRecord>()
    if (existing.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read connection')
    if (!existing.data) throw new ApiError(404, 'NOT_FOUND', 'Resource not found')
    const [active] = await this.withActiveThoughts(userId, [existing.data])
    if (!active) throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
    if (active.status === decision) return this.toView(userId, active)
    if (active.status !== 'pending') {
      throw new ApiError(409, 'STATE_CONFLICT', 'Connection was already decided')
    }

    const updated = await this.client
      .from('thought_connections')
      .update({ status: decision, decided_at: new Date().toISOString() })
      .eq('id', connectionId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle<ThoughtConnectionRecord>()
    if (isUnwritableThoughtError(updated.error)) {
      throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
    }
    if (updated.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to update connection')
    if (updated.data) return this.toView(userId, updated.data)

    const raced = await this.client
      .from('thought_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', userId)
      .single<ThoughtConnectionRecord>()
    if (raced.error || !raced.data) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read connection')
    }
    const [activeRaced] = await this.withActiveThoughts(userId, [raced.data])
    if (!activeRaced) throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
    if (activeRaced.status === decision) return this.toView(userId, activeRaced)
    throw new ApiError(409, 'STATE_CONFLICT', 'Connection was already decided')
  }
}
