import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { CheckpointRepository } from '@/src/server/repositories/checkpoint-repository'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'
import { parseCheckpointInput } from '@/src/server/thoughts/parse-thought-management'

export const runtime = 'nodejs'
type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id: thoughtId } = await params
    const input = parseCheckpointInput(await request.json().catch(() => null))
    const client = createServiceClient()
    await new ThoughtRepository(client).getOwned(user.id, thoughtId)
    const result = await new CheckpointRepository(client).createIdempotent({
      id: input.id,
      userId: user.id,
      thoughtId,
      clientRequestId: input.clientRequestId,
      note: input.note,
    })
    return NextResponse.json(
      { data: { checkpoint: result.checkpoint } },
      { status: result.created ? 201 : 200 },
    )
  } catch (error) {
    return apiErrorResponse(error)
  }
}
