import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const PRODUCT_METRICS_TIME_ZONE = 'Asia/Shanghai'

function deterministicUuid(value) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function localDay(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PRODUCT_METRICS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function localTimestamp(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: PRODUCT_METRICS_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(value))
}

function unique(rows, field = 'user_id') {
  return new Set(rows.map((row) => row[field])).size
}

function percent(numerator, denominator) {
  return denominator ? Number((numerator * 100 / denominator).toFixed(1)) : null
}

export function buildProductMetricsSnapshot(input, now = new Date()) {
  const productEvents = input.productEvents ?? []
  const activeThoughtIds = new Set(
    input.thoughts.filter((row) => row.deleted_at === null).map((row) => row.id),
  )
  const legacyHumanIds = new Set([
    ...input.fragments.map((row) => row.client_request_id),
    ...input.answeredClarifications.map((row) => deterministicUuid(`${row.id}:answer`)),
  ])
  const legacyAiIds = new Set(input.clarifications.map((row) => row.id))
  const legacyConnectionIds = new Set(input.legacyConnections.map((row) => row.id))

  const contentEntries = input.entries.filter((row) => (
    activeThoughtIds.has(row.thought_id) &&
    (row.entry_type === 'user' || row.entry_type === 'import') &&
    !legacyHumanIds.has(row.id)
  ))
  const userEntries = contentEntries.filter((row) => row.entry_type === 'user')
  const importEntries = contentEntries.filter((row) => row.entry_type === 'import')
  const aiEntries = input.entries.filter((row) => (
    activeThoughtIds.has(row.thought_id) &&
    row.entry_type === 'ai' &&
    !legacyAiIds.has(row.id)
  ))
  const checkpoints = input.checkpoints.filter((row) => activeThoughtIds.has(row.thought_id))
  const connections = input.connections.filter((row) => (
    activeThoughtIds.has(row.source_thought_id) &&
    activeThoughtIds.has(row.target_thought_id) &&
    !legacyConnectionIds.has(row.id)
  ))

  const usersWithContent = new Set(contentEntries.map((entry) => entry.user_id))
  const firstUserEntryByUser = new Map()
  const daysByUser = new Map()
  const entriesByUserThought = new Map()
  for (const entry of userEntries) {
    const firstEntry = firstUserEntryByUser.get(entry.user_id)
    if (!firstEntry || new Date(entry.created_at) < new Date(firstEntry.created_at)) {
      firstUserEntryByUser.set(entry.user_id, entry)
    }
    if (!daysByUser.has(entry.user_id)) daysByUser.set(entry.user_id, new Set())
    daysByUser.get(entry.user_id).add(localDay(entry.created_at))
    const pairKey = `${entry.user_id}|${entry.thought_id}`
    if (!entriesByUserThought.has(pairKey)) entriesByUserThought.set(pairKey, [])
    entriesByUserThought.get(pairKey).push(entry)
  }

  const writingDayDistribution = { one_day: 0, two_days: 0, three_plus_days: 0 }
  for (const days of daysByUser.values()) {
    if (days.size === 1) writingDayDistribution.one_day += 1
    else if (days.size === 2) writingDayDistribution.two_days += 1
    else if (days.size >= 3) writingDayDistribution.three_plus_days += 1
  }

  const repeatedThoughtUsers = new Set()
  const crossDayThoughtUsers = new Set()
  for (const entries of entriesByUserThought.values()) {
    if (entries.length >= 2) repeatedThoughtUsers.add(entries[0].user_id)
    if (new Set(entries.map((entry) => localDay(entry.created_at))).size >= 2) {
      crossDayThoughtUsers.add(entries[0].user_id)
    }
  }

  let matureAccounts = 0
  let matureAccountsActivated = 0
  let recentAccounts = 0
  let recentAccountsActivated = 0
  for (const user of input.users) {
    const firstEntry = firstUserEntryByUser.get(user.id)
    const firstWriteDelay = firstEntry
      ? new Date(firstEntry.created_at).getTime() - new Date(user.created_at).getTime()
      : null
    if (now.getTime() - new Date(user.created_at).getTime() >= 86_400_000) {
      matureAccounts += 1
      if (firstWriteDelay !== null && firstWriteDelay >= 0 && firstWriteDelay <= 86_400_000) {
        matureAccountsActivated += 1
      }
    } else {
      recentAccounts += 1
      if (firstWriteDelay !== null && firstWriteDelay >= 0 && firstWriteDelay <= 86_400_000) {
        recentAccountsActivated += 1
      }
    }
  }

  let matureWriters = 0
  let matureWritersReturned = 0
  for (const [userId, firstEntry] of firstUserEntryByUser) {
    if (now.getTime() - new Date(firstEntry.created_at).getTime() < 86_400_000) continue
    matureWriters += 1
    if (userEntries.some((entry) => (
      entry.user_id === userId && localDay(entry.created_at) > localDay(firstEntry.created_at)
    ))) {
      matureWritersReturned += 1
    }
  }

  const aiActions = {}
  for (const entry of aiEntries) {
    const action = entry.ai_action ?? 'unknown'
    if (!aiActions[action]) aiActions[action] = { entries: 0, users: new Set() }
    aiActions[action].entries += 1
    aiActions[action].users.add(entry.user_id)
  }
  const aiByAction = Object.fromEntries(
    Object.entries(aiActions).map(([action, value]) => [
      action,
      { entries: value.entries, users: value.users.size },
    ]),
  )

  const connectionStatus = { pending: 0, confirmed: 0, rejected: 0 }
  for (const connection of connections) connectionStatus[connection.status] += 1
  const decidedConnections = connections.filter(
    (connection) => connection.status === 'confirmed' || connection.status === 'rejected',
  )
  const confirmedConnections = connections.filter((connection) => connection.status === 'confirmed')
  const confirmedWithLaterContent = confirmedConnections.filter((connection) => (
    connection.decided_at && userEntries.some((entry) => (
      entry.user_id === connection.user_id &&
      (entry.thought_id === connection.source_thought_id ||
        entry.thought_id === connection.target_thought_id) &&
      new Date(entry.created_at) > new Date(connection.decided_at)
    ))
  ))

  const cutoff7d = new Date(now.getTime() - 7 * 86_400_000)
  const recentContentEntries = contentEntries.filter(
    (entry) => new Date(entry.created_at) >= cutoff7d,
  )
  const recentUserEntries = userEntries.filter((entry) => new Date(entry.created_at) >= cutoff7d)
  const recentImportEntries = importEntries.filter(
    (entry) => new Date(entry.created_at) >= cutoff7d,
  )
  const recentAiEntries = aiEntries.filter((entry) => new Date(entry.created_at) >= cutoff7d)
  const recentConnections = connections.filter(
    (connection) => new Date(connection.created_at) >= cutoff7d,
  )
  const workspaceEvents = productEvents.filter(
    (event) => event.event_name === 'workspace_active_day',
  )
  const reviewOpenedEvents = productEvents.filter((event) => event.event_name === 'review_opened')
  const scanEvents = productEvents.filter(
    (event) => event.event_name === 'review_scan_finished',
  )
  const connectionOpenedEvents = productEvents.filter(
    (event) => event.event_name === 'connection_opened',
  )
  const scanStatus = {
    disabled: 0,
    'not-enough-content': 0,
    processed: 0,
    'provider-failed': 0,
    'persistence-failed': 0,
  }
  for (const event of scanEvents) scanStatus[event.scan_status] += 1

  const openedConnections = new Set(
    connectionOpenedEvents.map((event) => event.connection_id).filter(Boolean),
  )
  const matureConnectionOpeners = new Set()
  const continuedConnectionOpeners = new Set()
  for (const event of connectionOpenedEvents) {
    const occurredAt = new Date(event.occurred_at)
    if (now.getTime() - occurredAt.getTime() < 7 * 86_400_000) continue
    matureConnectionOpeners.add(event.user_id)
    if (userEntries.some((entry) => (
      entry.user_id === event.user_id &&
      entry.thought_id === event.thought_id &&
      new Date(entry.created_at) > occurredAt &&
      new Date(entry.created_at).getTime() <= occurredAt.getTime() + 7 * 86_400_000
    ))) {
      continuedConnectionOpeners.add(event.user_id)
    }
  }
  const recentProductEvents = productEvents.filter(
    (event) => new Date(event.occurred_at) >= cutoff7d,
  )

  return {
    snapshot_at: now.toISOString(),
    snapshot_at_asia_shanghai: localTimestamp(now),
    timezone_for_natural_days: PRODUCT_METRICS_TIME_ZONE,
    current_product: {
      registered_accounts: input.users.length,
      accounts_with_content: usersWithContent.size,
      accounts_without_content: input.users.length - usersWithContent.size,
      user_writers: unique(userEntries),
      import_users: unique(importEntries),
      user_entries: userEntries.length,
      import_entries: importEntries.length,
      user_or_import_entries: contentEntries.length,
      thoughts_with_content: new Set(contentEntries.map((entry) => entry.thought_id)).size,
      activation_24h: {
        mature_accounts: matureAccounts,
        activated: matureAccountsActivated,
        rate_pct: percent(matureAccountsActivated, matureAccounts),
        recent_accounts_incomplete: recentAccounts,
        recent_accounts_already_activated: recentAccountsActivated,
      },
      return_writing: {
        writing_day_distribution: writingDayDistribution,
        writers_with_first_write_at_least_24h_old: matureWriters,
        returned_on_later_shanghai_day: matureWritersReturned,
        users_with_2plus_entries_in_same_thought: repeatedThoughtUsers.size,
        users_with_cross_day_same_thought: crossDayThoughtUsers.size,
      },
      ai: {
        saved_outputs: aiEntries.length,
        users: unique(aiEntries),
        by_action: aiByAction,
      },
      checkpoint: {
        count: checkpoints.length,
        users: unique(checkpoints),
      },
      review_preference: {
        enabled_users: unique(input.preferences.filter((row) => row.enabled)),
        disabled_users_with_row: unique(input.preferences.filter((row) => !row.enabled)),
      },
      connections: {
        candidates: connections.length,
        users: unique(connections),
        by_status: connectionStatus,
        decided: decidedConnections.length,
        decision_rate_pct: percent(decidedConnections.length, connections.length),
        confirmed_share_of_decided_pct: percent(
          confirmedConnections.length,
          decidedConnections.length,
        ),
        confirmed_with_later_content: confirmedWithLaterContent.length,
        users_with_later_content: unique(confirmedWithLaterContent),
      },
      product_events: {
        collection_started: input.productEventsAvailable ?? false,
        workspace_active_day: {
          rows: workspaceEvents.length,
          users: unique(workspaceEvents),
        },
        review_opened: {
          rows: reviewOpenedEvents.length,
          users: unique(reviewOpenedEvents),
        },
        review_scan_finished: {
          rows: scanEvents.length,
          users: unique(scanEvents),
          by_status: scanStatus,
          created_candidates: scanEvents.reduce(
            (total, event) => total + (event.created_count ?? 0),
            0,
          ),
        },
        connection_opened: {
          rows: connectionOpenedEvents.length,
          users: unique(connectionOpenedEvents),
          connections: openedConnections.size,
          users_with_complete_7d_observation: matureConnectionOpeners.size,
          users_who_continued_within_7d: continuedConnectionOpeners.size,
        },
      },
      rolling_7d: {
        signups: input.users.filter((user) => new Date(user.created_at) >= cutoff7d).length,
        content_users: unique(recentContentEntries),
        writers: unique(recentUserEntries),
        user_entries: recentUserEntries.length,
        import_users: unique(recentImportEntries),
        import_entries: recentImportEntries.length,
        user_or_import_entries: recentContentEntries.length,
        ai_users: unique(recentAiEntries),
        ai_outputs: recentAiEntries.length,
        connection_users: unique(recentConnections),
        connection_candidates: recentConnections.length,
        workspace_active_users: unique(
          recentProductEvents.filter((event) => event.event_name === 'workspace_active_day'),
        ),
        review_opened_users: unique(
          recentProductEvents.filter((event) => event.event_name === 'review_opened'),
        ),
        connection_opened_users: unique(
          recentProductEvents.filter((event) => event.event_name === 'connection_opened'),
        ),
      },
    },
    excluded_legacy_migration_rows: {
      user_or_import_entries: input.entries.filter((row) => legacyHumanIds.has(row.id)).length,
      ai_entries: input.entries.filter((row) => legacyAiIds.has(row.id)).length,
      connections: input.connections.filter((row) => legacyConnectionIds.has(row.id)).length,
    },
  }
}

async function retryRead(label, operation) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await operation()
    if (!result.error) return result
    if (result.error.code !== 'PGRST303' || attempt === 4) {
      throw new Error(`${label}: ${result.error.code} ${result.error.message}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1_200))
  }
}

async function readAll(client, table, fields, orderColumn = 'id', apply = (query) => query) {
  const rows = []
  for (let from = 0; ; from += 1_000) {
    const result = await retryRead(table, () => {
      let query = apply(client.from(table).select(fields)).range(from, from + 999)
      if (orderColumn) query = query.order(orderColumn, { ascending: true })
      return query
    })
    rows.push(...result.data)
    if (result.data.length < 1_000) return rows
  }
}

async function readOptional(client, table, fields, orderColumn = 'id', apply) {
  try {
    return await readAll(client, table, fields, orderColumn, apply)
  } catch (error) {
    if (error instanceof Error && /PGRST205|42P01/.test(error.message)) return []
    throw error
  }
}

async function readOptionalWithAvailability(client, table, fields, orderColumn = 'id') {
  try {
    return {
      available: true,
      rows: await readAll(client, table, fields, orderColumn),
    }
  } catch (error) {
    if (error instanceof Error && /PGRST205|42P01/.test(error.message)) {
      return { available: false, rows: [] }
    }
    throw error
  }
}

async function readAuthUsers(client) {
  const users = []
  for (let page = 1; ; page += 1) {
    let result
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      result = await client.auth.admin.listUsers({ page, perPage: 1_000 })
      if (!result.error) break
      if (attempt === 4) throw new Error(`auth.users: ${result.error.message}`)
      await new Promise((resolve) => setTimeout(resolve, 1_200))
    }
    users.push(...result.data.users.map((user) => ({ id: user.id, created_at: user.created_at })))
    if (result.data.users.length < 1_000) return users
  }
}

export async function loadProductMetricsData(client) {
  const [
    users,
    thoughts,
    entries,
    fragments,
    clarifications,
    answeredClarifications,
    checkpoints,
    preferences,
    connections,
    legacyConnections,
    productEventsResult,
  ] = await Promise.all([
    readAuthUsers(client),
    readAll(client, 'thoughts', 'id,user_id,deleted_at'),
    readAll(client, 'entries', 'id,user_id,thought_id,entry_type,ai_action,created_at'),
    readOptional(client, 'fragments', 'id,client_request_id'),
    readOptional(client, 'clarifications', 'id'),
    readOptional(
      client,
      'clarifications',
      'id,answered_at',
      'id',
      (query) => query.not('answer', 'is', null).not('answered_at', 'is', null),
    ),
    readAll(client, 'thought_checkpoints', 'id,user_id,thought_id,created_at'),
    readAll(client, 'user_review_preferences', 'user_id,enabled,updated_at', 'user_id'),
    readAll(
      client,
      'thought_connections',
      'id,user_id,source_thought_id,target_thought_id,status,decided_at,created_at',
    ),
    readOptional(client, 'connections', 'id'),
    readOptionalWithAvailability(
      client,
      'product_events',
      'id,user_id,event_name,occurred_at,event_day,thought_id,connection_id,scan_status,created_count',
    ),
  ])
  return {
    users,
    thoughts,
    entries,
    fragments,
    clarifications,
    answeredClarifications,
    checkpoints,
    preferences,
    connections,
    legacyConnections,
    productEvents: productEventsResult.rows,
    productEventsAvailable: productEventsResult.available,
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase server environment variables')
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  })
  const data = await loadProductMetricsData(client)
  console.log(JSON.stringify(buildProductMetricsSnapshot(data), null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
