export function ThoughtSkeleton() {
  return (
    <div className="thought-layout thought-skeleton" aria-busy="true" aria-label="正在打开内容">
      <aside className="thought-sidebar">
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
    </div>
  )
}
