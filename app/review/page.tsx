import { redirect } from 'next/navigation'
import { AppHeader } from '@/src/components/app-header'
import { ReviewWorkspace } from '@/src/components/review/review-workspace'
import { ThoughtNavigation } from '@/src/components/thoughts/thought-navigation'
import { ApiError } from '@/src/lib/api-error'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
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
      <div className="thought-layout">
        <ThoughtNavigation
          activeThoughtId=""
          activeView="review"
          currentStarted
          initialNextCursor={recent.nextCursor}
          thoughts={recent.thoughts}
        />
        <section className="thought-main" aria-label="回看以前的想法">
          <ReviewWorkspace />
        </section>
      </div>
    </main>
  )
}
