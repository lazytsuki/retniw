import { createHash, randomBytes } from 'node:crypto'

export const accessTokenPrefix = 'rtw_'
const tokenPattern = /^rtw_[A-Za-z0-9_-]{43}$/

export function generateAccessToken() {
  return accessTokenPrefix + randomBytes(32).toString('base64url')
}

export function hashAccessToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** 从 `Authorization: Bearer rtw_...` 取出令牌；格式不对返回 null。 */
export function readBearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  const token = match?.[1]
  return token && tokenPattern.test(token) ? token : null
}
