import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  flushThoughtOutboxItems,
  sendThoughtOutboxItem,
} from '@/src/hooks/use-capture-outbox'
import type { ThoughtOutboxItem } from '@/src/lib/capture/capture-store'

const thoughtId = '018f6f3a-a1c2-47a8-8f1e-100000000001'

function item(index: number, overrides: Partial<ThoughtOutboxItem> = {}): ThoughtOutboxItem {
  return {
    thoughtId,
    entryId: `018f6f3a-a1c2-47a8-8f1e-10000000000${index}`,
    clientRequestId: `018f6f3a-a1c2-47a8-8f1e-20000000000${index}`,
    content: `第${index}段`,
    entryType: 'user',
    sourceLabel: null,
    createsThought: index === 1,
    state: 'pending',
    createdAt: `2026-08-20T10:00:0${index}.000Z`,
    updatedAt: `2026-08-20T10:00:0${index}.000Z`,
    ...overrides,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('thought outbox', () => {
  it('sends pending entries in local creation order and removes only successful items', async () => {
    const calls: string[] = []
    const remove = vi.fn(async (entryId: string) => { calls.push(`remove:${entryId}`) })
    const send = vi.fn(async (entry: ThoughtOutboxItem) => { calls.push(`send:${entry.entryId}`) })

    const result = await flushThoughtOutboxItems(
      [item(3), item(1), item(2), item(4, { state: 'draft' })],
      { send, remove, markFailed: vi.fn() },
    )

    expect(result.failedEntryId).toBeNull()
    expect(calls).toEqual([
      `send:${item(1).entryId}`,
      `remove:${item(1).entryId}`,
      `send:${item(2).entryId}`,
      `remove:${item(2).entryId}`,
      `send:${item(3).entryId}`,
      `remove:${item(3).entryId}`,
    ])
  })

  it('keeps the failed entry and does not skip ahead', async () => {
    const send = vi.fn(async (entry: ThoughtOutboxItem) => {
      if (entry.entryId === item(2).entryId) throw new Error('offline')
    })
    const remove = vi.fn(async () => undefined)
    const markFailed = vi.fn(async () => undefined)

    const result = await flushThoughtOutboxItems([item(1), item(2), item(3)], {
      send,
      remove,
      markFailed,
    })

    expect(result.failedEntryId).toBe(item(2).entryId)
    expect(send).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(markFailed).toHaveBeenCalledWith(expect.objectContaining({ entryId: item(2).entryId }))
  })

  it('uses the create endpoint once and the append endpoint afterwards', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendThoughtOutboxItem(item(1))
    await sendThoughtOutboxItem(item(2))

    expect(fetchMock.mock.calls[0][0]).toBe('/api/thoughts')
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/thoughts/${thoughtId}/entries`)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).not.toHaveProperty('thoughtId')
  })
})
