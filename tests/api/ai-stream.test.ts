import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getOwned: vi.fn(),
  listEntries: vi.fn(),
  touch: vi.fn(),
  findByRequest: vi.fn(),
  createEntry: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock('@/src/lib/auth/require-user', () => ({
  requireMutationUser: mocks.requireUser,
  requireUser: mocks.requireUser,
}))
vi.mock('@/src/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/src/server/repositories/thought-repository', () => ({
  ThoughtRepository: class {
    getOwned = mocks.getOwned
    touch = mocks.touch
  },
}))
vi.mock('@/src/server/repositories/entry-repository', () => ({
  EntryRepository: class {
    listByThought = mocks.listEntries
    findByClientRequest = mocks.findByRequest
    createIdempotent = mocks.createEntry
  },
}))
vi.mock('@/src/server/ai/deepseek-text-provider', () => ({
  DeepSeekTextProvider: class {
    streamText = mocks.streamText
  },
}))

import { POST } from '@/app/api/thoughts/[id]/ai/route'

const thoughtId = '018f6f3a-a1c2-47a8-8f1e-100000000001'
const requestId = '018f6f3a-a1c2-47a8-8f1e-100000000002'
const entry = {
  id: requestId,
  thoughtId,
  clientRequestId: requestId,
  entryType: 'ai',
  content: '先回想一下，那种剥离感第一次出现时，你正在做什么？',
  sourceLabel: null,
  aiAction: 'advance',
  createdAt: '2026-08-20T10:00:00.000Z',
}

function request(action = 'advance') {
  return new NextRequest(`http://localhost/api/thoughts/${thoughtId}/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientRequestId: requestId, action }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireUser.mockResolvedValue({ id: 'owner' })
  mocks.getOwned.mockResolvedValue({ id: thoughtId })
  mocks.listEntries.mockResolvedValue([
    { entryType: 'user', content: '原文', sourceLabel: null },
  ])
  mocks.findByRequest.mockResolvedValue(null)
  mocks.touch.mockResolvedValue(undefined)
  mocks.createEntry.mockResolvedValue({ entry, created: true })
  mocks.streamText.mockImplementation(async function* () {
    yield '先回想一下，那种剥离感第一次出现时，'
    yield '你正在做什么？'
  })
})

describe('thought AI stream route', () => {
  it('rejects an invalid path id before reading thought data', async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: 'not-a-uuid' }) })

    expect(response.status).toBe(400)
    expect(mocks.getOwned).not.toHaveBeenCalled()
    expect(mocks.listEntries).not.toHaveBeenCalled()
    expect(mocks.streamText).not.toHaveBeenCalled()
  })

  it('starts independent checks together before opening the model stream', async () => {
    let releaseEntries: ((entries: Array<{ entryType: string; content: string; sourceLabel: null }>) => void) | undefined
    mocks.listEntries.mockReturnValue(new Promise((resolve) => {
      releaseEntries = resolve
    }))

    const responsePromise = POST(request(), { params: Promise.resolve({ id: thoughtId }) })

    await vi.waitFor(() => {
      expect(mocks.getOwned).toHaveBeenCalled()
      expect(mocks.listEntries).toHaveBeenCalled()
      expect(mocks.findByRequest).toHaveBeenCalled()
    })
    releaseEntries?.([{ entryType: 'user', content: '原文', sourceLabel: null }])
    const response = await responsePromise
    await response.text()
  })

  it('forwards ordered deltas and saves the complete output once', async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: thoughtId }) })
    const stream = await response.text()

    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(stream.indexOf('event: start')).toBeLessThan(stream.indexOf('event: delta'))
    expect(stream.lastIndexOf('event: delta')).toBeLessThan(stream.indexOf('event: saved'))
    expect(mocks.createEntry).toHaveBeenCalledTimes(1)
    expect(mocks.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '先回想一下，那种剥离感第一次出现时，你正在做什么？',
        entryType: 'ai',
        aiAction: 'advance',
      }),
    )
  })

  it('removes the legacy instruction-like prefix before saving', async () => {
    mocks.streamText.mockImplementation(async function* () {
      yield '可以继续写：'
      yield '当时最先出现的念头是什么？'
    })

    const response = await POST(request(), { params: Promise.resolve({ id: thoughtId }) })
    await response.text()

    expect(mocks.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ content: '当时最先出现的念头是什么？' }),
    )
  })

  it('does not persist a partial result when the provider disconnects', async () => {
    mocks.streamText.mockImplementation(async function* () {
      yield '半段'
      throw new Error('disconnected')
    })

    const response = await POST(request('question'), { params: Promise.resolve({ id: thoughtId }) })
    const stream = await response.text()

    expect(stream).toContain('event: delta')
    expect(stream).toContain('event: error')
    expect(stream).not.toContain('event: saved')
    expect(mocks.createEntry).not.toHaveBeenCalled()
  })

  it('does not save a repeated statement as a question', async () => {
    mocks.streamText.mockImplementation(async function* () {
      yield '原文'
    })

    const response = await POST(request('question'), { params: Promise.resolve({ id: thoughtId }) })
    const stream = await response.text()

    expect(stream).toContain('event: error')
    expect(stream).not.toContain('event: saved')
    expect(mocks.createEntry).not.toHaveBeenCalled()
  })

  it('returns an existing saved entry without invoking the model again', async () => {
    mocks.findByRequest.mockResolvedValue(entry)

    const response = await POST(request(), { params: Promise.resolve({ id: thoughtId }) })
    const stream = await response.text()

    expect(stream).toContain('event: saved')
    expect(mocks.streamText).not.toHaveBeenCalled()
    expect(mocks.createEntry).not.toHaveBeenCalled()
  })

  it('requires new user or imported content after the last AI result', async () => {
    mocks.listEntries.mockResolvedValue([
      { entryType: 'user', content: '原文', sourceLabel: null },
      { entryType: 'ai', content: '上一次推进', sourceLabel: null },
    ])

    const response = await POST(request(), { params: Promise.resolve({ id: thoughtId }) })

    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatchObject({
      code: 'AI_NEEDS_INPUT',
      message: '先写下新的内容，再继续',
    })
    expect(mocks.streamText).not.toHaveBeenCalled()
  })

  it('rejects oversized context before opening a stream', async () => {
    mocks.listEntries.mockResolvedValue([
      { entryType: 'user', content: 'x'.repeat(500_001), sourceLabel: null },
    ])

    const response = await POST(request(), { params: Promise.resolve({ id: thoughtId }) })

    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe('CONTEXT_TOO_LARGE')
    expect(mocks.streamText).not.toHaveBeenCalled()
  })
})
