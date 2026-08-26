import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ReviewService } from '@/src/server/review/review-service'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  try {
    const user = await requireUser()
    const result = await ReviewService.fromClient(createServiceClient()).scanExistingThoughts(user.id)
    return NextResponse.json({ data: result })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
