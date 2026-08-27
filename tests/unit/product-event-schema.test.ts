import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('product event schema', () => {
  it('keeps a fixed, content-free first-party contract', async () => {
    const migration = await readFile(
      'supabase/migrations/20260827110000_product_events.sql',
      'utf8',
    )

    expect(migration).toContain('create table public.product_events')
    expect(migration).toContain('on public.thoughts (user_id, id)')
    expect(migration).toContain('on public.thought_connections (user_id, id)')
    expect(migration).toContain("event_name in ('workspace_active_day', 'review_opened')")
    expect(migration).toContain("event_name = 'review_scan_finished'")
    expect(migration).toContain("event_name = 'connection_opened'")
    expect(migration).toContain("at time zone 'Asia/Shanghai'")
    expect(migration).toContain('generated always as')
    expect(migration).toContain('scan_status is not null')
    expect(migration).toContain('created_count is not null')
    expect(migration).toContain('created_count between 0 and 3')
    expect(migration).toContain('on delete cascade')
    expect(migration).not.toMatch(
      /^\s+(properties|payload|content|email|nickname|ip_address|user_agent|referrer|session_id)\s+\w/im,
    )
  })
})
