import { NextRequest, NextResponse } from 'next/server'
import { ApiError } from '@/src/lib/api-error'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireRequestUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ReviewPreferenceRepository } from '@/src/server/repositories/review-preference-repository'
import {
  decodeReviewCursor,
  ThoughtConnectionRepository,
  type ReviewConnectionStatus,
} from '@/src/server/repositories/thought-connection-repository'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await requireRequestUser(request)
    const statusValue = request.nextUrl.searchParams.get('status') ?? 'pending'
    if (statusValue !== 'pending' && statusValue !== 'confirmed') {
      throw new ApiError(400, 'INVALID_INPUT', 'status 无效')
    }
    const status: ReviewConnectionStatus = statusValue
    const cursorValue = request.nextUrl.searchParams.get('cursor')
    const cursor = cursorValue ? decodeReviewCursor(cursorValue) : undefined
    const client = createServiceClient()
    const preferences = new ReviewPreferenceRepository(client)
    const connections = new ThoughtConnectionRepository(client)
    const shouldCountPending = status === 'pending' && cursor === undefined
    const [preference, page, pendingCount] = await Promise.all([
      preferences.get(user.id),
      connections.listForReview(user.id, status, cursor),
      shouldCountPending
        ? connections.countForReview(user.id, 'pending')
        : Promise.resolve(undefined),
    ])

    return NextResponse.json({
      data: {
        preference,
        connections: page.connections,
        ...(pendingCount === undefined ? {} : { pendingCount }),
        nextCursor: page.nextCursor,
      },
    })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
