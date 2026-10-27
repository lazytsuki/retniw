import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'
import { generateAccessToken, hashAccessToken } from '@/src/lib/auth/access-token'

export const maxActiveAccessTokens = 10

export type AccessTokenRecord = {
  id: string
  user_id: string
  name: string
  token_hash: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type AccessToken = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

function toAccessToken(row: AccessTokenRecord): AccessToken {
  return { id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at }
}

export class AccessTokenRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listActive(userId: string) {
    const { data, error } = await this.client
      .from('personal_access_tokens')
      .select('*')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .returns<AccessTokenRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list access tokens')
    return data.map(toAccessToken)
  }

  /** 创建令牌；明文只在这里返回一次。 */
  async create(userId: string, name: string) {
    const { count, error: countError } = await this.client
      .from('personal_access_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('revoked_at', null)
    if (countError) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to create access token')
    if ((count ?? 0) >= maxActiveAccessTokens) {
      throw new ApiError(409, 'STATE_CONFLICT', `最多同时保留 ${maxActiveAccessTokens} 个令牌，请先撤销不用的`)
    }

    const token = generateAccessToken()
    const { data, error } = await this.client
      .from('personal_access_tokens')
      .insert({ user_id: userId, name, token_hash: hashAccessToken(token) })
      .select('*')
      .single<AccessTokenRecord>()
    if (error || !data) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to create access token')
    return { token, accessToken: toAccessToken(data) }
  }

  async revoke(userId: string, id: string) {
    const { data, error } = await this.client
      .from('personal_access_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', id)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle<{ id: string }>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to revoke access token')
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Access token not found')
  }

  async findActiveByToken(token: string) {
    const { data, error } = await this.client
      .from('personal_access_tokens')
      .select('*')
      .eq('token_hash', hashAccessToken(token))
      .is('revoked_at', null)
      .maybeSingle<AccessTokenRecord>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to verify access token')
    return data
  }

  /** 记录最近使用时间；失败不影响本次请求。 */
  async touch(id: string) {
    await this.client
      .from('personal_access_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', id)
  }
}
