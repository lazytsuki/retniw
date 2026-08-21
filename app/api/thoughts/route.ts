import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { EntryRepository } from '@/src/server/repositories/entry-repository'
import { decodeThoughtCursor, ThoughtRepository } from '@/src/server/repositories/thought-repository'
import { parseThoughtInput } from '@/src/server/thoughts/parse-thought-input'
import { UUID_PATTERN } from '@/src/server/thoughts/parse-thought-management'
import { ApiError } from '@/src/lib/api-error'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()
    const input = parseThoughtInput(await request.json().catch(() => null))
    const client = createServiceClient()
    const thoughts = new ThoughtRepository(client)
    const entries = new EntryRepository(client)
    const thoughtResult = await thoughts.ensure(user.id, input.thoughtId)
    const entryResult = await entries.createIdempotent({
      id: input.entryId,
      userId: user.id,
      thoughtId: input.thoughtId,
      clientRequestId: input.clientRequestId,
      entryType: input.entryType,
      content: input.content,
      sourceLabel: input.sourceLabel,
    })

    await thoughts.touch(user.id, input.thoughtId, entryResult.entry.createdAt)
    await thoughts.setSummaryIfEmpty(user.id, input.thoughtId, entryResult.entry)
    return NextResponse.json(
      { data: { thought: thoughtResult.thought, entry: entryResult.entry } },
      { status: thoughtResult.created && entryResult.created ? 201 : 200 },
    )
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser()
    const cursorValue = request.nextUrl.searchParams.get('cursor')
    const scopeValue = request.nextUrl.searchParams.get('scope') ?? 'active'
    const collectionId = request.nextUrl.searchParams.get('collectionId') ?? undefined
    if (!['active', 'archived', 'deleted'].includes(scopeValue)) {
      throw new ApiError(400, 'INVALID_INPUT', 'scope 无效')
    }
    if (collectionId && !UUID_PATTERN.test(collectionId)) {
      throw new ApiError(400, 'INVALID_INPUT', 'collectionId 无效')
    }
    const result = await new ThoughtRepository(createServiceClient()).listRecent(
      user.id,
      cursorValue ? decodeThoughtCursor(cursorValue) : undefined,
      {
        scope: scopeValue as 'active' | 'archived' | 'deleted',
        collectionId,
      },
    )
    return NextResponse.json({ data: result })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
