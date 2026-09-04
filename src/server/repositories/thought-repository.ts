import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'
import { EntryRepository, type Entry } from './entry-repository'
import { CheckpointRepository } from './checkpoint-repository'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LIST_RECENT_RETRY_DELAY_MS = 120

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

export type ThoughtAction =
  | { action: 'move'; collectionId: string | null }
  | { action: 'archive' | 'unarchive' }

export type ReviewCandidate = {
  id: string
  summary: string
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
      .rpc('retniw_ensure_thought', {
        target_user_id: userId,
        target_thought_id: thoughtId,
      })
    const result = data as { thought?: ThoughtRecord; created?: boolean } | null

    if (error?.code === 'P0001' && error.message?.startsWith('RETNIW_THOUGHT_DELETED')) {
      throw new ApiError(409, 'THOUGHT_DELETED', 'Thought was deleted')
    }
    if (error || !result?.thought || typeof result.created !== 'boolean') {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to create thought')
    }
    return { thought: toThought(result.thought), created: result.created }
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
      .is('deleted_at', null)
      .is('summary_content', null)

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to update thought summary')
  }

  async listRecent(
    userId: string,
    cursor?: { lastActivityAt: string; id: string },
    options: { scope?: 'active' | 'archived'; collectionId?: string } = {},
  ) {
    const scope = options.scope ?? 'active'
    const readPage = async () => {
      let query = this.client
        .from('thoughts')
        .select('*')
        .eq('user_id', userId)
        .order('last_activity_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(21)

      if (scope === 'active') {
        query = query.is('deleted_at', null).is('archived_at', null)
      } else {
        query = query.is('deleted_at', null).not('archived_at', 'is', null)
      }
      if (options.collectionId) query = query.eq('collection_id', options.collectionId)

      if (cursor) {
        query = query.or(
          `last_activity_at.lt.${cursor.lastActivityAt},and(last_activity_at.eq.${cursor.lastActivityAt},id.lt.${cursor.id})`,
        )
      }

      return await query
    }

    let result = await readPage()
    if (result.error) {
      await new Promise((resolve) => setTimeout(resolve, LIST_RECENT_RETRY_DELAY_MS))
      result = await readPage()
    }
    if (result.error) {
      console.error('Unable to list thoughts', {
        code: result.error.code,
        status: result.status,
      })
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list thoughts')
    }

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

  async listReviewCandidates(
    userId: string,
    currentThoughtId: string,
    excludedThoughtIds: ReadonlySet<string> = new Set(),
  ): Promise<ReviewCandidate[]> {
    return this.readReviewCorpus(userId, currentThoughtId, excludedThoughtIds)
  }

  async listReviewCorpus(userId: string): Promise<ReviewCandidate[]> {
    return this.readReviewCorpus(userId, null, new Set())
  }

  private async readReviewCorpus(
    userId: string,
    currentThoughtId: string | null,
    excludedThoughtIds: ReadonlySet<string>,
  ): Promise<ReviewCandidate[]> {
    const excludedIds = Array.from(excludedThoughtIds).filter((id) => UUID_PATTERN.test(id))
    let query = this.client
      .from('thoughts')
      .select('id, summary_content')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .in('summary_entry_type', ['user', 'import'])
      .not('summary_content', 'is', null)
      .order('last_activity_at', { ascending: false })
      .order('id', { ascending: false })

    if (currentThoughtId) query = query.neq('id', currentThoughtId)
    if (excludedIds.length) query.not('id', 'in', `(${excludedIds.join(',')})`)

    const { data, error } = await query.limit(20).returns<Array<{
      id: string
      summary_content: string | null
    }>>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list review candidates')

    return data.flatMap((row) => row.summary_content
      ? [{ id: row.id, summary: row.summary_content.slice(0, 500) }]
      : [])
  }

  async getDetail(userId: string, thoughtId: string) {
    const [thought, entries, checkpoints] = await Promise.all([
      this.getOwned(userId, thoughtId),
      new EntryRepository(this.client).listByThought(userId, thoughtId),
      new CheckpointRepository(this.client).listByThought(userId, thoughtId),
    ])

    return {
      thought,
      entries,
      checkpoints,
    }
  }

  async updateAction(
    userId: string,
    thoughtId: string,
    action: ThoughtAction,
  ) {
    const current = await this.getOwned(userId, thoughtId)

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

    if (thoughtActionSatisfied(current, action)) return current

    const now = new Date().toISOString()
    const values = action.action === 'move'
      ? { collection_id: action.collectionId }
      : action.action === 'archive'
        ? { archived_at: now }
        : { archived_at: null }

    let query = this.client
      .from('thoughts')
      .update(values)
      .eq('user_id', userId)
      .eq('id', thoughtId)
    if (action.action === 'move') {
      query = query.is('deleted_at', null)
      query = current.collectionId === null
        ? query.is('collection_id', null)
        : query.eq('collection_id', current.collectionId)
    } else if (action.action === 'archive') {
      query = query.is('deleted_at', null).is('archived_at', null)
    } else if (action.action === 'unarchive') {
      query = query.is('deleted_at', null).eq('archived_at', current.archivedAt!)
    }
    const { data, error } = await query.select('*').maybeSingle<ThoughtRecord>()
    if (error?.code === '23503') {
      throw new ApiError(409, 'STATE_CONFLICT', 'Thought state changed')
    }
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to update thought')
    if (!data) {
      const latest = await this.getOwned(userId, thoughtId)
      if (thoughtActionSatisfied(latest, action)) return latest
      throw new ApiError(409, 'STATE_CONFLICT', 'Thought state changed')
    }
    return toThought(data)
  }

  async deleteOwned(userId: string, thoughtId: string) {
    const { data, error } = await this.client
      .rpc('retniw_delete_thought', {
        target_user_id: userId,
        target_thought_id: thoughtId,
      })

    if (error?.code === '23503') {
      throw new ApiError(409, 'STATE_CONFLICT', 'Thought cannot be deleted')
    }
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to delete thought')
    if (data !== true) throw new ApiError(404, 'NOT_FOUND', 'Thought not found')
  }
}

function thoughtActionSatisfied(thought: Thought, action: ThoughtAction) {
  if (action.action === 'move') return thought.collectionId === action.collectionId
  if (action.action === 'archive') return thought.archivedAt !== null
  return thought.archivedAt === null
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
