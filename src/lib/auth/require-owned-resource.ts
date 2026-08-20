import type { User } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

type QueryResult<T> = Promise<{ data: T | null; error: { message: string } | null }>

type OwnedResourceQuery<T> = {
  eq: (column: string, value: string) => OwnedResourceQuery<T>
  maybeSingle: () => QueryResult<T>
}

export type OwnedResourceClient<T> = {
  from: (table: string) => {
    select: (columns: string) => OwnedResourceQuery<T>
  }
}

type OwnedResourceOptions<T> = {
  table: 'fragments' | 'clarifications' | 'connections'
  id: string
  select?: string
  user: Pick<User, 'id'>
  client?: OwnedResourceClient<T>
}

export async function requireOwnedResource<T>({
  table,
  id,
  select = '*',
  user,
  client,
}: OwnedResourceOptions<T>): Promise<T> {
  const serviceClient =
    client ??
    ((await import('@/src/lib/supabase/service')).createServiceClient() as unknown as OwnedResourceClient<T>)

  const { data, error } = await serviceClient
    .from(table)
    .select(select)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read resource')
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Resource not found')

  return data
}
