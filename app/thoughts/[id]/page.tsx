import { notFound, redirect } from 'next/navigation'
import { ApiError } from '@/src/lib/api-error'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'
import { requireUuid } from '@/src/server/thoughts/parse-thought-management'
import { ThoughtWorkspace } from '@/src/components/thoughts/thought-workspace'
import { AppHeader } from '@/src/components/app-header'

export const dynamic = 'force-dynamic'

type ThoughtPageProps = { params: Promise<{ id: string }> }

export default async function ThoughtPage({ params }: ThoughtPageProps) {
  const { id: rawId } = await params
  let id: string
  try {
    id = requireUuid(rawId, 'id')
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) notFound()
    throw error
  }
  let data: Awaited<ReturnType<ThoughtRepository['getDetail']>>
  let recent: Awaited<ReturnType<ThoughtRepository['listRecent']>>
  try {
    const user = await requireUser()
    const repository = new ThoughtRepository(createServiceClient())
    ;[data, recent] = await Promise.all([
      repository.getDetail(user.id, id),
      repository.listRecent(user.id),
    ])
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/login')
    if (error instanceof ApiError && error.status === 404) {
      return <main className="shell"><p>没有找到这段内容。</p></main>
    }
    throw error
  }

  return (
    <main className="app-shell">
      <AppHeader />
      <ThoughtWorkspace
        key={data.thought.id}
        initialThought={data.thought}
        initialEntries={data.entries}
        initialCheckpoints={data.checkpoints}
        initialThoughts={recent.thoughts}
        initialNextCursor={recent.nextCursor}
      />
    </main>
  )
}
