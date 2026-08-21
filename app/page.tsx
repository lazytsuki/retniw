import { redirect } from 'next/navigation'
import { ApiError } from '@/src/lib/api-error'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'
import { ThoughtWorkspace } from '@/src/components/thoughts/thought-workspace'
import { AppHeader } from '@/src/components/app-header'

export const dynamic = 'force-dynamic'

export default async function CapturePage() {
  let userId = ''
  try {
    userId = (await requireUser()).id
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/login')
    throw error
  }

  const recent = await new ThoughtRepository(createServiceClient()).listRecent(userId)

  return (
    <main className="app-shell">
      <AppHeader />
      <ThoughtWorkspace
        key="new-thought"
        initialThought={null}
        initialEntries={[]}
        initialThoughts={recent.thoughts}
        initialNextCursor={recent.nextCursor}
        initialConnections={[]}
      />
    </main>
  )
}
