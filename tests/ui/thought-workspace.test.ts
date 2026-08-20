import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseThoughtPosition, thoughtPositionKey } from '@/src/hooks/use-thought-position'
import { isMarkdownContent, markdownToPlainText } from '@/src/lib/markdown'

describe('thought workspace acceptance boundaries', () => {
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
    expect(css).toContain('grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr)')
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.thought-layout[\s\S]*grid-template-columns: 1fr/)
    expect(css).toContain('@media (max-width: 560px)')
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
  })

  it('keeps the import dialog centered independently of the workspace grid', async () => {
    const css = await readFile('src/index.css', 'utf8')
    expect(css).toMatch(/\.import-dialog \{[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*margin: auto;/)
    expect(css).toContain('max-height: calc(100dvh - 32px)')
    expect(css).toContain('overflow-y: auto')
  })
})
