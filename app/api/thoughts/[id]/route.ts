import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id } = await params
    const data = await new ThoughtRepository(createServiceClient()).getDetail(user.id, id)
    return NextResponse.json({ data })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
