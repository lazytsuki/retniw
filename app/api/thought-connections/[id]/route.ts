import { NextRequest, NextResponse } from 'next/server'
import { ApiError } from '@/src/lib/api-error'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireMutationUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import {
  ThoughtConnectionRepository,
  type ThoughtConnectionDecision,
} from '@/src/server/repositories/thought-connection-repository'
import { requireUuid } from '@/src/server/thoughts/parse-thought-management'

export const runtime = 'nodejs'
type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireMutationUser(request)
    const { id: rawId } = await params
    const id = requireUuid(rawId, 'id')
    const body = (await request.json().catch(() => null)) as { decision?: unknown } | null
    if (body?.decision !== 'confirmed' && body?.decision !== 'rejected') {
      throw new ApiError(400, 'INVALID_INPUT', 'Decision must be confirmed or rejected')
    }
    const connection = await new ThoughtConnectionRepository(createServiceClient()).decide(
      user.id,
      id,
      body.decision as ThoughtConnectionDecision,
    )
    return NextResponse.json({ data: { connection } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
