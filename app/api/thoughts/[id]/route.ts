import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'
import { parseThoughtAction, requireUuid } from '@/src/server/thoughts/parse-thought-management'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id: rawId } = await params
    const id = requireUuid(rawId, 'id')
    const data = await new ThoughtRepository(createServiceClient()).getDetail(user.id, id)
    return NextResponse.json({ data })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id: rawId } = await params
    const id = requireUuid(rawId, 'id')
    const action = parseThoughtAction(await request.json().catch(() => null))
    const thought = await new ThoughtRepository(createServiceClient()).updateAction(user.id, id, action)
    return NextResponse.json({ data: { thought } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
