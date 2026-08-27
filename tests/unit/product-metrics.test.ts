import { describe, expect, it } from 'vitest'
// @ts-expect-error The report is a directly executable Node module.
import { buildProductMetricsSnapshot } from '@/scripts/report-product-metrics.mjs'

const ids = {
  user: '018f6f3a-a1c2-47a8-8f1e-710000000001',
  recentUser: '018f6f3a-a1c2-47a8-8f1e-710000000002',
  idleUser: '018f6f3a-a1c2-47a8-8f1e-710000000003',
  thought: '018f6f3a-a1c2-47a8-8f1e-710000000004',
  otherThought: '018f6f3a-a1c2-47a8-8f1e-710000000005',
  legacyThought: '018f6f3a-a1c2-47a8-8f1e-710000000006',
  firstEntry: '018f6f3a-a1c2-47a8-8f1e-710000000007',
  secondEntry: '018f6f3a-a1c2-47a8-8f1e-710000000008',
  recentEntry: '018f6f3a-a1c2-47a8-8f1e-710000000009',
  aiEntry: '018f6f3a-a1c2-47a8-8f1e-710000000010',
  legacyRequest: '018f6f3a-a1c2-47a8-8f1e-710000000011',
  checkpoint: '018f6f3a-a1c2-47a8-8f1e-710000000012',
  connection: '018f6f3a-a1c2-47a8-8f1e-710000000013',
  legacyConnection: '018f6f3a-a1c2-47a8-8f1e-710000000014',
  legacyAi: '018f6f3a-a1c2-47a8-8f1e-710000000015',
}

function fixture() {
  return {
    users: [
      { id: ids.user, created_at: '2026-08-20T00:00:00.000Z' },
      { id: ids.recentUser, created_at: '2026-08-26T20:00:00.000Z' },
      { id: ids.idleUser, created_at: '2026-08-20T00:00:00.000Z' },
    ],
    thoughts: [
      { id: ids.thought, user_id: ids.user, deleted_at: null },
      { id: ids.otherThought, user_id: ids.recentUser, deleted_at: null },
      { id: ids.legacyThought, user_id: ids.user, deleted_at: null },
    ],
    entries: [
      {
        id: ids.firstEntry,
        user_id: ids.user,
        thought_id: ids.thought,
        entry_type: 'user',
        ai_action: null,
        created_at: '2026-08-20T01:00:00.000Z',
      },
      {
        id: ids.secondEntry,
        user_id: ids.user,
        thought_id: ids.thought,
        entry_type: 'user',
        ai_action: null,
        created_at: '2026-08-21T01:00:00.000Z',
      },
      {
        id: ids.recentEntry,
        user_id: ids.recentUser,
        thought_id: ids.otherThought,
        entry_type: 'import',
        ai_action: null,
        created_at: '2026-08-26T21:00:00.000Z',
      },
      {
        id: ids.aiEntry,
        user_id: ids.user,
        thought_id: ids.thought,
        entry_type: 'ai',
        ai_action: 'advance',
        created_at: '2026-08-21T02:00:00.000Z',
      },
      {
        id: ids.legacyRequest,
        user_id: ids.user,
        thought_id: ids.legacyThought,
        entry_type: 'user',
        ai_action: null,
        created_at: '2026-08-19T01:00:00.000Z',
      },
      {
        id: ids.legacyAi,
        user_id: ids.user,
        thought_id: ids.legacyThought,
        entry_type: 'ai',
        ai_action: 'question',
        created_at: '2026-08-19T01:30:00.000Z',
      },
    ],
    fragments: [{ id: ids.legacyThought, client_request_id: ids.legacyRequest }],
    clarifications: [{ id: ids.legacyAi }],
    answeredClarifications: [],
    checkpoints: [{
      id: ids.checkpoint,
      user_id: ids.user,
      thought_id: ids.thought,
      created_at: '2026-08-21T03:00:00.000Z',
    }],
    preferences: [{ user_id: ids.user, enabled: true, updated_at: '2026-08-21T04:00:00.000Z' }],
    connections: [
      {
        id: ids.connection,
        user_id: ids.user,
        source_thought_id: ids.thought,
        target_thought_id: ids.otherThought,
        status: 'confirmed',
        decided_at: '2026-08-20T12:00:00.000Z',
        created_at: '2026-08-20T11:00:00.000Z',
      },
      {
        id: ids.legacyConnection,
        user_id: ids.user,
        source_thought_id: ids.thought,
        target_thought_id: ids.legacyThought,
        status: 'confirmed',
        decided_at: '2026-08-19T02:00:00.000Z',
        created_at: '2026-08-19T01:30:00.000Z',
      },
    ],
    legacyConnections: [{ id: ids.legacyConnection }],
    productEventsAvailable: true,
    productEvents: [
      {
        id: '018f6f3a-a1c2-47a8-8f1e-710000000016',
        user_id: ids.user,
        event_name: 'workspace_active_day',
        occurred_at: '2026-08-21T00:00:00.000Z',
        event_day: '2026-08-21',
        thought_id: null,
        connection_id: null,
        scan_status: null,
        created_count: null,
      },
      {
        id: '018f6f3a-a1c2-47a8-8f1e-710000000017',
        user_id: ids.user,
        event_name: 'review_scan_finished',
        occurred_at: '2026-08-21T00:30:00.000Z',
        event_day: '2026-08-21',
        thought_id: null,
        connection_id: null,
        scan_status: 'processed',
        created_count: 1,
      },
      {
        id: '018f6f3a-a1c2-47a8-8f1e-710000000018',
        user_id: ids.user,
        event_name: 'connection_opened',
        occurred_at: '2026-08-20T12:30:00.000Z',
        event_day: '2026-08-20',
        thought_id: ids.thought,
        connection_id: ids.connection,
        scan_status: null,
        created_count: null,
      },
    ],
  }
}

describe('product metrics report', () => {
  it('reports only aggregate current-product facts with mature cohort denominators', () => {
    const result = buildProductMetricsSnapshot(
      fixture(),
      new Date('2026-08-27T02:00:00.000Z'),
    )

    expect(result.current_product).toMatchObject({
      registered_accounts: 3,
      accounts_with_content: 2,
      accounts_without_content: 1,
      user_writers: 1,
      import_users: 1,
      user_entries: 2,
      import_entries: 1,
      thoughts_with_content: 2,
      activation_24h: {
        mature_accounts: 2,
        activated: 1,
        rate_pct: 50,
        recent_accounts_incomplete: 1,
        recent_accounts_already_activated: 0,
      },
      return_writing: {
        writing_day_distribution: { one_day: 0, two_days: 1, three_plus_days: 0 },
        writers_with_first_write_at_least_24h_old: 1,
        returned_on_later_shanghai_day: 1,
        users_with_2plus_entries_in_same_thought: 1,
        users_with_cross_day_same_thought: 1,
      },
      ai: {
        saved_outputs: 1,
        users: 1,
        by_action: { advance: { entries: 1, users: 1 } },
      },
      connections: {
        candidates: 1,
        decided: 1,
        confirmed_with_later_content: 1,
      },
      product_events: {
        collection_started: true,
        workspace_active_day: { rows: 1, users: 1 },
        review_scan_finished: {
          rows: 1,
          users: 1,
          created_candidates: 1,
        },
        connection_opened: {
          rows: 1,
          users: 1,
          connections: 1,
          users_with_complete_7d_observation: 0,
          users_who_continued_within_7d: 0,
        },
      },
      rolling_7d: {
        content_users: 2,
        writers: 1,
        user_entries: 1,
        import_users: 1,
        import_entries: 1,
      },
    })
    expect(result.excluded_legacy_migration_rows).toEqual({
      user_or_import_entries: 1,
      ai_entries: 1,
      connections: 1,
    })
    expect(JSON.stringify(result)).not.toContain(ids.user)
    expect(JSON.stringify(result)).not.toContain(ids.thought)
  })
})
