import { readFile } from 'node:fs/promises'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CheckpointRepository } from '@/src/server/repositories/checkpoint-repository'
import { EntryRepository } from '@/src/server/repositories/entry-repository'
import { ThoughtConnectionRepository } from '@/src/server/repositories/thought-connection-repository'
import { ThoughtRepository, type ThoughtRecord } from '@/src/server/repositories/thought-repository'

type StoredRow = Record<string, unknown>
type Filter = (row: StoredRow) => boolean

function columnValue(row: StoredRow, column: string) {
  return column.split('.').reduce<unknown>((value, part) => (
    value && typeof value === 'object' ? (value as StoredRow)[part] : undefined
  ), row)
}

class MemoryQuery {
  private filters: Filter[] = []
  private values: StoredRow | null = null
  private deleting = false
  private rowLimit: number | null = null

  constructor(
    private readonly table: string,
    private readonly tables: Record<string, StoredRow[]>,
    private readonly takeBeforeThoughtUpdate: () => (() => void) | null,
  ) {}

  select() {
    return this
  }

  update(values: StoredRow) {
    this.values = values
    return this
  }

  delete() {
    this.deleting = true
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value)
    return this
  }

  lt(column: string, value: string) {
    this.filters.push((row) => typeof row[column] === 'string' && row[column] < value)
    return this
  }

  is(column: string, value: unknown) {
    this.filters.push((row) => columnValue(row, column) === value)
    return this
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(columnValue(row, column)))
    return this
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === 'is') this.filters.push((row) => row[column] !== value)
    if (operator === 'in' && typeof value === 'string') {
      const values = value.slice(1, -1).split(',')
      this.filters.push((row) => !values.includes(String(row[column])))
    }
    return this
  }

  or(expression: string) {
    const match = expression.match(/^source_thought_id\.eq\.([^,]+),target_thought_id\.eq\.(.+)$/)
    if (match) {
      this.filters.push(
        (row) => row.source_thought_id === match[1] || row.target_thought_id === match[2],
      )
    }
    return this
  }

  order() {
    return this
  }

  limit(value: number) {
    this.rowLimit = value
    return this
  }

  async maybeSingle<T>() {
    const rows = this.execute()
    return { data: (rows[0] as T | undefined) ?? null, error: null }
  }

  async returns<T>() {
    return { data: this.execute() as T, error: null }
  }

  private execute() {
    if (this.values && this.table === 'thoughts') this.takeBeforeThoughtUpdate()?.()
    const tableRows = this.tables[this.table] ?? []
    let rows = tableRows.filter(
      (row) => this.filters.every((filter) => filter(row)),
    )
    if (this.rowLimit !== null) rows = rows.slice(0, this.rowLimit)
    if (this.values) {
      for (const row of rows) Object.assign(row, this.values)
    }
    const result = rows.map((row) => ({ ...row }))
    if (this.deleting) {
      const deleted = new Set(rows)
      this.tables[this.table] = tableRows.filter((row) => !deleted.has(row))
    }
    return result
  }
}

function memoryClient(input: {
  thoughts: ThoughtRecord[]
  collections?: StoredRow[]
  entries?: StoredRow[]
  checkpoints?: StoredRow[]
  connections?: StoredRow[]
}) {
  const tables: Record<string, StoredRow[]> = {
    thoughts: input.thoughts as unknown as StoredRow[],
    thought_collections: input.collections ?? [],
    entries: input.entries ?? [],
    thought_checkpoints: input.checkpoints ?? [],
    thought_connections: input.connections ?? [],
  }
  let beforeThoughtUpdate: (() => void) | null = null
  const client = {
    from(table: string) {
      return new MemoryQuery(table, tables, () => {
        const callback = beforeThoughtUpdate
        beforeThoughtUpdate = null
        return callback
      })
    },
  } as unknown as SupabaseClient

  return {
    client,
    tables,
    beforeNextThoughtUpdate(callback: () => void) {
      beforeThoughtUpdate = callback
    },
  }
}

const ids = {
  user: '018f6f3a-a1c2-47a8-8f1e-900000000001',
  thought: '018f6f3a-a1c2-47a8-8f1e-900000000002',
  otherThought: '018f6f3a-a1c2-47a8-8f1e-900000000003',
  collection: '018f6f3a-a1c2-47a8-8f1e-900000000004',
  otherCollection: '018f6f3a-a1c2-47a8-8f1e-900000000005',
  entry: '018f6f3a-a1c2-47a8-8f1e-900000000006',
  otherEntry: '018f6f3a-a1c2-47a8-8f1e-900000000007',
  aiEntry: '018f6f3a-a1c2-47a8-8f1e-900000000009',
}

function thought(overrides: Partial<ThoughtRecord> = {}): ThoughtRecord {
  return {
    id: ids.thought,
    user_id: ids.user,
    collection_id: null,
    archived_at: null,
    deleted_at: null,
    summary_content: '第一段',
    summary_entry_type: 'user',
    summary_source_label: null,
    last_activity_at: '2026-08-22T00:00:00.000Z',
    relation_checked_at: null,
    created_at: '2026-08-22T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('thought lifecycle actions', () => {
  it('applies move and archive actions idempotently without replacing state timestamps', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T01:00:00.000Z'))
    const memory = memoryClient({
      thoughts: [thought()],
      collections: [{ id: ids.collection, user_id: ids.user }],
    })
    const repository = new ThoughtRepository(memory.client)

    await expect(repository.updateAction(ids.user, ids.thought, {
      action: 'move',
      collectionId: ids.collection,
    })).resolves.toMatchObject({ collectionId: ids.collection })
    await repository.updateAction(ids.user, ids.thought, {
      action: 'move',
      collectionId: ids.collection,
    })

    const archived = await repository.updateAction(ids.user, ids.thought, { action: 'archive' })
    vi.advanceTimersByTime(60_000)
    const archivedRetry = await repository.updateAction(ids.user, ids.thought, { action: 'archive' })
    expect(archivedRetry.archivedAt).toBe(archived.archivedAt)

    await expect(repository.updateAction(ids.user, ids.thought, { action: 'unarchive' }))
      .resolves.toMatchObject({ archivedAt: null })
    await repository.updateAction(ids.user, ids.thought, { action: 'unarchive' })
  })

  it('returns 409 when a conditional update loses to a different state change', async () => {
    const memory = memoryClient({
      thoughts: [thought()],
      collections: [{ id: ids.collection, user_id: ids.user }],
    })
    memory.beforeNextThoughtUpdate(() => {
      memory.tables.thoughts[0].collection_id = ids.otherCollection
    })

    await expect(new ThoughtRepository(memory.client).updateAction(ids.user, ids.thought, {
      action: 'move',
      collectionId: ids.collection,
    })).rejects.toMatchObject({ status: 409, code: 'STATE_CONFLICT' })
  })

  it('treats a deleted thought as missing for management actions', async () => {
    const memory = memoryClient({
      thoughts: [thought({ deleted_at: '2026-08-22T01:00:00.000Z' })],
    })

    await expect(new ThoughtRepository(memory.client).updateAction(
      ids.user,
      ids.thought,
      { action: 'archive' },
    )).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('physically deletes exactly one owned active thought', async () => {
    const memory = memoryClient({
      thoughts: [
        thought(),
        thought({ id: ids.otherThought, deleted_at: '2026-08-22T01:00:00.000Z' }),
      ],
    })
    const repository = new ThoughtRepository(memory.client)

    await expect(repository.deleteOwned(ids.user, ids.thought)).resolves.toBeUndefined()
    expect(memory.tables.thoughts).toHaveLength(1)
    await expect(repository.deleteOwned(ids.user, ids.thought))
      .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    await expect(repository.deleteOwned(ids.user, ids.otherThought))
      .rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
})

describe('deleted thought guards', () => {
  it('maps database child-write guards to a state conflict', async () => {
    const error = { code: 'P0001', message: 'RETNIW_THOUGHT_DELETED' }
    const client = {
      from() {
        return {
          insert() {
            return { select: () => ({ single: async () => ({ data: null, error }) }) }
          },
        }
      },
    } as unknown as SupabaseClient

    await expect(new EntryRepository(client).createIdempotent({
      id: ids.entry,
      userId: ids.user,
      thoughtId: ids.thought,
      clientRequestId: ids.entry,
      entryType: 'user',
      content: '不会写入',
    })).rejects.toMatchObject({ status: 409, code: 'STATE_CONFLICT' })

    await expect(new CheckpointRepository(client).createIdempotent({
      id: ids.entry,
      userId: ids.user,
      thoughtId: ids.thought,
      clientRequestId: ids.entry,
      note: '',
    })).rejects.toMatchObject({ status: 409, code: 'STATE_CONFLICT' })
  })

  it('maps the database connection guard to a state conflict', async () => {
    class ConnectionGuardQuery {
      private inserting = false

      select() { return this }
      eq() { return this }
      insert() { this.inserting = true; return this }
      async maybeSingle<T>() { return { data: null as T | null, error: null } }
      async single<T>() {
        return this.inserting
          ? {
              data: null as T | null,
              error: { code: 'P0001', message: 'RETNIW_THOUGHT_DELETED' },
            }
          : { data: null as T | null, error: null }
      }
    }
    const client = {
      from() { return new ConnectionGuardQuery() },
    } as unknown as SupabaseClient

    await expect(new ThoughtConnectionRepository(client).createCandidate({
      userId: ids.user,
      currentThoughtId: ids.thought,
      targetThoughtId: ids.otherThought,
      currentEntryId: ids.entry,
      targetEntryId: ids.otherEntry,
      rationale: '不会写入',
    })).rejects.toMatchObject({ status: 409, code: 'STATE_CONFLICT' })
  })

  it('omits connection work when reading thought detail', async () => {
    const connection = {
      id: 'connection-1',
      user_id: ids.user,
      source_thought_id: ids.thought,
      target_thought_id: ids.otherThought,
      source_entry_id: ids.entry,
      target_entry_id: ids.otherEntry,
      rationale: '旧联系',
      status: 'pending',
      decided_at: null,
      created_at: '2026-08-22T00:10:00.000Z',
    }
    const memory = memoryClient({
      thoughts: [
        thought(),
        thought({ id: ids.otherThought, deleted_at: '2026-08-22T00:20:00.000Z' }),
      ],
      connections: [connection],
    })

    const detail = await new ThoughtRepository(memory.client).getDetail(ids.user, ids.thought)
    expect(detail).not.toHaveProperty('connections')
  })

  it('claims each user entry independently, once, in any callback order and never claims AI', async () => {
    const entryRow = (input: { id: string; type: 'user' | 'import' | 'ai'; createdAt: string }) => ({
      id: input.id,
      user_id: ids.user,
      thought_id: ids.thought,
      client_request_id: input.id,
      entry_type: input.type,
      content: input.id,
      source_label: null,
      ai_action: null,
      review_checked_at: null,
      created_at: input.createdAt,
    })
    const memory = memoryClient({
      thoughts: [thought()],
      entries: [
        entryRow({ id: ids.entry, type: 'user', createdAt: '2026-08-22T01:00:00.000Z' }),
        entryRow({ id: ids.otherEntry, type: 'import', createdAt: '2026-08-22T02:00:00.000Z' }),
        entryRow({ id: ids.aiEntry, type: 'ai', createdAt: '2026-08-22T03:00:00.000Z' }),
      ],
    })
    const repository = new EntryRepository(memory.client)

    const newer = await repository.claimForReview(ids.user, ids.thought, ids.otherEntry)
    const older = await repository.claimForReview(ids.user, ids.thought, ids.entry)
    expect(newer?.id).toBe(ids.otherEntry)
    expect(older?.id).toBe(ids.entry)
    await expect(repository.claimForReview(ids.user, ids.thought, ids.otherEntry))
      .resolves.toBeNull()
    await expect(repository.claimForReview(ids.user, ids.thought, ids.entry))
      .resolves.toBeNull()
    await expect(repository.claimForReview(ids.user, ids.thought, ids.aiEntry))
      .resolves.toBeNull()
  })

  it('does not decide a connection after either thought was deleted', async () => {
    const connection = {
      id: 'connection-1',
      user_id: ids.user,
      source_thought_id: ids.thought,
      target_thought_id: ids.otherThought,
      source_entry_id: ids.entry,
      target_entry_id: ids.otherEntry,
      rationale: '旧联系',
      status: 'pending',
      decided_at: null,
      created_at: '2026-08-22T00:10:00.000Z',
    }
    const memory = memoryClient({
      thoughts: [
        thought(),
        thought({ id: ids.otherThought, deleted_at: '2026-08-22T00:20:00.000Z' }),
      ],
      connections: [connection],
    })

    await expect(new ThoughtConnectionRepository(memory.client).decide(
      ids.user,
      connection.id,
      'confirmed',
    )).rejects.toMatchObject({ status: 409, code: 'STATE_CONFLICT' })
  })

  it('maps a thought-deletion race during connection decision to a state conflict', async () => {
    const connection = {
      id: 'connection-1',
      user_id: ids.user,
      source_thought_id: ids.thought,
      target_thought_id: ids.otherThought,
      source_entry_id: ids.entry,
      target_entry_id: ids.otherEntry,
      rationale: '旧联系',
      status: 'pending',
      decided_at: null,
      created_at: '2026-08-22T00:10:00.000Z',
    }

    class DecisionConnectionQuery {
      private updating = false

      select() { return this }
      eq() { return this }
      update() { this.updating = true; return this }
      async maybeSingle<T>() {
        return this.updating
          ? {
              data: null as T | null,
              error: { code: 'P0001', message: 'RETNIW_THOUGHT_DELETED' },
            }
          : { data: connection as T, error: null }
      }
    }

    class ActiveThoughtQuery {
      select() { return this }
      eq() { return this }
      in() { return this }
      is() { return this }
      async returns<T>() {
        return {
          data: [{ id: ids.thought }, { id: ids.otherThought }] as unknown as T,
          error: null,
        }
      }
    }

    const client = {
      from(table: string) {
        return table === 'thought_connections'
          ? new DecisionConnectionQuery()
          : new ActiveThoughtQuery()
      },
    } as unknown as SupabaseClient

    await expect(new ThoughtConnectionRepository(client).decide(
      ids.user,
      connection.id,
      'confirmed',
    )).rejects.toMatchObject({ status: 409, code: 'STATE_CONFLICT' })
  })
})

describe('global review connection view', () => {
  it('labels the newer anchor as source without changing the normalized stored pair', async () => {
    const connectionId = '018f6f3a-a1c2-47a8-8f1e-900000000008'
    const memory = memoryClient({
      thoughts: [thought(), thought({ id: ids.otherThought })],
      entries: [
        {
          id: ids.entry,
          user_id: ids.user,
          thought_id: ids.thought,
          client_request_id: ids.entry,
          entry_type: 'user',
          content: '以前写的',
          source_label: null,
          ai_action: null,
          created_at: '2026-08-22T01:00:00.000Z',
        },
        {
          id: ids.otherEntry,
          user_id: ids.user,
          thought_id: ids.otherThought,
          client_request_id: ids.otherEntry,
          entry_type: 'import',
          content: '这次写的',
          source_label: 'notes.md',
          ai_action: null,
          created_at: '2026-08-22T02:00:00.000Z',
        },
      ],
      connections: [{
        id: connectionId,
        user_id: ids.user,
        source_thought_id: ids.thought,
        target_thought_id: ids.otherThought,
        source_entry_id: ids.entry,
        target_entry_id: ids.otherEntry,
        rationale: '前后都在想同一件事',
        status: 'pending',
        decided_at: null,
        created_at: '2026-08-22T02:01:00.000Z',
        source_thought: { id: ids.thought, deleted_at: null },
        target_thought: { id: ids.otherThought, deleted_at: null },
        source_entry: {
          id: ids.entry,
          thought_id: ids.thought,
          entry_type: 'user',
          content: '以前写的',
          created_at: '2026-08-22T01:00:00.000Z',
        },
        target_entry: {
          id: ids.otherEntry,
          thought_id: ids.otherThought,
          entry_type: 'import',
          content: '这次写的',
          created_at: '2026-08-22T02:00:00.000Z',
        },
      }],
    })

    const result = await new ThoughtConnectionRepository(memory.client)
      .listForReview(ids.user, 'pending')

    expect(result.connections).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({
          thoughtId: ids.otherThought,
          entryId: ids.otherEntry,
          excerpt: '这次写的',
        }),
        target: expect.objectContaining({
          thoughtId: ids.thought,
          entryId: ids.entry,
          excerpt: '以前写的',
        }),
      }),
    ])
    expect(memory.tables.thought_connections[0]).toMatchObject({
      source_thought_id: ids.thought,
      target_thought_id: ids.otherThought,
    })
  })
})

describe('lifecycle migration', () => {
  it('installs row-lock guards and an owner-safe collection foreign key', async () => {
    const sql = await readFile(
      'supabase/migrations/20260822120000_lifecycle_consistency_guards.sql',
      'utf8',
    )

    expect(sql).toContain('for update')
    expect(sql).toContain('entries_lock_writable_thought')
    expect(sql).toContain('checkpoints_lock_writable_thought')
    expect(sql).toContain('connections_lock_writable_thoughts')
    expect(sql).toMatch(
      /create trigger connections_lock_writable_thoughts\s+before insert or update\s+on public\.thought_connections/,
    )
    expect(sql).not.toContain(
      'before insert or update of user_id, source_thought_id, target_thought_id',
    )
    expect(sql).toContain('foreign key (user_id, collection_id)')
    expect(sql).toContain('on delete set null (collection_id)')
  })

  it('installs default-off private review preferences owned by auth users', async () => {
    const sql = await readFile(
      'supabase/migrations/20260824090000_user_review_preferences.sql',
      'utf8',
    )

    expect(sql).toMatch(/user_id uuid primary key references auth\.users \(id\) on delete cascade/)
    expect(sql).toContain('enabled boolean not null default false')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('revoke all on public.user_review_preferences from anon, authenticated')
    expect(sql).toContain(
      'grant select, insert, update, delete on public.user_review_preferences to service_role',
    )
  })

  it('adds a nullable per-entry review claim marker without changing the prior migration', async () => {
    const sql = await readFile(
      'supabase/migrations/20260824150000_entry_review_claim.sql',
      'utf8',
    )

    expect(sql).toMatch(/alter table public\.entries/)
    expect(sql).toMatch(/add column if not exists review_checked_at timestamptz null/)
    expect(sql).not.toContain('not null')
  })
})
