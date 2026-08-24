import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { ThoughtExportRepository } from '@/src/server/repositories/thought-export-repository'

type QueryResult = { data: never[]; error: null }

class RecordingQuery {
  selected = ''
  readonly equalFilters: Array<[string, unknown]> = []
  readonly isFilters: Array<[string, unknown]> = []

  constructor(readonly table: string) {}

  select(columns: string) {
    this.selected = columns
    return this
  }

  eq(column: string, value: unknown) {
    this.equalFilters.push([column, value])
    return this
  }

  is(column: string, value: unknown) {
    this.isFilters.push([column, value])
    return this
  }

  order() {
    return this
  }

  range() {
    return this
  }

  returns() {
    return this
  }

  then(
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) {
    return Promise.resolve({ data: [], error: null } satisfies QueryResult).then(onFulfilled, onRejected)
  }
}

class RecordingClient {
  readonly queries: RecordingQuery[] = []

  from(table: string) {
    const query = new RecordingQuery(table)
    this.queries.push(query)
    return query
  }
}

function setup() {
  const client = new RecordingClient()
  const repository = new ThoughtExportRepository(client as unknown as SupabaseClient)
  return { client, repository }
}

describe('ThoughtExportRepository soft-delete boundary', () => {
  it('filters soft-deleted thoughts before paging', async () => {
    const { client, repository } = setup()

    await repository.listThoughtPage('user-1', 0)

    expect(client.queries[0].table).toBe('thoughts')
    expect(client.queries[0].isFilters).toContainEqual(['deleted_at', null])
  })

  it('joins the owning thought before paging entries and checkpoints', async () => {
    const { client, repository } = setup()

    await repository.listEntryPage('user-1', 0)
    await repository.listThoughtEntryPage('user-1', 'thought-1', 0)
    await repository.listCheckpointPage('user-1', 0)
    await repository.listThoughtCheckpointPage('user-1', 'thought-1', 0)

    for (const query of client.queries.slice(0, 2)) {
      expect(query.selected).toContain('thoughts!entries_thought_owner_fk!inner(id)')
      expect(query.isFilters).toContainEqual(['thought.deleted_at', null])
    }
    for (const query of client.queries.slice(2)) {
      expect(query.selected).toContain('thoughts!thought_checkpoints_thought_owner_fk!inner(id)')
      expect(query.isFilters).toContainEqual(['thought.deleted_at', null])
    }
  })

  it('requires both ends of an exported connection to remain visible', async () => {
    const { client, repository } = setup()

    await repository.listConfirmedConnectionPage('user-1', 0)

    const query = client.queries[0]
    expect(query.selected).toContain('thoughts!thought_connections_source_thought_owner_fk!inner(id)')
    expect(query.selected).toContain('thoughts!thought_connections_target_thought_owner_fk!inner(id)')
    expect(query.isFilters).toContainEqual(['source_thought.deleted_at', null])
    expect(query.isFilters).toContainEqual(['target_thought.deleted_at', null])
  })
})
