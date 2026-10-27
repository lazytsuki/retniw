import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireMutationUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { AccessTokenRepository } from '@/src/server/repositories/access-token-repository'
import { requireUuid } from '@/src/server/thoughts/parse-thought-management'

export const runtime = 'nodejs'
type RouteContext = { params: Promise<{ id: string }> }

/** 撤销令牌：立即失效；它创建过的想法和内容保留。 */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await requireMutationUser(request)
    const { id: rawId } = await params
    const id = requireUuid(rawId, 'id')
    await new AccessTokenRepository(createServiceClient()).revoke(user.id, id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
