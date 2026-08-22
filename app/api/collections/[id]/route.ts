import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { CollectionRepository } from '@/src/server/repositories/collection-repository'
import { parseCollectionInput, requireUuid } from '@/src/server/thoughts/parse-thought-management'

export const runtime = 'nodejs'
type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id: rawId } = await params
    const id = requireUuid(rawId, 'id')
    const { name } = parseCollectionInput(await request.json().catch(() => null))
    const collection = await new CollectionRepository(createServiceClient()).rename(user.id, id, name)
    return NextResponse.json({ data: { collection } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id: rawId } = await params
    const id = requireUuid(rawId, 'id')
    await new CollectionRepository(createServiceClient()).deleteOwned(user.id, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
