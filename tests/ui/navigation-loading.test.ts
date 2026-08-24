import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('navigation loading', () => {
  it('shows the existing workspace skeleton while thought and review routes open', async () => {
    const skeleton = await readFile('src/components/thoughts/thought-skeleton.tsx', 'utf8')
    const thoughtLoading = await readFile('app/thoughts/[id]/loading.tsx', 'utf8')
    const reviewLoading = await readFile('app/review/loading.tsx', 'utf8')

    expect(skeleton).toContain('role="status"')
    expect(skeleton).toContain('aria-busy="true"')
    expect(skeleton).toContain("label = '正在打开内容'")
    expect(thoughtLoading).toContain('<ThoughtSkeleton label="正在打开想法" />')
    expect(reviewLoading).toContain('<ThoughtSkeleton label="正在打开回看" />')
  })

  it('prefetches only the intended thought without enabling viewport prefetch', async () => {
    const listItem = await readFile('src/components/thoughts/thought-list-item.tsx', 'utf8')

    expect(listItem).toContain("const href = `/thoughts/${thought.id}`")
    expect(listItem).toContain('prefetch={false}')
    expect(listItem).toContain('router.prefetch(href)')
    expect(listItem).toContain('prefetchedHref.current === href')
    expect(listItem).toContain('onMouseEnter={prefetchThought}')
    expect(listItem).toContain('onPointerEnter={prefetchThought}')
    expect(listItem).toContain('onFocus={prefetchThought}')
    expect(listItem).toContain('onTouchStart={prefetchThought}')
  })
})
