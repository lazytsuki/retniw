import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/src/lib/api-response'
import { requireMutationUser, requireRequestUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { AccessTokenRepository } from '@/src/server/repositories/access-token-repository'
import { parseAccessTokenName } from '@/src/server/access-tokens/parse-access-token-input'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request)
    const accessTokens = await new AccessTokenRepository(createServiceClient()).listActive(user.id)
    return NextResponse.json({ data: { accessTokens } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

/** 创建令牌；响应里的 token 是唯一一次能看到的明文。 */
export async function POST(request: Request) {
  try {
    const user = await requireMutationUser(request)
    const name = parseAccessTokenName(await request.json().catch(() => null))
    const result = await new AccessTokenRepository(createServiceClient()).create(user.id, name)
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
