import { describe, expect, it } from 'vitest'
import { ApiError } from '@/src/lib/api-error'
import { parseThoughtEntryInput, parseThoughtInput } from '@/src/server/thoughts/parse-thought-input'
import { decodeThoughtCursor, encodeThoughtCursor } from '@/src/server/repositories/thought-repository'
// @ts-expect-error The migration is a directly executable Node module.
import { buildMigrationPlan } from '@/scripts/migrate-fragments-to-thoughts.mjs'

const ids = {
  thought: '018f6f3a-a1c2-47a8-8f1e-100000000001',
  entry: '018f6f3a-a1c2-47a8-8f1e-100000000002',
  request: '018f6f3a-a1c2-47a8-8f1e-100000000003',
  user: '018f6f3a-a1c2-47a8-8f1e-100000000004',
  clarification: '018f6f3a-a1c2-47a8-8f1e-100000000005',
  connection: '018f6f3a-a1c2-47a8-8f1e-100000000006',
  otherThought: '018f6f3a-a1c2-47a8-8f1e-100000000007',
  otherRequest: '018f6f3a-a1c2-47a8-8f1e-100000000008',
}

const entryInput = {
  entryId: ids.entry,
  clientRequestId: ids.request,
  content: '先留下，再继续。',
  entryType: 'user' as const,
  sourceLabel: null,
}

describe('thought input contract', () => {
  it('accepts a new thought without changing its content', () => {
    expect(parseThoughtInput({ thoughtId: ids.thought, ...entryInput })).toEqual({
      thoughtId: ids.thought,
      ...entryInput,
    })
  })

  it('accepts an imported entry with a source label', () => {
    expect(
      parseThoughtEntryInput({
        ...entryInput,
        entryType: 'import',
        content: '外部上下文\n保持换行',
        sourceLabel: 'context.md',
      }),
    ).toEqual({
      ...entryInput,
      entryType: 'import',
      content: '外部上下文\n保持换行',
      sourceLabel: 'context.md',
    })
  })

  it.each([
    null,
    { thoughtId: 'invalid', ...entryInput },
    { thoughtId: ids.thought, ...entryInput, entryId: 'invalid' },
    { thoughtId: ids.thought, ...entryInput, content: '  ' },
    { thoughtId: ids.thought, ...entryInput, content: 'x'.repeat(10_001) },
    { thoughtId: ids.thought, ...entryInput, entryType: 'ai' },
    { thoughtId: ids.thought, ...entryInput, sourceLabel: 'x'.repeat(256) },
  ])('rejects invalid new-thought input', (input) => {
    expect(() => parseThoughtInput(input)).toThrowError(
      expect.objectContaining<Partial<ApiError>>({ status: 400, code: 'INVALID_INPUT' }),
    )
  })
})

describe('thought list cursor', () => {
  it('round-trips the activity order', () => {
    const cursor = { last_activity_at: '2026-08-19T10:00:00.000Z', id: ids.thought }
    expect(decodeThoughtCursor(encodeThoughtCursor(cursor))).toEqual({
      lastActivityAt: cursor.last_activity_at,
      id: ids.thought,
    })
  })

  it('rejects malformed cursors', () => {
    expect(() => decodeThoughtCursor('broken')).toThrowError(
      expect.objectContaining<Partial<ApiError>>({ status: 400, code: 'INVALID_INPUT' }),
    )
  })
})

describe('legacy migration plan', () => {
  const source = {
    fragments: [
      {
        id: ids.thought,
        user_id: ids.user,
        client_request_id: ids.request,
        content: '原始碎片',
        reconnect_checked_at: '2026-08-19T10:03:00.000Z',
        created_at: '2026-08-19T10:00:00.000Z',
      },
      {
        id: ids.otherThought,
        user_id: ids.user,
        client_request_id: ids.otherRequest,
        content: '另一条碎片',
        reconnect_checked_at: null,
        created_at: '2026-08-19T09:00:00.000Z',
      },
    ],
    clarifications: [
      {
        id: ids.clarification,
        user_id: ids.user,
        fragment_id: ids.thought,
        question: '你最想保留什么？',
        answer: '最初的方向感',
        answered_at: '2026-08-19T10:02:00.000Z',
        created_at: '2026-08-19T10:01:00.000Z',
      },
    ],
    connections: [
      {
        id: ids.connection,
        user_id: ids.user,
        source_fragment_id: ids.thought,
        target_fragment_id: ids.otherThought,
        rationale: '共同追问同一件事',
        status: 'confirmed',
        decided_at: '2026-08-19T10:04:00.000Z',
        created_at: '2026-08-19T10:03:30.000Z',
      },
    ],
  }

  it('preserves content, order, status and stable anchors', () => {
    const plan = buildMigrationPlan(source)
    expect(plan.thoughts).toHaveLength(2)
    expect(plan.entries.map((entry: { content: string }) => entry.content)).toEqual([
      '原始碎片',
      '你最想保留什么？',
      '最初的方向感',
      '另一条碎片',
    ])
    expect(plan.entries.map((entry: { entry_type: string }) => entry.entry_type)).toEqual([
      'user',
      'ai',
      'user',
      'user',
    ])
    expect(plan.thoughts[0]).toEqual(
      expect.objectContaining({
        id: ids.thought,
        last_activity_at: '2026-08-19T10:02:00.000Z',
        relation_checked_at: '2026-08-19T10:03:00.000Z',
      }),
    )
    expect(plan.connections[0]).toEqual(
      expect.objectContaining({
        id: ids.connection,
        source_entry_id: ids.request,
        target_entry_id: ids.otherRequest,
        status: 'confirmed',
      }),
    )
  })

  it('produces the same identifiers when rebuilt', () => {
    expect(buildMigrationPlan(source)).toEqual(buildMigrationPlan(source))
  })
})
