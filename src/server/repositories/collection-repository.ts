import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

export type ThoughtCollectionRecord = {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
}

export type ThoughtCollection = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

function toCollection(row: ThoughtCollectionRecord): ThoughtCollection {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
}

export class CollectionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(userId: string) {
    const { data, error } = await this.client
      .from('thought_collections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .returns<ThoughtCollectionRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list collections')
    return data.map(toCollection)
  }

  async create(userId: string, id: string, name: string) {
    const { data, error } = await this.client
      .from('thought_collections')
      .insert({ id, user_id: userId, name })
      .select('*')
      .single<ThoughtCollectionRecord>()
    if (error?.code === '23505') throw new ApiError(409, 'STATE_CONFLICT', 'Collection already exists')
    if (error || !data) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to create collection')
    return toCollection(data)
  }

  async rename(userId: string, id: string, name: string) {
    const { data, error } = await this.client
      .from('thought_collections')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', id)
      .select('*')
      .maybeSingle<ThoughtCollectionRecord>()
    if (error?.code === '23505') throw new ApiError(409, 'STATE_CONFLICT', 'Collection already exists')
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to rename collection')
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Collection not found')
    return toCollection(data)
  }

  async deleteOwned(userId: string, id: string) {
    const { data, error } = await this.client
      .from('thought_collections')
      .delete()
      .eq('user_id', userId)
      .eq('id', id)
      .select('id')
      .maybeSingle<{ id: string }>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to delete collection')
    if (!data) throw new ApiError(404, 'NOT_FOUND', 'Collection not found')
  }
}
