import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { EntryRepository } from '@/src/server/repositories/entry-repository'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'
import { requireUuid } from '@/src/server/thoughts/parse-thought-management'
import { parseThoughtEntryInput } from '@/src/server/thoughts/parse-thought-input'

export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id: rawThoughtId } = await params
    const thoughtId = requireUuid(rawThoughtId, 'id')
    const input = parseThoughtEntryInput(await request.json().catch(() => null))
    const client = createServiceClient()
    const thoughts = new ThoughtRepository(client)
    await thoughts.getOwned(user.id, thoughtId)
    const result = await new EntryRepository(client).createIdempotent({
      id: input.entryId,
      userId: user.id,
      thoughtId,
      clientRequestId: input.clientRequestId,
      entryType: input.entryType,
      content: input.content,
      sourceLabel: input.sourceLabel,
    })

    await thoughts.touch(user.id, thoughtId, result.entry.createdAt)
    await thoughts.setSummaryIfEmpty(user.id, thoughtId, result.entry)
    return NextResponse.json({ data: { entry: result.entry } }, { status: result.created ? 201 : 200 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
