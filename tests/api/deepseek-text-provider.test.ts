import { describe, expect, it, vi } from 'vitest'
import { DeepSeekTextProvider } from '@/src/server/ai/deepseek-text-provider'

function response(content: string, ok = true) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: ok ? 200 : 429,
    headers: { 'content-type': 'application/json' },
  })
}

describe('DeepSeekTextProvider', () => {
  it('returns a validated clarification question', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response('{"question":"你最想保留哪一部分？"}'))
    const provider = new DeepSeekTextProvider('test-key', fetchMock)

    await expect(provider.clarify('一个还没成形的念头')).resolves.toBe('你最想保留哪一部分？')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: false,
      response_format: { type: 'json_object' },
    })
  })

  it('accepts no reconnect candidate and validates candidate ids', async () => {
    const candidates = [{ id: 'candidate-1', content: '旧想法', clarificationAnswer: null }]
    const empty = new DeepSeekTextProvider(
      'test-key',
      vi.fn<typeof fetch>().mockResolvedValue(response('{"targetFragmentId":null,"rationale":null}')),
    )
    await expect(empty.reconnect({ id: 'current', content: '新想法' }, candidates)).resolves.toEqual({
      targetFragmentId: null,
      rationale: null,
    })

    const invalid = new DeepSeekTextProvider(
      'test-key',
      vi.fn<typeof fetch>().mockResolvedValue(
        response('{"targetFragmentId":"outside","rationale":"有关"}'),
      ),
    )
    await expect(invalid.reconnect({ id: 'current', content: '新想法' }, candidates)).rejects.toMatchObject({
      status: 503,
      code: 'AI_UNAVAILABLE',
      retryable: true,
    })
  })

  it.each([
    vi.fn<typeof fetch>().mockResolvedValue(response('', true)),
    vi.fn<typeof fetch>().mockResolvedValue(response('{}', false)),
    vi.fn<typeof fetch>().mockRejectedValue(new Error('network')),
  ])('maps empty, HTTP and network failures to retryable 503', async (fetchMock) => {
    const provider = new DeepSeekTextProvider('test-key', fetchMock)
    await expect(provider.clarify('原文')).rejects.toMatchObject({
      status: 503,
      code: 'AI_UNAVAILABLE',
      retryable: true,
    })
  })

  it('streams Chinese deltas across byte boundaries and ignores keep-alive events', async () => {
    const bytes = new TextEncoder().encode(
      ': keep-alive\n\ndata: {"choices":[{"delta":{"content":"继续"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"往前"}}]}\n\ndata: [DONE]\n\n',
    )
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 47))
        controller.enqueue(bytes.slice(47, 53))
        controller.enqueue(bytes.slice(53))
        controller.close()
      },
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 }))
    const provider = new DeepSeekTextProvider('test-key', fetchMock)
    const chunks: string[] = []

    for await (const chunk of provider.streamText('advance', [
      { entryType: 'user', content: '一个念头', sourceLabel: null },
      { entryType: 'ai', content: '模型以前编造的细节', sourceLabel: null },
      { entryType: 'import', content: '导入的事实', sourceLabel: 'notes.md' },
    ])) chunks.push(chunk)

    expect(chunks).toEqual(['继续', '往前'])
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(requestBody).toMatchObject({
      model: 'deepseek-v4-flash',
      stream: true,
      thinking: { type: 'disabled' },
    })
    expect(requestBody.messages[0].content).toContain('用户输入和导入内容是唯一事实来源')
    expect(requestBody.messages[1].content).not.toContain('模型以前编造的细节')
    expect(requestBody.messages[1].content).toContain('导入的事实')
  })

  it('rejects a stream that ends without the completion marker', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"choices":[{"delta":{"content":"半段"}}]}\n\n'),
        )
        controller.close()
      },
    })
    const provider = new DeepSeekTextProvider(
      'test-key',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 })),
    )

    await expect(async () => {
      for await (const chunk of provider.streamText('question', [])) expect(chunk).toBe('半段')
    }).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', retryable: true })
  })

  it('accepts only a supplied thought and supplied anchor entries for a connection', async () => {
    const current = { id: 'current', entries: [{ id: 'current-entry', content: '当前内容' }] }
    const candidates = [
      { id: 'candidate', entries: [{ id: 'candidate-entry', content: '候选内容' }] },
    ]
    const valid = new DeepSeekTextProvider(
      'test-key',
      vi.fn<typeof fetch>().mockResolvedValue(
        response(
          '{"targetThoughtId":"candidate","sourceEntryId":"current-entry","targetEntryId":"candidate-entry","rationale":"共同关注同一问题"}',
        ),
      ),
    )
    await expect(valid.findConnection(current, candidates)).resolves.toEqual({
      targetThoughtId: 'candidate',
      sourceEntryId: 'current-entry',
      targetEntryId: 'candidate-entry',
      rationale: '共同关注同一问题',
    })

    const invalid = new DeepSeekTextProvider(
      'test-key',
      vi.fn<typeof fetch>().mockResolvedValue(
        response(
          '{"targetThoughtId":"outside","sourceEntryId":"current-entry","targetEntryId":"outside-entry","rationale":"有关"}',
        ),
      ),
    )
    await expect(invalid.findConnection(current, candidates)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    })
  })
})
