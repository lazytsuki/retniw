import { redirect } from 'next/navigation'
import { ApiError } from '@/src/lib/api-error'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'
import { ThoughtWorkspace } from '@/src/components/thoughts/thought-workspace'
import { AppHeader } from '@/src/components/app-header'

export const dynamic = 'force-dynamic'

type ThoughtPageProps = { params: Promise<{ id: string }> }

export default async function ThoughtPage({ params }: ThoughtPageProps) {
  const { id } = await params
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
        initialThoughts={recent.thoughts}
        initialNextCursor={recent.nextCursor}
        initialConnections={data.connections}
      />
    </main>
  )
}
