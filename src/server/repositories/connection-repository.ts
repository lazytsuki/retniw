import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

export type ConnectionDecision = 'confirmed' | 'rejected'

export class ConnectionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async decide(userId: string, connectionId: string, decision: ConnectionDecision) {
    const existing = await this.client
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', userId)
      .maybeSingle()
    if (existing.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read connection')
    if (!existing.data) throw new ApiError(404, 'NOT_FOUND', 'Resource not found')
    if (existing.data.status === decision) return existing.data
    if (existing.data.status !== 'pending') {
      throw new ApiError(409, 'STATE_CONFLICT', 'Connection was already decided')
    }

    const updated = await this.client
      .from('connections')
      .update({ status: decision, decided_at: new Date().toISOString() })
      .eq('id', connectionId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle()
    if (updated.error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to update connection')
    if (updated.data) return updated.data

    const raced = await this.client
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', userId)
      .single()
    if (raced.error || !raced.data) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read connection')
    }
    if (raced.data.status === decision) return raced.data
    throw new ApiError(409, 'STATE_CONFLICT', 'Connection was already decided')
  }
}
