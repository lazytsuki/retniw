import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { ApiError } from '@/src/lib/api-error'
import { requireMutationUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import {
  ConnectionRepository,
  type ConnectionDecision,
} from '@/src/server/repositories/connection-repository'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireMutationUser(request)
    const { id } = await params
    const body = (await request.json().catch(() => null)) as { decision?: unknown } | null
    if (body?.decision !== 'confirmed' && body?.decision !== 'rejected') {
      throw new ApiError(400, 'INVALID_INPUT', 'Decision must be confirmed or rejected')
    }
    const connection = await new ConnectionRepository(createServiceClient()).decide(
      user.id,
      id,
      body.decision as ConnectionDecision,
    )
    return NextResponse.json({ data: { connection } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
