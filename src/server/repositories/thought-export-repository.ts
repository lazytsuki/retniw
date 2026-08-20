import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

export const EXPORT_PAGE_SIZE = 500

export type ExportThought = {
  id: string
  createdAt: string
  lastActivityAt: string
}

export type ExportEntry = {
  id: string
  thoughtId: string
  entryType: 'user' | 'import' | 'ai'
  content: string
  sourceLabel: string | null
  aiAction: 'advance' | 'question' | 'organize' | null
  createdAt: string
}

export type ExportConnection = {
  id: string
  sourceThoughtId: string
  targetThoughtId: string
  sourceEntryId: string
  targetEntryId: string
  rationale: string
  decidedAt: string | null
  createdAt: string
}

type ThoughtRow = {
  id: string
  created_at: string
  last_activity_at: string
}

type EntryRow = {
  id: string
  thought_id: string
  entry_type: ExportEntry['entryType']
  content: string
  source_label: string | null
  ai_action: ExportEntry['aiAction']
  created_at: string
}

type ConnectionRow = {
  id: string
  source_thought_id: string
  target_thought_id: string
  source_entry_id: string
  target_entry_id: string
  rationale: string
  decided_at: string | null
  created_at: string
}

export class ThoughtExportRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listThoughtPage(userId: string, offset: number, limit = EXPORT_PAGE_SIZE) {
    const { data, error } = await this.client
      .from('thoughts')
      .select('id,created_at,last_activity_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)
      .returns<ThoughtRow[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to export thoughts')
    return data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
    }))
  }

  async listEntryPage(userId: string, offset: number, limit = EXPORT_PAGE_SIZE) {
    const { data, error } = await this.client
      .from('entries')
      .select('id,thought_id,entry_type,content,source_label,ai_action,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)
      .returns<EntryRow[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to export entries')
    return data.map((row) => ({
      id: row.id,
      thoughtId: row.thought_id,
      entryType: row.entry_type,
      content: row.content,
      sourceLabel: row.source_label,
      aiAction: row.ai_action,
      createdAt: row.created_at,
    }))
  }

  async listThoughtEntryPage(
    userId: string,
    thoughtId: string,
    offset: number,
    limit = EXPORT_PAGE_SIZE,
  ) {
    const { data, error } = await this.client
      .from('entries')
      .select('id,thought_id,entry_type,content,source_label,ai_action,created_at')
      .eq('user_id', userId)
      .eq('thought_id', thoughtId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)
      .returns<EntryRow[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to export thought entries')
    return data.map((row) => ({
      id: row.id,
      thoughtId: row.thought_id,
      entryType: row.entry_type,
      content: row.content,
      sourceLabel: row.source_label,
      aiAction: row.ai_action,
      createdAt: row.created_at,
    }))
  }

  async listConfirmedConnectionPage(userId: string, offset: number, limit = EXPORT_PAGE_SIZE) {
    const { data, error } = await this.client
      .from('thought_connections')
      .select(
        'id,source_thought_id,target_thought_id,source_entry_id,target_entry_id,rationale,decided_at,created_at',
      )
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)
      .returns<ConnectionRow[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to export connections')
    return data.map((row) => ({
      id: row.id,
      sourceThoughtId: row.source_thought_id,
      targetThoughtId: row.target_thought_id,
      sourceEntryId: row.source_entry_id,
      targetEntryId: row.target_entry_id,
      rationale: row.rationale,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
    }))
  }
}
