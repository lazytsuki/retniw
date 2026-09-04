import { AppHeader } from '@/src/components/app-header'
import { ThoughtSkeleton } from '@/src/components/thoughts/thought-skeleton'

export default function ThoughtLoading() {
  return (
    <main className="app-shell" id="main-content" tabIndex={-1}>
      <AppHeader />
      <ThoughtSkeleton label="正在打开想法" />
    </main>
  )
}
