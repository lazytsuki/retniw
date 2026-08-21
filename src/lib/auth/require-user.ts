import { ApiError } from '@/src/lib/api-error'

export type AuthenticatedUser = { id: string }

export type AuthClient = {
  auth: {
    getClaims: () => Promise<{
      data: { claims: { sub?: string } | null }
      error: { message: string } | null
    }>
  }
}

export async function requireUser(authClient?: AuthClient): Promise<AuthenticatedUser> {
  const client =
    authClient ?? (await (await import('@/src/lib/supabase/server')).createServerAuthClient())
  const { data, error } = await client.auth.getClaims()

  if (error || !data?.claims?.sub) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
  }

  return { id: data.claims.sub }
}
