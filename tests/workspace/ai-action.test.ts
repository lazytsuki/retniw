import { describe, expect, it } from 'vitest'
import { readAiEventStream, requestForAiAction } from '@/src/hooks/use-ai-action'

describe('AI action client stream', () => {
  it('reuses one id for an ambiguous retry and rotates it for a new operation', () => {
    const first = requestForAiAction(null, 'thought-a', 'advance', () => 'request-a')
    const retry = requestForAiAction(first, 'thought-a', 'advance', () => 'should-not-run')
    const otherAction = requestForAiAction(first, 'thought-a', 'organize', () => 'request-b')
    const otherThought = requestForAiAction(first, 'thought-b', 'advance', () => 'request-c')

    expect(retry).toBe(first)
    expect(otherAction.clientRequestId).toBe('request-b')
    expect(otherThought.clientRequestId).toBe('request-c')
  })

  it('delivers start, fragmented Chinese deltas and saved in order', async () => {
    const bytes = new TextEncoder().encode(
      'event: start\ndata: {"action":"advance"}\n\n' +
        'event: delta\ndata: {"content":"继续"}\n\n' +
        'event: delta\ndata: {"content":"往前"}\n\n' +
        'event: saved\ndata: {"entry":{"id":"saved"}}\n\n',
    )
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 61))
          controller.enqueue(bytes.slice(61, 67))
          controller.enqueue(bytes.slice(67))
          controller.close()
        },
      }),
    )
    const events: string[] = []
    const content: string[] = []

    await readAiEventStream(response, (event) => {
      events.push(event.event)
      if (event.event === 'delta') content.push(event.data.content)
    })

    expect(events).toEqual(['start', 'delta', 'delta', 'saved'])
    expect(content).toEqual(['继续', '往前'])
  })
})
