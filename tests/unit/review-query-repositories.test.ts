import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { ThoughtConnectionRepository } from '@/src/server/repositories/thought-connection-repository'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'

type Call = { method: string; args: unknown[] }

class CapturingQuery implements PromiseLike<unknown> {
  readonly calls: Call[] = []

  constructor(
    private readonly data: unknown,
    private readonly count: number | null = null,
  ) {}

  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args })
    return this
  }

  select(...args: unknown[]) { return this.record('select', args) }
  eq(...args: unknown[]) { return this.record('eq', args) }
  neq(...args: unknown[]) { return this.record('neq', args) }
  is(...args: unknown[]) { return this.record('is', args) }
  in(...args: unknown[]) { return this.record('in', args) }
  not(...args: unknown[]) { return this.record('not', args) }
  order(...args: unknown[]) { return this.record('order', args) }
  limit(...args: unknown[]) { return this.record('limit', args) }
  or(...args: unknown[]) { return this.record('or', args) }

  async returns<T>() {
    return { data: this.data as T, count: this.count, error: null }
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.data, count: this.count, error: null })
      .then(onfulfilled, onrejected)
  }
}

function clientFor(query: CapturingQuery, fromCalls: string[]) {
  return {
    from(table: string) {
      fromCalls.push(table)
      return query
    },
  } as unknown as SupabaseClient
}

const ids = {
  user: '018f6f3a-a1c2-47a8-8f1e-c00000000001',
  sourceThought: '018f6f3a-a1c2-47a8-8f1e-c00000000002',
  targetThought: '018f6f3a-a1c2-47a8-8f1e-c00000000003',
  sourceEntry: '018f6f3a-a1c2-47a8-8f1e-c00000000004',
  targetEntry: '018f6f3a-a1c2-47a8-8f1e-c00000000005',
  connection: '018f6f3a-a1c2-47a8-8f1e-c00000000006',
  excluded: '018f6f3a-a1c2-47a8-8f1e-c00000000007',
}

const embeddedConnection = {
  id: ids.connection,
  user_id: ids.user,
  source_thought_id: ids.sourceThought,
  target_thought_id: ids.targetThought,
  source_entry_id: ids.sourceEntry,
  target_entry_id: ids.targetEntry,
  rationale: '前后都在处理同一个问题',
  status: 'pending',
  decided_at: null,
  created_at: '2026-08-24T02:01:00.000Z',
  source_thought: { id: ids.sourceThought },
  target_thought: { id: ids.targetThought },
  source_entry: {
    id: ids.sourceEntry,
    thought_id: ids.sourceThought,
    entry_type: 'user',
    content: '以前写的',
    created_at: '2026-08-24T01:00:00.000Z',
  },
  target_entry: {
    id: ids.targetEntry,
    thought_id: ids.targetThought,
    entry_type: 'import',
    content: '这次写的',
    created_at: '2026-08-24T02:00:00.000Z',
  },
}

function expectVisibilityQuery(query: CapturingQuery) {
  const select = query.calls.find((call) => call.method === 'select')
  expect(select?.args[0]).toContain('thought_connections_source_thought_owner_fk!inner')
  expect(select?.args[0]).toContain('thought_connections_target_thought_owner_fk!inner')
  expect(select?.args[0]).toContain('thought_connections_source_entry_owner_fk!inner')
  expect(select?.args[0]).toContain('thought_connections_target_entry_owner_fk!inner')
  expect(query.calls).toContainEqual({ method: 'is', args: ['source_thought.deleted_at', null] })
  expect(query.calls).toContainEqual({ method: 'is', args: ['target_thought.deleted_at', null] })
  expect(query.calls).toContainEqual({
    method: 'in',
    args: ['source_entry.entry_type', ['user', 'import']],
  })
  expect(query.calls).toContainEqual({
    method: 'in',
    args: ['target_entry.entry_type', ['user', 'import']],
  })
}

describe('review visibility queries', () => {
  it('filters joined thoughts and anchors before the 20-item cursor page', async () => {
    const query = new CapturingQuery([embeddedConnection])
    const fromCalls: string[] = []
    const repository = new ThoughtConnectionRepository(clientFor(query, fromCalls))

    const result = await repository.listForReview(ids.user, 'pending', {
      createdAt: '2026-08-25T00:00:00.000Z',
      id: ids.connection,
    })

    expectVisibilityQuery(query)
    expect(query.calls).toContainEqual({ method: 'limit', args: [21] })
    const limitIndex = query.calls.findIndex((call) => call.method === 'limit')
    for (const method of ['is', 'in']) {
      expect(query.calls.findIndex((call) => call.method === method)).toBeLessThan(limitIndex)
    }
    expect(query.calls.some((call) => call.method === 'or')).toBe(true)
    expect(fromCalls).toEqual(['thought_connections'])
    expect(result.connections[0]).toMatchObject({
      source: { thoughtId: ids.targetThought, entryId: ids.targetEntry, excerpt: '这次写的' },
      target: { thoughtId: ids.sourceThought, entryId: ids.sourceEntry, excerpt: '以前写的' },
    })
  })

  it('uses the identical visibility joins for a head-only exact count', async () => {
    const query = new CapturingQuery(null, 7)
    const fromCalls: string[] = []
    const repository = new ThoughtConnectionRepository(clientFor(query, fromCalls))

    await expect(repository.countForReview(ids.user, 'pending')).resolves.toBe(7)

    expectVisibilityQuery(query)
    expect(query.calls.find((call) => call.method === 'select')?.args[1]).toEqual({
      count: 'exact',
      head: true,
    })
    expect(fromCalls).toEqual(['thought_connections'])
  })
})

describe('review candidate query', () => {
  it('pushes only validated UUID exclusions before the 20-row limit', async () => {
    const query = new CapturingQuery([{
      id: ids.targetThought,
      summary_content: '旧摘要',
    }])
    const repository = new ThoughtRepository(clientFor(query, []))

    await expect(repository.listReviewCandidates(
      ids.user,
      ids.sourceThought,
      new Set([ids.excluded, 'not-a-uuid),id.not.is.null']),
    )).resolves.toEqual([{ id: ids.targetThought, summary: '旧摘要' }])

    expect(query.calls).toContainEqual({
      method: 'not',
      args: ['id', 'in', `(${ids.excluded})`],
    })
    expect(query.calls).toContainEqual({ method: 'limit', args: [20] })
    expect(JSON.stringify(query.calls)).not.toContain('id.not.is.null')
  })

  it('does not add an empty or invalid exclusion filter', async () => {
    const query = new CapturingQuery([])
    const repository = new ThoughtRepository(clientFor(query, []))

    await repository.listReviewCandidates(
      ids.user,
      ids.sourceThought,
      new Set(['invalid']),
    )

    expect(query.calls.some((call) => call.method === 'not' && call.args[0] === 'id')).toBe(false)
    expect(query.calls).toContainEqual({ method: 'limit', args: [20] })
  })

  it('reads a bounded user-owned history corpus without excluding the current thought', async () => {
    const query = new CapturingQuery([{
      id: ids.sourceThought,
      summary_content: '最近写下的摘要',
    }])
    const repository = new ThoughtRepository(clientFor(query, []))

    await expect(repository.listReviewCorpus(ids.user)).resolves.toEqual([
      { id: ids.sourceThought, summary: '最近写下的摘要' },
    ])

    expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', ids.user] })
    expect(query.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] })
    expect(query.calls).toContainEqual({
      method: 'in',
      args: ['summary_entry_type', ['user', 'import']],
    })
    expect(query.calls).toContainEqual({ method: 'not', args: ['summary_content', 'is', null] })
    expect(query.calls).toContainEqual({ method: 'limit', args: [20] })
    expect(query.calls.some((call) => call.method === 'neq')).toBe(false)
    expect(query.calls.some((call) => call.method === 'not' && call.args[0] === 'id')).toBe(false)
  })
})

describe('existing review pairs query', () => {
  it('reads all statuses for one user so explicit scans cannot recreate decided pairs', async () => {
    const query = new CapturingQuery([{
      source_thought_id: ids.sourceThought,
      target_thought_id: ids.targetThought,
    }])
    const fromCalls: string[] = []
    const repository = new ThoughtConnectionRepository(clientFor(query, fromCalls))

    await expect(repository.listExistingPairs(ids.user)).resolves.toEqual([{
      sourceThoughtId: ids.sourceThought,
      targetThoughtId: ids.targetThought,
    }])

    expect(query.calls).toContainEqual({
      method: 'select',
      args: ['source_thought_id, target_thought_id'],
    })
    expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', ids.user] })
    expect(query.calls.some((call) => call.method === 'eq' && call.args[0] === 'status')).toBe(false)
    expect(fromCalls).toEqual(['thought_connections'])
  })
})
