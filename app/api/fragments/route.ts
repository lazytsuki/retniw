import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireMutationUser, requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { decodeCursor, FragmentRepository } from '@/src/server/repositories/fragment-repository'
import { parseFragmentInput } from '@/src/server/fragments/parse-fragment-input'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutationUser(request)
    const { clientRequestId, content, inputMode } = parseFragmentInput(
      await request.json().catch(() => null),
    )

    const repository = new FragmentRepository(createServiceClient())
    const result = await repository.createIdempotent({
      userId: user.id,
      clientRequestId,
      content,
      inputMode,
    })

    return NextResponse.json({ data: { fragment: result.fragment } }, { status: result.created ? 201 : 200 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser()
    const cursorValue = request.nextUrl.searchParams.get('cursor')
    const repository = new FragmentRepository(createServiceClient())
    const result = await repository.listRecent(user.id, cursorValue ? decodeCursor(cursorValue) : undefined)
    return NextResponse.json({ data: result })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
