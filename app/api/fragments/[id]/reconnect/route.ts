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

type FragmentRow = {
  id: string
  content: string
  reconnect_checked_at: string | null
}

function normalizePair(first: string, second: string) {
  return first < second
    ? { source_fragment_id: first, target_fragment_id: second }
    : { source_fragment_id: second, target_fragment_id: first }
}

async function markChecked(service: ReturnType<typeof createServiceClient>, userId: string, id: string) {
  const result = await service
    .from('fragments')
    .update({ reconnect_checked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
  if (result.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to complete reconnect check')
}

async function pendingForFragment(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  fragmentId: string,
) {
  const result = await service
    .from('connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .or(`source_fragment_id.eq.${fragmentId},target_fragment_id.eq.${fragmentId}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read reconnect result')
  return result.data
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id } = await params
    const fragment = await requireOwnedResource<FragmentRow>({
      table: 'fragments',
      id,
      user,
      select: 'id, content, reconnect_checked_at',
    })
    const service = createServiceClient()

    if (fragment.reconnect_checked_at) {
      return NextResponse.json({ data: { connection: await pendingForFragment(service, user.id, id) } })
    }

    const candidatesResult = await service
      .from('fragments')
      .select('id, content')
      .eq('user_id', user.id)
      .neq('id', id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (candidatesResult.error) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read reconnect candidates')
    }
    const candidates = candidatesResult.data ?? []
    if (!candidates.length) {
      await markChecked(service, user.id, id)
      return NextResponse.json({ data: { connection: null } })
    }

    const answersResult = await service
      .from('clarifications')
      .select('fragment_id, answer')
      .eq('user_id', user.id)
      .in('fragment_id', candidates.map((candidate) => candidate.id))
      .not('answer', 'is', null)
    if (answersResult.error) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read reconnect context')
    }
    const answers = new Map(
      (answersResult.data ?? []).map((answer) => [answer.fragment_id, answer.answer] as const),
    )
    const suggestion = await new DeepSeekTextProvider().reconnect(
      { id: fragment.id, content: fragment.content },
      candidates.map((candidate) => ({
        id: candidate.id,
        content: candidate.content,
        clarificationAnswer: answers.get(candidate.id) ?? null,
      })),
    )
    if (!suggestion.targetFragmentId || !suggestion.rationale) {
      await markChecked(service, user.id, id)
      return NextResponse.json({ data: { connection: null } })
    }

    const pair = normalizePair(id, suggestion.targetFragmentId)
    const existing = await service
      .from('connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('source_fragment_id', pair.source_fragment_id)
      .eq('target_fragment_id', pair.target_fragment_id)
      .maybeSingle()
    if (existing.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read reconnect result')
    if (existing.data) {
      await markChecked(service, user.id, id)
      return NextResponse.json({
        data: { connection: existing.data.status === 'pending' ? existing.data : null },
      })
    }

    const inserted = await service
      .from('connections')
      .insert({ user_id: user.id, ...pair, rationale: suggestion.rationale })
      .select('*')
      .single()
    let connection = inserted.data
    if (inserted.error?.code === '23505') {
      const raced = await service
        .from('connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('source_fragment_id', pair.source_fragment_id)
        .eq('target_fragment_id', pair.target_fragment_id)
        .single()
      if (raced.error || !raced.data) {
        throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read reconnect result')
      }
      connection = raced.data.status === 'pending' ? raced.data : null
    } else if (inserted.error || !inserted.data) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to save reconnect result')
    }

    await markChecked(service, user.id, id)
    return NextResponse.json({ data: { connection } }, { status: inserted.data ? 201 : 200 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
