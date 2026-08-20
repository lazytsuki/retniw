import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'
import { EntryRepository, type Entry, type EntryRecord, toEntry } from './entry-repository'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ThoughtRecord = {
  id: string
  user_id: string
  last_activity_at: string
  relation_checked_at: string | null
  created_at: string
}

export type Thought = {
  id: string
  lastActivityAt: string
  relationCheckedAt: string | null
  createdAt: string
}

type ConnectionRecord = {
  id: string
  source_thought_id: string
  target_thought_id: string
  source_entry_id: string
  target_entry_id: string
  rationale: string
  status: 'pending' | 'confirmed' | 'rejected'
  decided_at: string | null
  created_at: string
}

export function toThought(row: ThoughtRecord): Thought {
  return {
    id: row.id,
    lastActivityAt: row.last_activity_at,
    relationCheckedAt: row.relation_checked_at,
    createdAt: row.created_at,
  }
}

export class ThoughtRepository {
  constructor(private readonly client: SupabaseClient) {}

  async ensure(userId: string, thoughtId: string) {
    const { data, error } = await this.client
      .from('thoughts')
      .insert({ id: thoughtId, user_id: userId })
      .select('*')
      .single<ThoughtRecord>()

    if (!error && data) return { thought: toThought(data), created: true }
    if (error?.code !== '23505') {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to create thought')
    }

    return { thought: await this.getOwned(userId, thoughtId), created: false }
  }

  async getOwned(userId: string, thoughtId: string) {
    const { data, error } = await this.client
      .from('thoughts')
      .select('*')
      .eq('user_id', userId)
      .eq('id', thoughtId)
      .maybeSingle<ThoughtRecord>()

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read thought')
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Thought not found')
    return toThought(data)
  }

  async touch(userId: string, thoughtId: string, activityAt: string) {
    const { error } = await this.client
      .from('thoughts')
      .update({ last_activity_at: activityAt })
      .eq('user_id', userId)
      .eq('id', thoughtId)
      .lt('last_activity_at', activityAt)

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to update thought activity')
  }

  async listRecent(userId: string, cursor?: { lastActivityAt: string; id: string }) {
    let query = this.client
      .from('thoughts')
      .select('*, entries!inner(id)')
      .eq('user_id', userId)
      .order('last_activity_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(21)

    if (cursor) {
      query = query.or(
        `last_activity_at.lt.${cursor.lastActivityAt},and(last_activity_at.eq.${cursor.lastActivityAt},id.lt.${cursor.id})`,
      )
    }

    const result = await query
    if (result.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list thoughts')

    const rows = (result.data ?? []) as unknown as Array<ThoughtRecord & { entries: { id: string }[] }>
    const hasMore = rows.length > 20
    const page = rows.slice(0, 20)
    const thoughtIds = page.map((row) => row.id)
    let entryRows: EntryRecord[] = []

    if (thoughtIds.length) {
      const entriesResult = await this.client
        .from('entries')
        .select('*')
        .eq('user_id', userId)
        .in('thought_id', thoughtIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .returns<EntryRecord[]>()

      if (entriesResult.error) {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read thought entries')
      }
      entryRows = entriesResult.data
    }

    const firstEntries = new Map<string, Entry>()
    for (const entry of entryRows) {
      if (!firstEntries.has(entry.thought_id)) firstEntries.set(entry.thought_id, toEntry(entry))
    }

    return {
      thoughts: page.map((row) => ({
        ...toThought(row),
        firstEntry: firstEntries.get(row.id) ?? null,
      })),
      nextCursor: hasMore && page.length ? encodeThoughtCursor(page.at(-1)!) : null,
    }
  }

  async getDetail(userId: string, thoughtId: string) {
    const thought = await this.getOwned(userId, thoughtId)
    const entries = await new EntryRepository(this.client).listByThought(userId, thoughtId)
    const connectionsResult = await this.client
      .from('thought_connections')
      .select('*')
      .eq('user_id', userId)
      .or(`source_thought_id.eq.${thoughtId},target_thought_id.eq.${thoughtId}`)
      .order('created_at', { ascending: false })
      .returns<ConnectionRecord[]>()

    if (connectionsResult.error) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read thought connections')
    }

    const entryIds = connectionsResult.data.flatMap((connection) => [
      connection.source_entry_id,
      connection.target_entry_id,
    ])
    const anchorEntries = new Map<string, Entry>()
    if (entryIds.length) {
      const anchorsResult = await this.client
        .from('entries')
        .select('*')
        .eq('user_id', userId)
        .in('id', entryIds)
        .returns<EntryRecord[]>()

      if (anchorsResult.error) {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read connection entries')
      }
      for (const row of anchorsResult.data) anchorEntries.set(row.id, toEntry(row))
    }

    return {
      thought,
      entries,
      connections: connectionsResult.data.map((connection) => ({
        id: connection.id,
        sourceThoughtId: connection.source_thought_id,
        targetThoughtId: connection.target_thought_id,
        sourceEntry: anchorEntries.get(connection.source_entry_id) ?? null,
        targetEntry: anchorEntries.get(connection.target_entry_id) ?? null,
        rationale: connection.rationale,
        status: connection.status,
        decidedAt: connection.decided_at,
        createdAt: connection.created_at,
      })),
    }
  }
}

export function encodeThoughtCursor(thought: Pick<ThoughtRecord, 'last_activity_at' | 'id'>) {
  return Buffer.from(
    JSON.stringify({ lastActivityAt: thought.last_activity_at, id: thought.id }),
  ).toString('base64url')
}

export function decodeThoughtCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { lastActivityAt?: unknown }).lastActivityAt === 'string' &&
      typeof (parsed as { id?: unknown }).id === 'string' &&
      !Number.isNaN(Date.parse((parsed as { lastActivityAt: string }).lastActivityAt)) &&
      UUID_PATTERN.test((parsed as { id: string }).id)
    ) {
      return parsed as { lastActivityAt: string; id: string }
    }
  } catch {}

  throw new ApiError(400, 'INVALID_INPUT', 'Invalid cursor')
}
