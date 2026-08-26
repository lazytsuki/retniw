import { ApiError } from '@/src/lib/api-error'
import { nicknameFromMetadata } from './account-profile'

export type AuthenticatedUser = {
  id: string
  email: string | null
  nickname: string | null
}

type AuthClaims = {
  sub?: string
  email?: unknown
  user_metadata?: unknown
}

export type AuthClient = {
  auth: {
    getClaims: () => Promise<{
      data: { claims: AuthClaims } | null
      error: { message: string } | null
    }>
  }
}

export async function requireUser(authClient?: AuthClient): Promise<AuthenticatedUser> {
  const client =
    authClient ?? (await (await import('@/src/lib/supabase/server')).createServerAuthClient())
  const { data, error } = await client.auth.getClaims()

  if (error || !data?.claims.sub) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
  }

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === 'string' ? data.claims.email : null,
    nickname: nicknameFromMetadata(data.claims.user_metadata),
  }
}
