import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { ApiError } from '@/src/lib/api-error'
import { requireOwnedResource } from '@/src/lib/auth/require-owned-resource'
import { requireMutationUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

function parseAnswer(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as { answer?: unknown }).answer !== 'string'
  ) {
    throw new ApiError(400, 'INVALID_INPUT', 'Answer is required')
  }
  const answer = (value as { answer: string }).answer.trim()
  if (!answer || answer.length > 10_000) {
    throw new ApiError(400, 'INVALID_INPUT', 'Answer must contain 1 to 10000 characters')
  }
  return answer
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireMutationUser(request)
    const { id } = await params
    const answer = parseAnswer(await request.json().catch(() => null))
    const existing = await requireOwnedResource<{
      id: string
      answer: string | null
      answered_at: string | null
    }>({ table: 'clarifications', id, user, select: 'id, answer, answered_at' })
    if (existing.answer === answer) {
      return NextResponse.json({
        data: { clarification: { id, answer, answeredAt: existing.answered_at } },
      })
    }
    if (existing.answer !== null) {
      throw new ApiError(409, 'STATE_CONFLICT', 'Clarification was already answered')
    }

    const service = createServiceClient()
    const updated = await service
      .from('clarifications')
      .update({ answer, answered_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('answer', null)
      .select('id, answer, answered_at')
      .maybeSingle()
    if (updated.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to save answer')
    if (updated.data) {
      return NextResponse.json({
        data: {
          clarification: {
            id: updated.data.id,
            answer: updated.data.answer,
            answeredAt: updated.data.answered_at,
          },
        },
      })
    }

    const raced = await service
      .from('clarifications')
      .select('answer, answered_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (raced.error || !raced.data) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read answer')
    }
    if (raced.data.answer !== answer) {
      throw new ApiError(409, 'STATE_CONFLICT', 'Clarification was already answered')
    }
    return NextResponse.json({
      data: { clarification: { id, answer, answeredAt: raced.data.answered_at } },
    })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
