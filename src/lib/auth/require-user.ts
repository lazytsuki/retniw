import type { User } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

export type AuthClient = {
  auth: {
    getUser: () => Promise<{
      data: { user: User | null }
      error: { message: string } | null
    }>
  }
}

export async function requireUser(authClient?: AuthClient): Promise<User> {
  const client =
    authClient ?? (await (await import('@/src/lib/supabase/server')).createServerAuthClient())
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')
  }

  return user
}
