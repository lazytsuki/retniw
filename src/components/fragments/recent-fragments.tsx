import Link from 'next/link'
import type { CaptureItem } from '@/src/lib/capture/capture-store'
import type { Fragment } from '@/src/server/repositories/fragment-repository'

type RecentFragmentsProps = {
  fragments: Fragment[]
  pendingItems: CaptureItem[]
  retryingId: string | null
  onRetry: (item: CaptureItem) => void
}

export function RecentFragments({
  fragments,
  pendingItems,
  retryingId,
  onRetry,
}: RecentFragmentsProps) {
  if (!fragments.length && !pendingItems.length) return null

  return (
    <section className="recent" aria-labelledby="recent-title">
      <h2 id="recent-title">最近</h2>
      <div className="fragment-list">
        {pendingItems.map((item) => (
          <article className="fragment-card fragment-card--pending" key={item.clientRequestId}>
            <p>{item.content}</p>
            <div className="fragment-meta">
              <span>尚未保存</span>
              <button
                type="button"
                disabled={retryingId === item.clientRequestId}
                onClick={() => onRetry(item)}
              >
                {retryingId === item.clientRequestId ? '正在重试' : '重试'}
              </button>
            </div>
          </article>
        ))}
        {fragments.map((fragment) => (
          <Link className="fragment-card" href={`/fragments/${fragment.id}`} key={fragment.id}>
            <div>
              <p>{fragment.content}</p>
              <time dateTime={fragment.createdAt}>
                {new Intl.DateTimeFormat('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(fragment.createdAt))}
              </time>
            </div>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </Link>
        ))}
      </div>
    </section>
  )
}
