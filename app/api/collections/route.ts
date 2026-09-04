import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireMutationUser, requireRequestUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { CollectionRepository } from '@/src/server/repositories/collection-repository'
import { parseCollectionInput } from '@/src/server/thoughts/parse-thought-management'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request)
    const collections = await new CollectionRepository(createServiceClient()).list(user.id)
    return NextResponse.json({ data: { collections } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireMutationUser(request)
    const input = parseCollectionInput(await request.json().catch(() => null), true)
    const collection = await new CollectionRepository(createServiceClient()).create(
      user.id,
      input.id!,
      input.name,
    )
    return NextResponse.json({ data: { collection } }, { status: 201 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
