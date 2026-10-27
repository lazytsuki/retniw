import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'

const args = ['018f6f3a-a1c2-47a8-8f1e-300000000001', '018f6f3a-a1c2-47a8-8f1e-300000000002', '018f6f3a-a1c2-47a8-8f1e-300000000003'] as const

function repo(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result)
  return { rpc, repository: new ThoughtRepository({ rpc } as unknown as SupabaseClient) }
}

describe('ThoughtRepository.ensureForToken', () => {
  it('calls the atomic database guard', async () => {
    const { rpc, repository } = repo({ data: { thought: { id: args[2], user_id: args[0], last_activity_at: 'x', created_at: 'x' }, created: true }, error: null })
    await expect(repository.ensureForToken(...args)).resolves.toMatchObject({ created: true })
    expect(rpc).toHaveBeenCalledWith('retniw_ensure_token_thought', {
      target_user_id: args[0], target_token_id: args[1], target_thought_id: args[2],
    })
  })

  it.each([
    ['RETNIW_TOKEN_THOUGHT_FORBIDDEN', 403, 'FORBIDDEN'],
    ['RETNIW_THOUGHT_DELETED', 409, 'THOUGHT_DELETED'],
    ['RETNIW_TOKEN_REVOKED', 401, 'UNAUTHENTICATED'],
  ])('maps %s to %i', async (message, status, code) => {
    const { repository } = repo({ data: null, error: { code: 'P0001', message } })
    await expect(repository.ensureForToken(...args)).rejects.toMatchObject({ status, code })
  })
})

describe('personal access token migration', () => {
  it('keeps tokens server-only, hashed, cascading and guarded in one transaction', async () => {
    const sql = await readFile('supabase/migrations/20261027150000_personal_access_tokens.sql', 'utf8')
    expect(sql).toContain("token_hash ~ '^[0-9a-f]{64}$'")
    expect(sql).not.toMatch(/\btoken\s+text\b/)
    expect(sql.match(/enable row level security/g)).toHaveLength(2)
    expect(sql.match(/revoke all on public\.personal_access_token\w* from anon, authenticated/g)).toHaveLength(2)
    expect(sql).toContain('references public.thoughts (id) on delete cascade')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('RETNIW_TOKEN_THOUGHT_FORBIDDEN')
    expect(sql).toMatch(/revoke all on function public\.retniw_ensure_token_thought\(uuid, uuid, uuid\) from public, anon, authenticated/)
    // 新增迁移不改动既有表
    expect(sql).not.toMatch(/alter table public\.(thoughts|entries)\b/)
  })
})
