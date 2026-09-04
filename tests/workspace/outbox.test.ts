import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  flushThoughtOutboxItems,
  sendThoughtOutboxItem,
} from '@/src/hooks/use-capture-outbox'
import type { ThoughtOutboxItem } from '@/src/lib/capture/capture-store'

const thoughtId = '018f6f3a-a1c2-47a8-8f1e-100000000001'
const userId = '018f6f3a-a1c2-47a8-8f1e-100000000099'

function item(index: number, overrides: Partial<ThoughtOutboxItem> = {}): ThoughtOutboxItem {
  return {
    userId,
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

  it('treats the earliest failed entry as a barrier for later pending entries', async () => {
    const send = vi.fn(async () => undefined)
    const remove = vi.fn(async () => undefined)
    const markFailed = vi.fn(async () => undefined)

    const result = await flushThoughtOutboxItems(
      [item(3), item(1), item(2, { state: 'failed' })],
      { send, remove, markFailed },
    )

    expect(result.failedEntryId).toBe(item(2).entryId)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ entryId: item(1).entryId }))
    expect(remove).toHaveBeenCalledWith(item(1).entryId)
    expect(markFailed).not.toHaveBeenCalled()
  })

  it('continues syncing an independent thought after another thought fails', async () => {
    const independentThoughtId = '018f6f3a-a1c2-47a8-8f1e-300000000001'
    const send = vi.fn(async (entry: ThoughtOutboxItem) => {
      if (entry.entryId === item(1).entryId) throw new Error('offline')
    })
    const remove = vi.fn(async () => undefined)

    const result = await flushThoughtOutboxItems([
      item(1),
      item(2),
      item(3, { thoughtId: independentThoughtId, createsThought: true }),
    ], { send, remove, markFailed: vi.fn(async () => undefined) })

    expect(result.failedEntryId).toBe(item(1).entryId)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ thoughtId: independentThoughtId }))
    expect(remove).toHaveBeenCalledWith(item(3).entryId)
  })

  it('keeps a follow-up flush request visible while an earlier drain is running', async () => {
    const source = await readFile('src/hooks/use-capture-outbox.ts', 'utf8')

    expect(source).toContain('const flushRequestedRef = useRef(false)')
    expect(source).toMatch(/const flush = useCallback\(\(\) => \{\s+flushRequestedRef\.current = true/)
    expect(source).toContain('while (flushRequestedRef.current)')
    expect(source).toMatch(/finally \{\s+flushRef\.current = null\s+setSyncing\(false\)/)
    expect(source).toContain("item.state === 'pending' && !failedThoughtIds.has(item.thoughtId)")
    expect(source).toContain('if (!ready || authContextChanged || !hasSendablePending) return')
    expect(source).toContain('const timer = window.setTimeout(() => void flush(), 0)')
  })

  it('persists deletion tombstones across tabs without waiting behind a network lock', async () => {
    const hook = await readFile('src/hooks/use-capture-outbox.ts', 'utf8')
    const store = await readFile('src/lib/capture/capture-store.ts', 'utf8')

    expect(store).toContain("thoughtOutboxDiscardStoragePrefix = 'retniw:thought-outbox-discarded'")
    expect(store).toContain('indexedDB.open(databaseName, 3)')
    expect(store).toContain("thoughtStore.createIndex('userId', 'userId')")
    expect(store).toContain('claimLegacyThoughtOutboxItems(userId: string)')
    expect(store).toContain('export function putThoughtOutboxDraft(item: ThoughtOutboxItem)')
    expect(store).toMatch(/existing\.userId !== item\.userId \|\|[\s\S]*existing\.state !== 'draft'/)
    expect(store).toContain('export function enqueueThoughtOutboxItem(item: ThoughtOutboxItem)')
    expect(store).toContain('export function deleteThoughtOutboxDraft(userId: string, entryId: string)')
    expect(store).toMatch(/deleteThoughtOutboxDraft[\s\S]*existing\.userId !== userId \|\| existing\.state !== 'draft'/)
    expect(hook).toContain('const queued = await enqueueThoughtOutboxItem(item)')
    expect(store).toContain('window.localStorage.setItem(')
    expect(store).toMatch(/export function discardThoughtOutboxItems\(userId: string, thoughtId: string\)[\s\S]*rememberDiscardedThought\(userId, thoughtId\)[\s\S]*return transact<void>/)
    expect(hook).toContain("window.addEventListener('storage', handleStorage)")
    expect(hook).toContain('isThoughtOutboxDiscarded(userId, thoughtId)')
    expect(hook).toContain('item.userId === userId')
    expect(hook).toContain('const timeout = setTimeout(() => controller.abort(), 20_000)')
    expect(store).toMatch(/transaction\.onabort = \(\) => \{[\s\S]*reject\(/)
    expect(store).toMatch(/transaction\.oncomplete = \(\) => \{[\s\S]*resolve\(result\)/)
  })

  it('keeps creation order after failed entries are prepared for retry', async () => {
    const calls: string[] = []
    const retriedAt = '2026-08-20T11:00:00.000Z'

    await flushThoughtOutboxItems(
      [
        item(3),
        item(2, { state: 'pending', updatedAt: retriedAt }),
        item(1, { state: 'pending', updatedAt: retriedAt }),
      ],
      {
        send: async (entry) => { calls.push(entry.entryId) },
        remove: async () => undefined,
        markFailed: async () => undefined,
      },
    )

    expect(calls).toEqual([item(1).entryId, item(2).entryId, item(3).entryId])
  })

  it('uses the create endpoint once and the append endpoint afterwards', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        entryId: string
        clientRequestId: string
        content: string
        entryType: 'user' | 'import'
        sourceLabel: string | null
      }
      return new Response(JSON.stringify({
        data: {
          entry: {
            id: body.entryId,
            thoughtId,
            clientRequestId: body.clientRequestId,
            content: body.content,
            entryType: body.entryType,
            sourceLabel: body.sourceLabel,
            aiAction: null,
            createdAt: '2026-08-20T10:00:00.000Z',
          },
        },
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await sendThoughtOutboxItem(item(1))
    await sendThoughtOutboxItem(item(2))

    expect(fetchMock.mock.calls[0][0]).toBe('/api/thoughts')
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/thoughts/${thoughtId}/entries`)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).not.toHaveProperty('thoughtId')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-retniw-expected-user-id')).toBe(userId)
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('stops an account-mismatched drain without removing or failing local content', async () => {
    const remove = vi.fn(async () => undefined)
    const markFailed = vi.fn(async () => undefined)
    const result = await flushThoughtOutboxItems([item(1), item(2)], {
      send: vi.fn(async () => { throw new Error('AUTH_CONTEXT_CHANGED') }),
      remove,
      markFailed,
    })

    expect(result).toEqual({ failedEntryId: null, authContextChanged: true })
    expect(remove).not.toHaveBeenCalled()
    expect(markFailed).not.toHaveBeenCalled()
  })

  it('keeps an account-mismatched outbox item instead of treating it as deleted', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'AUTH_CONTEXT_CHANGED' } }),
      { status: 409 },
    )))

    await expect(sendThoughtOutboxItem(item(2))).rejects.toThrow('AUTH_CONTEXT_CHANGED')
  })

  it('treats a missing existing thought as terminal without discarding a failed creation', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: { code: 'THOUGHT_DELETED' } }),
        { status: 409 },
      ))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendThoughtOutboxItem(item(2))).resolves.toMatchObject({ targetMissing: true })
    await expect(sendThoughtOutboxItem(item(1))).resolves.toMatchObject({ targetMissing: true })
    await expect(sendThoughtOutboxItem(item(1))).rejects.toThrow('SAVE_FAILED')
  })
})
