import type { SupabaseClient } from '@supabase/supabase-js'
import { ApiError } from '@/src/lib/api-error'

export type FragmentRecord = {
  id: string
  user_id: string
  client_request_id: string
  content: string
  input_mode: 'text' | 'voice'
  reconnect_checked_at: string | null
  created_at: string
}

export type Fragment = {
  id: string
  clientRequestId: string
  content: string
  inputMode: 'text' | 'voice'
  reconnectCheckedAt: string | null
  createdAt: string
}

function toFragment(row: FragmentRecord): Fragment {
  return {
    id: row.id,
    clientRequestId: row.client_request_id,
    content: row.content,
    inputMode: row.input_mode,
    reconnectCheckedAt: row.reconnect_checked_at,
    createdAt: row.created_at,
  }
}

type CreateFragmentInput = {
  userId: string
  clientRequestId: string
  content: string
  inputMode: 'text' | 'voice'
}

export class FragmentRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createIdempotent(input: CreateFragmentInput) {
    const { data, error } = await this.client
      .from('fragments')
      .insert({
        user_id: input.userId,
        client_request_id: input.clientRequestId,
        content: input.content,
        input_mode: input.inputMode,
      })
      .select('*')
      .single<FragmentRecord>()

    if (!error && data) return { fragment: toFragment(data), created: true }
    if (error?.code !== '23505') {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to save fragment')
    }

    const existing = await this.client
      .from('fragments')
      .select('*')
      .eq('user_id', input.userId)
      .eq('client_request_id', input.clientRequestId)
      .single<FragmentRecord>()

    if (existing.error || !existing.data) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read saved fragment')
    }

    return { fragment: toFragment(existing.data), created: false }
  }

  async listRecent(userId: string, cursor?: { createdAt: string; id: string }) {
    let query = this.client
      .from('fragments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(21)

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      )
    }

    const { data, error } = await query.returns<FragmentRecord[]>()
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to list fragments')

    const hasMore = data.length > 20
    const rows = data.slice(0, 20)
    return {
      fragments: rows.map(toFragment),
      nextCursor: hasMore && rows.length ? encodeCursor(rows.at(-1)!) : null,
    }
  }
}

export function encodeCursor(fragment: Pick<FragmentRecord, 'created_at' | 'id'>) {
  return Buffer.from(JSON.stringify({ createdAt: fragment.created_at, id: fragment.id })).toString(
    'base64url',
  )
}

export function decodeCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { createdAt?: unknown }).createdAt === 'string' &&
      typeof (parsed as { id?: unknown }).id === 'string' &&
      !Number.isNaN(Date.parse((parsed as { createdAt: string }).createdAt)) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        (parsed as { id: string }).id,
      )
    ) {
      return parsed as { createdAt: string; id: string }
    }
  } catch {}

  throw new ApiError(400, 'INVALID_INPUT', 'Invalid cursor')
}
