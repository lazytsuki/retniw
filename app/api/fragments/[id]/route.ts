import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireRequestUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { FragmentDetailRepository } from '@/src/server/repositories/fragment-detail-repository'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireRequestUser(request)
    const { id } = await params
    const fragment = await new FragmentDetailRepository(createServiceClient()).get(user.id, id)
    return NextResponse.json({ data: { fragment } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
