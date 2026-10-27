import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireTokenUser } from '@/src/lib/auth/require-token-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { AccessTokenRepository } from '@/src/server/repositories/access-token-repository'
import { EntryRepository } from '@/src/server/repositories/entry-repository'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'
import { parseTokenEntryInput } from '@/src/server/access-tokens/parse-access-token-input'
import { scheduleSavedEntryReview } from '@/src/server/review/schedule-saved-entry-review'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 外部工具用个人访问令牌写入用户原文。
 * 新的 thoughtId 会创建想法；已有的只能是这个令牌自己创建过的。
 * 内容按「导入」保存，与页面上的导入一样参与回看；按 requestId 幂等。
 */
export async function POST(request: Request) {
  try {
    const client = createServiceClient()
    const tokens = new AccessTokenRepository(client)
    const caller = await requireTokenUser(request, tokens)
    const input = parseTokenEntryInput(await request.json().catch(() => null))

    const thoughts = new ThoughtRepository(client)
    const entries = new EntryRepository(client)
    const thoughtResult = await thoughts.ensureForToken(caller.userId, caller.tokenId, input.thoughtId)
    const entryResult = await entries.createIdempotent({
      id: input.entryId,
      userId: caller.userId,
      thoughtId: input.thoughtId,
      clientRequestId: input.requestId,
      entryType: 'import',
      content: input.content,
      sourceLabel: input.sourceLabel ?? caller.tokenName,
    })

    await thoughts.touch(caller.userId, input.thoughtId, entryResult.entry.createdAt)
    await thoughts.setSummaryIfEmpty(caller.userId, input.thoughtId, entryResult.entry)
    scheduleSavedEntryReview({
      userId: caller.userId,
      thoughtId: input.thoughtId,
      entryId: entryResult.entry.id,
      processedThrough: entryResult.entry.createdAt,
    })
    await tokens.touch(caller.tokenId).catch(() => undefined)

    return NextResponse.json(
      { data: { thought: thoughtResult.thought, entry: entryResult.entry } },
      { status: thoughtResult.created && entryResult.created ? 201 : 200 },
    )
  } catch (error) {
    return apiErrorResponse(error)
  }
}
