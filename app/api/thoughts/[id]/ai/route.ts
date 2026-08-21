import { NextRequest } from 'next/server'
import { ApiError } from '@/src/lib/api-error'
import { apiErrorResponse } from '@/src/lib/api-response'
import { hasNewUserContext } from '@/src/lib/ai-context'
import { aiOutputForDisplay } from '@/src/lib/ai-output'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { DeepSeekTextProvider, type AiAction } from '@/src/server/ai/deepseek-text-provider'
import { EntryRepository } from '@/src/server/repositories/entry-repository'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'

export const runtime = 'nodejs'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACTIONS = new Set<AiAction>(['advance', 'question', 'organize'])
type RouteContext = { params: Promise<{ id: string }> }

function encodeEvent(encoder: TextEncoder, event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id: thoughtId } = await params
    const body = (await request.json().catch(() => null)) as {
      clientRequestId?: unknown
      action?: unknown
    } | null
    if (
      !body ||
      typeof body.clientRequestId !== 'string' ||
      !UUID_PATTERN.test(body.clientRequestId) ||
      typeof body.action !== 'string' ||
      !ACTIONS.has(body.action as AiAction)
    ) {
      throw new ApiError(400, 'INVALID_INPUT', 'Invalid AI action request')
    }

    const action = body.action as AiAction
    const clientRequestId = body.clientRequestId
    const client = createServiceClient()
    const thoughts = new ThoughtRepository(client)
    const entries = new EntryRepository(client)
    const [, thoughtEntries, existing] = await Promise.all([
      thoughts.getOwned(user.id, thoughtId),
      entries.listByThought(user.id, thoughtId),
      entries.findByClientRequest(user.id, clientRequestId),
    ])
    const contextLength = thoughtEntries.reduce((total, entry) => total + entry.content.length, 0)
    if (contextLength > 500_000) {
      throw new ApiError(413, 'CONTEXT_TOO_LARGE', 'This thought is too large for AI processing')
    }

    if (existing) {
      if (existing.thoughtId !== thoughtId || existing.entryType !== 'ai' || existing.aiAction !== action) {
        throw new ApiError(409, 'STATE_CONFLICT', 'This request id is already used')
      }
    }
    if (!existing && !hasNewUserContext(thoughtEntries)) {
      throw new ApiError(409, 'AI_NEEDS_INPUT', '先写下新的内容，再继续')
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encodeEvent(encoder, 'start', { action }))
        if (existing) {
          controller.enqueue(encodeEvent(encoder, 'saved', { entry: existing }))
          controller.close()
          return
        }

        let content = ''
        try {
          const provider = new DeepSeekTextProvider()
          for await (const delta of provider.streamText(action, thoughtEntries, request.signal)) {
            content += delta
            if (content.length > 20_000) {
              throw new ApiError(503, 'AI_UNAVAILABLE', 'AI output is too long', true)
            }
            controller.enqueue(encodeEvent(encoder, 'delta', { content: delta }))
          }

          const completeContent = aiOutputForDisplay(content, action)
          if (!completeContent) {
            throw new ApiError(503, 'AI_UNAVAILABLE', 'AI returned an empty result', true)
          }
          if (
            action === 'question' &&
            (!completeContent.endsWith('？') ||
              thoughtEntries.some((entry) => entry.content.trim() === completeContent))
          ) {
            throw new ApiError(503, 'AI_UNAVAILABLE', 'AI did not return a valid question', true)
          }
          if (
            action === 'advance' &&
            thoughtEntries.some((entry) => entry.content.trim() === completeContent)
          ) {
            throw new ApiError(503, 'AI_UNAVAILABLE', 'AI repeated the user input', true)
          }
          const result = await entries.createIdempotent({
            id: clientRequestId,
            userId: user.id,
            thoughtId,
            clientRequestId,
            entryType: 'ai',
            content: completeContent,
            aiAction: action,
          })
          await thoughts.touch(user.id, thoughtId, result.entry.createdAt)
          controller.enqueue(encodeEvent(encoder, 'saved', { entry: result.entry }))
        } catch (error) {
          const apiError = error instanceof ApiError
            ? error
            : new ApiError(503, 'AI_UNAVAILABLE', 'AI service is temporarily unavailable', true)
          controller.enqueue(
            encodeEvent(encoder, 'error', {
              code: apiError.code,
              message: apiError.message,
              retryable: apiError.retryable,
            }),
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'content-type': 'text/event-stream; charset=utf-8',
      },
    })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
