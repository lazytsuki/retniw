import { NextRequest, NextResponse } from 'next/server'
import { ApiError } from '@/src/lib/api-error'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireMutationUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ReviewPreferenceRepository } from '@/src/server/repositories/review-preference-repository'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireMutationUser(request)
    const body = await request.json().catch(() => null) as { enabled?: unknown } | null
    if (!body || typeof body.enabled !== 'boolean') {
      throw new ApiError(400, 'INVALID_INPUT', 'enabled 必须是布尔值')
    }
    const preference = await new ReviewPreferenceRepository(createServiceClient()).set(
      user.id,
      body.enabled,
    )
    return NextResponse.json({ data: { preference } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
