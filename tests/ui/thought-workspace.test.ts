import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseThoughtPosition, thoughtPositionKey } from '@/src/hooks/use-thought-position'
import { isMarkdownContent, markdownToPlainText } from '@/src/lib/markdown'
import { aiOutputForDisplay } from '@/src/lib/ai-output'
import { mergeThoughts } from '@/src/components/thoughts/thought-navigation'
import type { ThoughtSummary } from '@/src/components/thoughts/thought-workspace'

describe('thought workspace acceptance boundaries', () => {
  it('merges more than twenty old ideas without duplicates', () => {
    const summary = (index: number): ThoughtSummary => ({
      id: `thought-${index}`,
      createdAt: new Date(Date.UTC(2026, 7, 20, 0, index)).toISOString(),
      lastActivityAt: new Date(Date.UTC(2026, 7, 20, 0, index)).toISOString(),
      relationCheckedAt: null,
      firstEntry: null,
    })
    const firstPage = Array.from({ length: 20 }, (_, index) => summary(index))
    const nextPage = [summary(19), ...Array.from({ length: 5 }, (_, index) => summary(index + 20))]

    const merged = mergeThoughts(firstPage, nextPage)

    expect(merged).toHaveLength(25)
    expect(merged[0].id).toBe('thought-24')
    expect(merged.at(-1)?.id).toBe('thought-0')
  })

  it('restores only a valid position for the same thought', () => {
    expect(thoughtPositionKey('thought-1')).toBe('retniw:thought-position:thought-1')
    expect(parseThoughtPosition('{"scrollY":320,"selectionStart":4,"selectionEnd":7}')).toEqual({
      scrollY: 320,
      selectionStart: 4,
      selectionEnd: 7,
    })
    expect(parseThoughtPosition('{"scrollY":-1,"selectionStart":0,"selectionEnd":0}')).toBeNull()
    expect(parseThoughtPosition('broken')).toBeNull()
  })

  it('keeps API and export responses outside Service Worker caching', async () => {
    const source = await readFile('public/sw.js', 'utf8')
    const apiGuard = source.indexOf("url.pathname.startsWith('/api/')")
    const navigationHandler = source.indexOf("request.mode === 'navigate'")
    expect(apiGuard).toBeGreaterThan(-1)
    expect(apiGuard).toBeLessThan(navigationHandler)
    expect(source).not.toContain("cache.put('/api")
  })

  it('has both desktop and mobile workspace layouts', async () => {
    const css = await readFile('src/index.css', 'utf8')
    expect(css).toContain('grid-template-columns: minmax(230px, 280px) minmax(0, 1fr)')
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.thought-layout[\s\S]*grid-template-columns: 1fr/)
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.mobile-workspace-nav[\s\S]*display: flex/)
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.mobile-workspace-nav \{[\s\S]*position: sticky/)
    expect(css).toContain('@media (max-width: 560px)')
  })

  it('keeps page chrome and action groups inside narrow mobile viewports', async () => {
    const css = await readFile('src/index.css', 'utf8')
    expect(css).toMatch(/\.app-shell \{[\s\S]*width: 100%;[\s\S]*max-width: 1440px;/)
    expect(css).toMatch(/\.app-header \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/)
    expect(css).toContain('padding-bottom: calc(128px + env(safe-area-inset-bottom))')
    expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*\.thinking-assist/)
    expect(css).not.toContain('grid-template-columns: minmax(420px, 0.92fr)')
    expect(css).not.toContain('grid-template-columns: minmax(0, 1.05fr) minmax(400px, 0.95fr)')
  })

  it('renders AI and Markdown imports as Markdown without formatting user text', async () => {
    const workspace = await readFile('src/components/thoughts/thought-workspace.tsx', 'utf8')
    const entryContent = await readFile('src/components/thoughts/entry-content.tsx', 'utf8')
    expect(workspace).toContain('isMarkdownContent(entry.entryType, entry.sourceLabel)')
    expect(entryContent).toContain('react-markdown')
    expect(entryContent).toContain('remark-gfm')
    expect(entryContent).toContain('entry-content--plain')
    expect(isMarkdownContent('ai', null)).toBe(true)
    expect(isMarkdownContent('import', 'notes.md')).toBe(true)
    expect(isMarkdownContent('import', 'notes.txt')).toBe(false)
    expect(isMarkdownContent('user', null)).toBe(false)
    expect(markdownToPlainText('# 标题\n\n这是 **粗体**。\n\n- 第一项')).toBe('标题 这是 粗体。 第一项')
    expect(aiOutputForDisplay('可以继续写：当时发生了什么？', 'advance')).toBe('当时发生了什么？')
    expect(aiOutputForDisplay('原样保留', 'organize')).toBe('原样保留')
  })

  it('keeps the import dialog centered independently of the workspace grid', async () => {
    const css = await readFile('src/index.css', 'utf8')
    expect(css).toMatch(/\.import-dialog \{[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*margin: auto;/)
    expect(css).toContain('max-height: calc(100dvh - 32px)')
    expect(css).toContain('overflow-y: auto')
  })

  it('presents one natural product path and separates actions by user intent', async () => {
    const capturePage = await readFile('app/page.tsx', 'utf8')
    const header = await readFile('src/components/app-header.tsx', 'utf8')
    const navigation = await readFile('src/components/thoughts/thought-navigation.tsx', 'utf8')
    const workspace = await readFile('src/components/thoughts/thought-workspace.tsx', 'utf8')
    const assist = await readFile('src/components/thoughts/thinking-assist.tsx', 'utf8')
    const menu = await readFile('src/components/thoughts/thought-menu.tsx', 'utf8')
    const provider = await readFile('src/server/ai/deepseek-text-provider.ts', 'utf8')

    expect(header).not.toContain('back-link')
    expect(header).not.toContain('href="/"')
    expect(header).toContain('account-menu')
    expect(navigation).toContain('写新想法')
    expect(navigation).toContain('以前的想法')
    expect(navigation).not.toContain('当前想法')
    expect(navigation).toContain('看看有没有联系')
    expect(navigation).toContain("/api/thoughts?cursor=")
    expect(navigation).toContain("sessionStorage.setItem(explicitNewThoughtKey, '1')")
    expect(navigation).toContain("timeZone: 'Asia/Shanghai'")
    expect(navigation).toContain('prefetch={false}')
    expect(workspace).toContain('写下你正在想的。')
    expect(workspace).toMatch(/entries\.length > 0 && \([\s\S]*<ThinkingAssist/)
    expect(workspace).toContain('if (item.thoughtId !== thoughtId) return')
    expect(workspace).toContain('if (explicitlyStartedNewThought) return')
    expect(workspace).not.toContain('void checkRelation(item.thoughtId)')
    expect(assist).toContain('帮我接着想')
    expect(assist).not.toContain("action: 'question'")
    expect(assist).not.toContain("action: 'organize'")
    expect(menu).toContain('整理内容')
    expect(provider).not.toContain('第一句以“可以继续写：”开头')
    expect(capturePage).toContain('key="new-thought"')
  })

  it('keeps the header visually quiet instead of forcing a glass bar', async () => {
    const css = await readFile('src/index.css', 'utf8')
    const headerRule = css.match(/\.app-header \{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(headerRule).not.toContain('position: sticky')
    expect(headerRule).not.toContain('backdrop-filter')
    expect(headerRule).not.toContain('border:')
    expect(headerRule).not.toContain('background:')
  })

  it('keeps the desktop history column vertically scrollable without horizontal clipping', async () => {
    const css = await readFile('src/index.css', 'utf8')
    const sidebarRule = css.match(/\.thought-sidebar \{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(sidebarRule).toContain('overflow-x: hidden')
    expect(sidebarRule).toContain('overflow-y: auto')
    expect(css).not.toMatch(/\.thought-link:hover \{[\s\S]*?translateX/)
  })

  it('uses the public domain as the beta entry', async () => {
    const readme = await readFile('README.md', 'utf8')
    expect(readme).toContain('https://retniw.cn')
    expect(readme).toContain('retniw.vercel.app')
    expect(readme).toContain('永久跳转')
  })
})
