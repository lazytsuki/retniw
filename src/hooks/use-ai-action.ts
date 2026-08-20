'use client'

import { useCallback, useState } from 'react'
import type { AiAction } from '@/src/server/ai/deepseek-text-provider'
import type { Entry } from '@/src/server/repositories/entry-repository'

type AiEvent =
  | { event: 'start'; data: { action: AiAction } }
  | { event: 'delta'; data: { content: string } }
  | { event: 'saved'; data: { entry: Entry } }
  | { event: 'error'; data: { code: string; message: string; retryable: boolean } }

export type AiActionState = {
  status: 'idle' | 'streaming' | 'saved' | 'error'
  action: AiAction | null
  content: string
  message: string
}

export async function readAiEventStream(response: Response, onEvent: (event: AiEvent) => void) {
  if (!response.body) throw new Error('AI_STREAM_MISSING')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      let eventName = ''
      let data = ''
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!eventName || !data) continue
      onEvent({ event: eventName, data: JSON.parse(data) } as AiEvent)
    }
    if (done) break
  }
}

const initialState: AiActionState = {
  status: 'idle',
  action: null,
  content: '',
  message: '',
}

export function useAiAction(onSaved: (entry: Entry) => void) {
  const [state, setState] = useState(initialState)

  const run = useCallback(
    async (thoughtId: string, action: AiAction) => {
      if (state.status === 'streaming') return
      setState({ status: 'streaming', action, content: '', message: '' })
      try {
        const response = await fetch(`/api/thoughts/${thoughtId}/ai`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clientRequestId: crypto.randomUUID(), action }),
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          throw new Error(payload?.error?.message ?? 'AI_REQUEST_FAILED')
        }

        let saved = false
        let streamError = ''
        await readAiEventStream(response, (event) => {
          if (event.event === 'delta') {
            setState((current) => ({ ...current, content: current.content + event.data.content }))
          } else if (event.event === 'saved') {
            saved = true
            onSaved(event.data.entry)
            setState({ status: 'saved', action, content: '', message: '' })
          } else if (event.event === 'error') {
            streamError = event.data.message
          }
        })
        if (!saved) throw new Error(streamError || 'AI_STREAM_INCOMPLETE')
      } catch (error) {
        const message = error instanceof Error && error.message === '先写下新的内容，再继续'
          ? error.message
          : '没有保存这次结果，可以稍后重试。'
        setState((current) => ({
          ...current,
          status: 'error',
          message,
        }))
      }
    },
    [onSaved, state.status],
  )

  const clear = useCallback(() => setState(initialState), [])
  return { state, run, clear }
}
