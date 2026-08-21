import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'
import { EntryRepository, type Entry, type EntryRecord, toEntry } from './entry-repository'
import { CheckpointRepository } from './checkpoint-repository'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ThoughtRecord = {
  id: string
  user_id: string
  collection_id: string | null
  archived_at: string | null
  deleted_at: string | null
  summary_content: string | null
  summary_entry_type: 'user' | 'import' | 'ai' | null
  summary_source_label: string | null
  last_activity_at: string
  relation_checked_at: string | null
  created_at: string
}

export type Thought = {
  id: string
  collectionId: string | null
  archivedAt: string | null
  deletedAt: string | null
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
    collectionId: row.collection_id ?? null,
    archivedAt: row.archived_at ?? null,
    deletedAt: row.deleted_at ?? null,
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
      .is('deleted_at', null)
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
      .is('deleted_at', null)
      .lt('last_activity_at', activityAt)

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to update thought activity')
  }

  async setSummaryIfEmpty(userId: string, thoughtId: string, entry: Entry) {
    if (entry.entryType === 'ai') return
    const content = entry.content.trim().slice(0, 500)
    if (!content) return
    const { error } = await this.client
      .from('thoughts')
      .update({
        summary_content: content,
        summary_entry_type: entry.entryType,
        summary_source_label: entry.sourceLabel,
      })
      .eq('user_id', userId)
      .eq('id', thoughtId)
      .is('summary_content', null)

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to update thought summary')
  }

  async listRecent(
    userId: string,
    cursor?: { lastActivityAt: string; id: string },
    options: { scope?: 'active' | 'archived' | 'deleted'; collectionId?: string } = {},
  ) {
    const scope = options.scope ?? 'active'
    let query = this.client
      .from('thoughts')
      .select('*')
      .eq('user_id', userId)
      .order('last_activity_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(21)

    if (scope === 'active') {
      query = query.is('deleted_at', null).is('archived_at', null)
    } else if (scope === 'archived') {
      query = query.is('deleted_at', null).not('archived_at', 'is', null)
    } else {
      query = query.not('deleted_at', 'is', null)
    }
    if (options.collectionId) query = query.eq('collection_id', options.collectionId)

    if (cursor) {
      query = query.or(
        `last_activity_at.lt.${cursor.lastActivityAt},and(last_activity_at.eq.${cursor.lastActivityAt},id.lt.${cursor.id})`,
      )
    }

    const result = await query
    if (result.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list thoughts')

    const rows = (result.data ?? []) as unknown as ThoughtRecord[]
    const hasMore = rows.length > 20
    const page = rows.slice(0, 20)

    return {
      thoughts: page.map((row) => ({
        ...toThought(row),
        firstEntry: row.summary_content && row.summary_entry_type
          ? {
              id: row.id,
              thoughtId: row.id,
              clientRequestId: row.id,
              entryType: row.summary_entry_type,
              content: row.summary_content,
              sourceLabel: row.summary_source_label,
              aiAction: null,
              createdAt: row.created_at,
            } satisfies Entry
          : null,
      })),
      nextCursor: hasMore && page.length ? encodeThoughtCursor(page.at(-1)!) : null,
    }
  }

  async getDetail(userId: string, thoughtId: string) {
    const connectionsQuery = this.client
      .from('thought_connections')
      .select('*')
      .eq('user_id', userId)
      .or(`source_thought_id.eq.${thoughtId},target_thought_id.eq.${thoughtId}`)
      .order('created_at', { ascending: false })
      .returns<ConnectionRecord[]>()

    const [thought, entries, checkpoints, connectionsResult] = await Promise.all([
      this.getOwned(userId, thoughtId),
      new EntryRepository(this.client).listByThought(userId, thoughtId),
      new CheckpointRepository(this.client).listByThought(userId, thoughtId),
      connectionsQuery,
    ])

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
      checkpoints,
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

  async updateAction(
    userId: string,
    thoughtId: string,
    action:
      | { action: 'move'; collectionId: string | null }
      | { action: 'archive' | 'unarchive' | 'delete' | 'restore' },
  ) {
    if (action.action === 'move' && action.collectionId) {
      const collection = await this.client
        .from('thought_collections')
        .select('id')
        .eq('user_id', userId)
        .eq('id', action.collectionId)
        .maybeSingle<{ id: string }>()
      if (collection.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read collection')
      if (!collection.data) throw new ApiError(404, 'NOT_FOUND', 'Collection not found')
    }

    const now = new Date().toISOString()
    const values = action.action === 'move'
      ? { collection_id: action.collectionId }
      : action.action === 'archive'
        ? { archived_at: now }
        : action.action === 'unarchive'
          ? { archived_at: null }
          : action.action === 'delete'
            ? { deleted_at: now }
            : { deleted_at: null }

    let query = this.client
      .from('thoughts')
      .update(values)
      .eq('user_id', userId)
      .eq('id', thoughtId)
    if (action.action !== 'restore') query = query.is('deleted_at', null)
    const { data, error } = await query.select('*').maybeSingle<ThoughtRecord>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to update thought')
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Thought not found')
    return toThought(data)
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
