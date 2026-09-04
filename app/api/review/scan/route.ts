import { after, NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireMutationUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ProductEventRepository } from '@/src/server/repositories/product-event-repository'
import { ReviewService } from '@/src/server/review/review-service'

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutationUser(request)
    const body = await request.json().catch(() => null) as { requestId?: unknown } | null
    const requestId = typeof body?.requestId === 'string' && UUID_PATTERN.test(body.requestId)
      ? body.requestId
      : crypto.randomUUID()
    const client = createServiceClient()
    const result = await ReviewService.fromClient(client).scanExistingThoughts(user.id)
    try {
      after(async () => {
        try {
          await new ProductEventRepository(client).recordScanFinished({
            userId: user.id,
            requestId,
            status: result.status,
            created: result.created,
          })
        } catch {
          console.error('product_event_failed', { eventName: 'review_scan_finished' })
        }
      })
    } catch {
      console.error('product_event_failed', { eventName: 'review_scan_finished' })
    }
    return NextResponse.json({ data: result })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
