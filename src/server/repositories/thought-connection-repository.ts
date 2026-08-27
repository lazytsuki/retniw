import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'
import type { EntryRecord } from './entry-repository'
import { toEntry } from './entry-repository'

export type ThoughtConnectionStatus = 'pending' | 'confirmed' | 'rejected'
export type ThoughtConnectionDecision = 'confirmed' | 'rejected'

export type ThoughtConnectionRecord = {
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

export type ReviewConnectionStatus = 'pending' | 'confirmed'

export type ReviewConnection = {
  id: string
  status: ReviewConnectionStatus
  source: { thoughtId: string; entryId: string; excerpt: string }
  target: { thoughtId: string; entryId: string; excerpt: string }
  rationale: string
  decidedAt: string | null
  createdAt: string
}

type ReviewAnchorRecord = Pick<EntryRecord, 'id' | 'thought_id' | 'entry_type' | 'content' | 'created_at'>

type ReviewConnectionQueryRecord = ThoughtConnectionRecord & {
  source_thought: { id: string } | Array<{ id: string }>
  target_thought: { id: string } | Array<{ id: string }>
  source_entry: ReviewAnchorRecord | ReviewAnchorRecord[]
  target_entry: ReviewAnchorRecord | ReviewAnchorRecord[]
}

type ExistingPairRecord = Pick<
  ThoughtConnectionRecord,
  'source_thought_id' | 'target_thought_id' | 'status' | 'decided_at'
>

type CandidateAnchorRecord = Pick<EntryRecord, 'id' | 'thought_id' | 'entry_type' | 'created_at'>

export type ReviewContentAnchor = {
  thoughtId: string
  createdAt: string
}

const REVIEW_CONNECTION_SELECT = [
  'id',
  'user_id',
  'source_thought_id',
  'target_thought_id',
  'source_entry_id',
  'target_entry_id',
  'rationale',
  'status',
  'decided_at',
  'created_at',
  'source_thought:thoughts!thought_connections_source_thought_owner_fk!inner(id)',
  'target_thought:thoughts!thought_connections_target_thought_owner_fk!inner(id)',
  'source_entry:entries!thought_connections_source_entry_owner_fk!inner(id,thought_id,entry_type,content,created_at)',
  'target_entry:entries!thought_connections_target_entry_owner_fk!inner(id,thought_id,entry_type,content,created_at)',
].join(',')

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUnwritableThoughtError(error: { code?: string; message?: string } | null) {
  return error?.code === 'P0001' && error.message?.startsWith('RETNIW_THOUGHT_')
}

function wasUpdatedAfterDecision(decidedAt: string | null, createdAt: string | undefined) {
  if (!decidedAt || !createdAt) return false
  const decisionTime = Date.parse(decidedAt)
  const contentTime = Date.parse(createdAt)
  return Number.isFinite(decisionTime) && Number.isFinite(contentTime) && contentTime > decisionTime
}

function normalizedRationale(value: string) {
  return value.trim().replace(/\s+/g, ' ')
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

  async listBlockedTargets(userId: string, thoughtId: string, sourceEntryCreatedAt: string) {
    const { data, error } = await this.client
      .from('thought_connections')
      .select('source_thought_id, target_thought_id, status, decided_at')
      .eq('user_id', userId)
      .or(`source_thought_id.eq.${thoughtId},target_thought_id.eq.${thoughtId}`)
      .returns<ExistingPairRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read existing connections')

    return new Set(data.flatMap((record) => (
      record.status === 'rejected' && wasUpdatedAfterDecision(record.decided_at, sourceEntryCreatedAt)
        ? []
        : [record.source_thought_id === thoughtId
            ? record.target_thought_id
            : record.source_thought_id]
    )))
  }

  async listBlockedPairs(userId: string, anchors: readonly ReviewContentAnchor[]) {
    const latestByThought = new Map<string, string>()
    for (const anchor of anchors) {
      if (!UUID_PATTERN.test(anchor.thoughtId) || !Number.isFinite(Date.parse(anchor.createdAt))) continue
      const existing = latestByThought.get(anchor.thoughtId)
      if (!existing || anchor.createdAt > existing) latestByThought.set(anchor.thoughtId, anchor.createdAt)
    }
    const candidateIds = Array.from(latestByThought.keys())
    if (candidateIds.length < 2) return []

    const { data, error } = await this.client
      .from('thought_connections')
      .select('source_thought_id, target_thought_id, status, decided_at')
      .eq('user_id', userId)
      .in('source_thought_id', candidateIds)
      .in('target_thought_id', candidateIds)
      .returns<ExistingPairRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read existing connection pairs')

    return data.flatMap((record) => {
      const hasNewContent = record.status === 'rejected' && (
        wasUpdatedAfterDecision(record.decided_at, latestByThought.get(record.source_thought_id)) ||
        wasUpdatedAfterDecision(record.decided_at, latestByThought.get(record.target_thought_id))
      )
      return hasNewContent ? [] : [{
        sourceThoughtId: record.source_thought_id,
        targetThoughtId: record.target_thought_id,
      }]
    })
  }

  private async anchorsAllowResurface(
    userId: string,
    row: Pick<ThoughtConnectionRecord, 'source_thought_id' | 'target_thought_id' | 'source_entry_id' | 'target_entry_id'>,
    decidedAt: string | null,
  ) {
    if (!decidedAt) return false
    const { data, error } = await this.client
      .from('entries')
      .select('id, thought_id, entry_type, created_at')
      .eq('user_id', userId)
      .in('id', [row.source_entry_id, row.target_entry_id])
      .in('entry_type', ['user', 'import'])
      .returns<CandidateAnchorRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read connection anchors')

    const entries = new Map(data.map((entry) => [entry.id, entry]))
    const source = entries.get(row.source_entry_id)
    const target = entries.get(row.target_entry_id)
    if (
      source?.thought_id !== row.source_thought_id ||
      target?.thought_id !== row.target_thought_id
    ) return false

    return wasUpdatedAfterDecision(decidedAt, source.created_at) ||
      wasUpdatedAfterDecision(decidedAt, target.created_at)
  }

  private async reuseExistingCandidate(
    userId: string,
    existing: ThoughtConnectionRecord,
    row: Pick<
      ThoughtConnectionRecord,
      'source_thought_id' | 'target_thought_id' | 'source_entry_id' | 'target_entry_id' | 'rationale'
    >,
  ) {
    const [active] = await this.withActiveThoughts(userId, [existing])
    if (!active) throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
    if (active.status !== 'rejected') {
      return {
        connection: active.status === 'pending' ? await this.toView(userId, active) : null,
        created: false,
      }
    }
    if (!await this.anchorsAllowResurface(userId, row, active.decided_at)) {
      return { connection: null, created: false }
    }
    if (normalizedRationale(row.rationale) === normalizedRationale(active.rationale)) {
      return { connection: null, created: false }
    }

    const updated = await this.client
      .from('thought_connections')
      .update({
        source_entry_id: row.source_entry_id,
        target_entry_id: row.target_entry_id,
        rationale: row.rationale,
        status: 'pending',
        decided_at: null,
        created_at: new Date().toISOString(),
      })
      .eq('id', active.id)
      .eq('user_id', userId)
      .eq('status', 'rejected')
      .eq('decided_at', active.decided_at!)
      .select('*')
      .maybeSingle<ThoughtConnectionRecord>()
    if (isUnwritableThoughtError(updated.error)) {
      throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
    }
    if (updated.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to save thought connection')
    if (updated.data) {
      return { connection: await this.toView(userId, updated.data), created: true }
    }

    const raced = await this.readPair(userId, row.source_thought_id, row.target_thought_id)
    if (!raced) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read thought connection')
    const [activeRaced] = await this.withActiveThoughts(userId, [raced])
    if (!activeRaced) throw new ApiError(409, 'STATE_CONFLICT', 'Thought is no longer writable')
    return {
      connection: activeRaced.status === 'pending' ? await this.toView(userId, activeRaced) : null,
      created: false,
    }
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
      return this.reuseExistingCandidate(input.userId, existing, row)
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
    return this.reuseExistingCandidate(input.userId, raced, row)
  }

  async listForReview(
    userId: string,
    status: ReviewConnectionStatus,
    cursor?: { createdAt: string; id: string },
  ) {
    let query = this.client
      .from('thought_connections')
      .select(REVIEW_CONNECTION_SELECT)
      .eq('user_id', userId)
      .eq('status', status)
      .is('source_thought.deleted_at', null)
      .is('target_thought.deleted_at', null)
      .in('source_entry.entry_type', ['user', 'import'])
      .in('target_entry.entry_type', ['user', 'import'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(21)

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      )
    }

    const { data, error } = await query.returns<ReviewConnectionQueryRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list review connections')

    const hasMore = data.length > 20
    const page = data.slice(0, 20)
    const connections = page.map((record): ReviewConnection => {
      const storedSource = unwrapRelation(record.source_entry)
      const storedTarget = unwrapRelation(record.target_entry)

      const sourceIsNewer = storedSource.created_at > storedTarget.created_at || (
        storedSource.created_at === storedTarget.created_at && storedSource.id > storedTarget.id
      )
      const newer = sourceIsNewer ? storedSource : storedTarget
      const older = sourceIsNewer ? storedTarget : storedSource
      return {
        id: record.id,
        status,
        source: {
          thoughtId: newer.thought_id,
          entryId: newer.id,
          excerpt: newer.content.slice(0, 1000),
        },
        target: {
          thoughtId: older.thought_id,
          entryId: older.id,
          excerpt: older.content.slice(0, 1000),
        },
        rationale: record.rationale,
        decidedAt: record.decided_at,
        createdAt: record.created_at,
      }
    })

    return {
      connections,
      nextCursor: hasMore && page.length ? encodeReviewCursor(page.at(-1)!) : null,
    }
  }

  async countForReview(userId: string, status: ReviewConnectionStatus) {
    const { count, error } = await this.client
      .from('thought_connections')
      .select(REVIEW_CONNECTION_SELECT, { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', status)
      .is('source_thought.deleted_at', null)
      .is('target_thought.deleted_at', null)
      .in('source_entry.entry_type', ['user', 'import'])
      .in('target_entry.entry_type', ['user', 'import'])
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to count review connections')
    return count ?? 0
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

function unwrapRelation<T>(relation: T | T[]) {
  const value = Array.isArray(relation) ? relation[0] : relation
  if (!value) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read review relation')
  return value
}

export function encodeReviewCursor(
  connection: Pick<ThoughtConnectionRecord, 'created_at' | 'id'>,
) {
  return Buffer.from(JSON.stringify({
    createdAt: connection.created_at,
    id: connection.id,
  })).toString('base64url')
}

export function decodeReviewCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { createdAt?: unknown }).createdAt === 'string' &&
      !Number.isNaN(Date.parse((parsed as { createdAt: string }).createdAt)) &&
      typeof (parsed as { id?: unknown }).id === 'string' &&
      UUID_PATTERN.test((parsed as { id: string }).id)
    ) {
      return parsed as { createdAt: string; id: string }
    }
  } catch {}

  throw new ApiError(400, 'INVALID_INPUT', 'Invalid review cursor')
}
