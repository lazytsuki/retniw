import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'

type QueryResult = {
  data: unknown[] | null
  error: { code: string } | null
  status: number
}

function clientWithResults(results: QueryResult[]) {
  const traces: string[][] = []
  let resultIndex = 0
  const client = {
    from(table: string) {
      const trace = [`from:${table}`]
      traces.push(trace)
      const query = {
        select(value: string) { trace.push(`select:${value}`); return query },
        eq(column: string, value: unknown) { trace.push(`eq:${column}:${String(value)}`); return query },
        order(column: string, options: unknown) {
          trace.push(`order:${column}:${JSON.stringify(options)}`)
          return query
        },
        limit(value: number) { trace.push(`limit:${value}`); return query },
        is(column: string, value: unknown) { trace.push(`is:${column}:${String(value)}`); return query },
        not(column: string, operator: string, value: unknown) {
          trace.push(`not:${column}:${operator}:${String(value)}`)
          return query
        },
        or(value: string) { trace.push(`or:${value}`); return query },
        then<TResult1 = QueryResult, TResult2 = never>(
          onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          const result = results[Math.min(resultIndex, results.length - 1)]
          resultIndex += 1
          return Promise.resolve(result).then(onfulfilled, onrejected)
        },
      }
      return query
    },
  } as unknown as SupabaseClient

  return { client, traces }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ThoughtRepository.listRecent transient read recovery', () => {
  it('rebuilds the same bounded query once after a failed read', async () => {
    vi.useFakeTimers()
    const fixture = clientWithResults([
      { data: null, error: { code: 'PGRST000' }, status: 503 },
      { data: [], error: null, status: 200 },
    ])
    const pending = new ThoughtRepository(fixture.client).listRecent('user-id')

    await vi.advanceTimersByTimeAsync(1000)

    await expect(pending).resolves.toEqual({ thoughts: [], nextCursor: null })
    expect(fixture.traces).toHaveLength(2)
    expect(fixture.traces[1]).toEqual(fixture.traces[0])
  })

  it('still reports a real failure after the one safe retry', async () => {
    vi.useFakeTimers()
    const fixture = clientWithResults([
      { data: null, error: { code: 'PGRST000' }, status: 503 },
      { data: null, error: { code: '57014' }, status: 500 },
    ])
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const pending = new ThoughtRepository(fixture.client).listRecent('user-id')
    const rejection = expect(pending).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    })

    await vi.advanceTimersByTimeAsync(1000)

    await rejection
    expect(errorLog).toHaveBeenCalledWith('Unable to list thoughts', {
      code: '57014',
      status: 500,
    })
    expect(fixture.traces).toHaveLength(2)
  })
})
