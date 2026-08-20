import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { ApiError } from '@/src/lib/api-error'
import { requireOwnedResource } from '@/src/lib/auth/require-owned-resource'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { DeepSeekTextProvider } from '@/src/server/ai/deepseek-text-provider'

export const runtime = 'nodejs'
export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }

function toClarification(row: {
  id: string
  question: string
  answer: string | null
  answered_at: string | null
  created_at: string
}) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id } = await params
    const fragment = await requireOwnedResource<{ id: string; content: string }>({
      table: 'fragments',
      id,
      user,
    })
    const service = createServiceClient()
    const existing = await service
      .from('clarifications')
      .select('id, question, answer, answered_at, created_at')
      .eq('user_id', user.id)
      .eq('fragment_id', fragment.id)
      .maybeSingle()
    if (existing.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read clarification')
    if (existing.data) {
      return NextResponse.json({ data: { clarification: toClarification(existing.data) } })
    }

    const question = await new DeepSeekTextProvider().clarify(fragment.content)
    const inserted = await service
      .from('clarifications')
      .insert({ user_id: user.id, fragment_id: fragment.id, question })
      .select('id, question, answer, answered_at, created_at')
      .single()

    if (!inserted.error && inserted.data) {
      return NextResponse.json(
        { data: { clarification: toClarification(inserted.data) } },
        { status: 201 },
      )
    }
    if (inserted.error?.code !== '23505') {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to save clarification')
    }

    const raced = await service
      .from('clarifications')
      .select('id, question, answer, answered_at, created_at')
      .eq('user_id', user.id)
      .eq('fragment_id', fragment.id)
      .single()
    if (raced.error || !raced.data) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read clarification')
    }
    return NextResponse.json({ data: { clarification: toClarification(raced.data) } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
