import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { DeepSeekTextProvider } from '@/src/server/ai/deepseek-text-provider'
import { ThoughtConnectionRepository } from '@/src/server/repositories/thought-connection-repository'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'

export const runtime = 'nodejs'
export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id: thoughtId } = await params
    const client = createServiceClient()
    const thoughts = new ThoughtRepository(client)
    const connections = new ThoughtConnectionRepository(client)
    const current = await thoughts.getDetail(user.id, thoughtId)
    const pending = await connections.pendingForThought(user.id, thoughtId)
    if (pending) {
      await connections.markChecked(user.id, thoughtId)
      return NextResponse.json({ data: { connection: pending } })
    }
    if (
      current.thought.relationCheckedAt &&
      current.thought.relationCheckedAt >= current.thought.lastActivityAt
    ) {
      return NextResponse.json({ data: { connection: null } })
    }

    const recent = await thoughts.listRecent(user.id)
    const candidateThoughts = recent.thoughts
      .filter((thought) => thought.id !== thoughtId)
      .slice(0, 20)
    if (!candidateThoughts.length) {
      await connections.markChecked(user.id, thoughtId)
      return NextResponse.json({ data: { connection: null } })
    }

    const candidateDetails = await Promise.all(
      candidateThoughts.map((thought) => thoughts.getDetail(user.id, thought.id)),
    )
    const suggestion = await new DeepSeekTextProvider().findConnection(
      {
        id: thoughtId,
        entries: current.entries.map((entry) => ({ id: entry.id, content: entry.content })),
      },
      candidateDetails.map((detail) => ({
        id: detail.thought.id,
        entries: detail.entries.map((entry) => ({ id: entry.id, content: entry.content })),
      })),
    )
    if (!suggestion) {
      await connections.markChecked(user.id, thoughtId)
      return NextResponse.json({ data: { connection: null } })
    }

    const result = await connections.createCandidate({
      userId: user.id,
      currentThoughtId: thoughtId,
      targetThoughtId: suggestion.targetThoughtId,
      currentEntryId: suggestion.sourceEntryId,
      targetEntryId: suggestion.targetEntryId,
      rationale: suggestion.rationale,
    })
    await connections.markChecked(user.id, thoughtId)
    return NextResponse.json(
      { data: { connection: result.connection } },
      { status: result.created ? 201 : 200 },
    )
  } catch (error) {
    return apiErrorResponse(error)
  }
}
