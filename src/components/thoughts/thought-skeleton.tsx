import { ThoughtLayout } from './thought-layout'

type ThoughtSkeletonProps = {
  label?: string
}

export function ThoughtSkeleton({ label = '正在打开内容' }: ThoughtSkeletonProps = {}) {
  return (
    <ThoughtLayout className="thought-skeleton">
      <aside className="thought-sidebar" id="thought-sidebar" role="status" aria-busy="true" aria-label={label}>
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-line skeleton-line--short" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </aside>
      <section className="thought-main">
        <div className="skeleton-line skeleton-line--short" />
        <div className="skeleton-line" />
        <div className="skeleton-line skeleton-line--medium" />
        <div className="skeleton-composer" />
      </section>
    </ThoughtLayout>
  )
}
