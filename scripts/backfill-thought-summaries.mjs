import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
})

const batchSize = 25
let updated = 0
let withoutUserContent = 0

while (true) {
  const { data: thoughts, error: thoughtsError } = await client
    .from('thoughts')
    .select('id,user_id')
    .is('summary_content', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(batchSize)

  if (thoughtsError) throw thoughtsError
  if (!thoughts?.length) break

  let changedThisBatch = 0
  for (const thought of thoughts) {
    const { data: entry, error: entryError } = await client
      .from('entries')
      .select('content,entry_type,source_label')
      .eq('user_id', thought.user_id)
      .eq('thought_id', thought.id)
      .neq('entry_type', 'ai')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (entryError) throw entryError
    const summary = entry?.content?.trim().slice(0, 500)
    if (!entry || !summary) {
      withoutUserContent += 1
      const { error: markerError } = await client
        .from('thoughts')
        .update({ summary_content: '以前的想法', summary_entry_type: 'user' })
        .eq('user_id', thought.user_id)
        .eq('id', thought.id)
        .is('summary_content', null)
      if (markerError) throw markerError
      changedThisBatch += 1
      continue
    }

    const { error: updateError } = await client
      .from('thoughts')
      .update({
        summary_content: summary,
        summary_entry_type: entry.entry_type,
        summary_source_label: entry.source_label,
      })
      .eq('user_id', thought.user_id)
      .eq('id', thought.id)
      .is('summary_content', null)

    if (updateError) throw updateError
    changedThisBatch += 1
  }

  updated += changedThisBatch
  if (changedThisBatch === 0) break
}

console.log(JSON.stringify({ updated, withoutUserContent }))
