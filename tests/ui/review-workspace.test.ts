import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('cross-thought review workspace', () => {
  it('is a history child view instead of another writing or chat surface', async () => {
    const page = await readFile('app/review/page.tsx', 'utf8')
    const navigation = await readFile('src/components/thoughts/thought-navigation.tsx', 'utf8')
    const workspace = await readFile('src/components/review/review-workspace.tsx', 'utf8')

    expect(page).toContain('<ThoughtNavigation')
    expect(page).toContain('activeView="review"')
    expect(page).toContain('<ReviewWorkspace initialData={initialReview} />')
    expect(navigation).toContain('href="/review"')
    expect(navigation).toContain("activeView === 'review' ? 'page' : undefined")
    expect(navigation).toContain('<span>回看</span>')
    expect(workspace).toContain('以前的想法')
    expect(workspace).toContain('id="review-title">回看')
    expect(workspace).not.toContain('<textarea')
    expect(workspace).not.toContain('contentEditable')
    expect(workspace).not.toContain('写在这里')
  })

  it('renders the first review page from parallel server data without hydration requests', async () => {
    const page = await readFile('app/review/page.tsx', 'utf8')
    const workspace = await readFile('src/components/review/review-workspace.tsx', 'utf8')

    expect(page).toContain('const initialReviewPromise = Promise.all([')
    expect(page).toContain("connections.listForReview(userId, 'pending')")
    expect(page).toContain("connections.countForReview(userId, 'pending')")
    expect(page).toContain("connections.listForReview(userId, 'confirmed')")
    expect(page).toContain('collections.list(userId)')
    expect(page).toContain('<ReviewWorkspace initialData={initialReview} />')
    expect(workspace).toContain('useState<ReviewPreference | null>(initialData?.preference ?? null)')
    expect(workspace).toContain("useState(initialData ? '' : '没有加载完成，可以重试。')")
    expect(workspace).not.toContain('queueMicrotask(() => void load())')
  })

  it('keeps cross-thought processing explicit and off until the user opts in', async () => {
    const workspace = await readFile('src/components/review/review-workspace.tsx', 'utf8')
    const route = await readFile('app/api/review/scan/route.ts', 'utf8')

    expect(workspace).toContain('串联已有想法')
    expect(workspace).toContain('开启并开始串联')
    expect(workspace).toContain('开始串联')
    expect(workspace).toContain('关闭回看')
    expect(workspace).toContain("fetch('/api/review/preference'")
    expect(workspace).toContain("fetch('/api/review/scan', { method: 'POST' })")
    expect(workspace).toContain('最多20条最近想法的开头片段')
    expect(workspace).toContain('最多3条有依据的联系')
    expect(workspace).toContain('不改写，也不自动保留')
    expect(workspace).toContain('setEnabled(true, true)')
    expect(workspace).toContain('if (!preference || preferencePendingRef.current) return')
    expect(workspace).toContain('if (scanningRef.current) return')
    expect(workspace).toContain("payload.data.status === 'persistence-failed'")
    expect(workspace).toContain('这次找到的联系没有保存，可以重试。')
    expect(route).toContain('.scanExistingThoughts(user.id)')
    expect(workspace).toContain('preference.enabled || hasReviewContent')
    expect(workspace).toContain('pending.items.length > 0 || pendingCount > 0')
    expect(workspace).toContain('pendingData.pendingCount ?? pendingData.connections!.length')
  })

  it('anchors every candidate in two original entries and leaves the decision to the user', async () => {
    const workspace = await readFile('src/components/review/review-workspace.tsx', 'utf8')

    expect(workspace).toContain('后来写的')
    expect(workspace).toContain('更早写的')
    expect(workspace).toContain('#entry-${connection.source.entryId}')
    expect(workspace).toContain('#entry-${connection.target.entryId}')
    expect(workspace).toContain("onDecide('confirmed')")
    expect(workspace).toContain("onDecide('rejected')")
    expect(workspace).toContain(": '保留'}")
    expect(workspace).toContain('>忽略<')
    expect(workspace).toContain('已保留')
  })

  it('uses a restrained responsive layout without a forced glass treatment', async () => {
    const css = await readFile('src/components/review/review-workspace.module.css', 'utf8')

    expect(css).toContain('@media (max-width: 620px)')
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.pair \{[\s\S]*grid-template-columns: 1fr/)
    expect(css).not.toContain('backdrop-filter')
    expect(css).not.toContain('linear-gradient')
  })
})
