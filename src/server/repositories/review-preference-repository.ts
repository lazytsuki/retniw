import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

type ReviewPreferenceRecord = {
  user_id: string
  enabled: boolean
  updated_at: string
}

export type ReviewPreference = {
  enabled: boolean
  updatedAt: string | null
}

function toPreference(record: ReviewPreferenceRecord): ReviewPreference {
  return {
    enabled: record.enabled,
    updatedAt: record.updated_at,
  }
}

export class ReviewPreferenceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async get(userId: string): Promise<ReviewPreference> {
    const { data, error } = await this.client
      .from('user_review_preferences')
      .select('user_id, enabled, updated_at')
      .eq('user_id', userId)
      .maybeSingle<ReviewPreferenceRecord>()

    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read review preference')
    return data ? toPreference(data) : { enabled: false, updatedAt: null }
  }

  async set(userId: string, enabled: boolean): Promise<ReviewPreference> {
    if (typeof enabled !== 'boolean') {
      throw new ApiError(400, 'INVALID_INPUT', 'enabled must be a boolean')
    }

    const { data, error } = await this.client
      .from('user_review_preferences')
      .upsert(
        { user_id: userId, enabled, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      .select('user_id, enabled, updated_at')
      .single<ReviewPreferenceRecord>()

    if (error || !data) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to update review preference')
    }
    return toPreference(data)
  }
}
