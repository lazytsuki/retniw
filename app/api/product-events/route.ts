import { NextRequest, NextResponse } from 'next/server'
import { ApiError } from '@/src/lib/api-error'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireMutationUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ProductEventRepository } from '@/src/server/repositories/product-event-repository'

export const runtime = 'nodejs'

type ProductEventBody = {
  eventName?: unknown
  requestId?: unknown
  connectionId?: unknown
  thoughtId?: unknown
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutationUser(request)
    const body = await request.json().catch(() => null) as ProductEventBody | null
    if (!body || typeof body.eventName !== 'string') {
      throw new ApiError(400, 'INVALID_INPUT', 'Invalid product event')
    }

    const events = new ProductEventRepository(createServiceClient())
    if (body.eventName === 'workspace_active_day' || body.eventName === 'review_opened') {
      await events.recordDaily(user.id, body.eventName)
    } else if (
      body.eventName === 'connection_opened' &&
      typeof body.requestId === 'string' &&
      typeof body.connectionId === 'string' &&
      typeof body.thoughtId === 'string'
    ) {
      await events.recordConnectionOpened({
        userId: user.id,
        requestId: body.requestId,
        connectionId: body.connectionId,
        thoughtId: body.thoughtId,
      })
    } else {
      throw new ApiError(400, 'INVALID_INPUT', 'Invalid product event')
    }

    return NextResponse.json({ data: { recorded: true } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
