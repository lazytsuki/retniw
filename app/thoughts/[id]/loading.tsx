import { AppHeader } from '@/src/components/app-header'
import { ThoughtSkeleton } from '@/src/components/thoughts/thought-skeleton'

export default function ThoughtLoading() {
  return (
    <main className="app-shell">
      <AppHeader back />
      <ThoughtSkeleton />
    </main>
  )
}
