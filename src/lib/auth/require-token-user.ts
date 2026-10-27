import { ApiError } from '@/src/lib/api-error'
import { readBearerToken } from './access-token'
import type { AccessTokenRecord } from '@/src/server/repositories/access-token-repository'

export type TokenUser = {
  userId: string
  tokenId: string
  tokenName: string
}

export type TokenLookup = {
  findActiveByToken: (token: string) => Promise<AccessTokenRecord | null>
}

/** 令牌请求的身份：只认 Authorization 头，不使用浏览器会话，也不需要页面账号围栏。 */
export async function requireTokenUser(request: Request, tokens: TokenLookup): Promise<TokenUser> {
  const token = readBearerToken(request)
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Access token required')

  const record = await tokens.findActiveByToken(token)
  if (!record) throw new ApiError(401, 'UNAUTHENTICATED', 'Access token is invalid or revoked')

  return { userId: record.user_id, tokenId: record.id, tokenName: record.name }
}
