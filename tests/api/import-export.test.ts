import { describe, expect, it, vi } from 'vitest'
import { parseImportedText, validateImportedText } from '@/src/lib/import/parse-imported-text'
import { parseEntryInput } from '@/src/server/fragments/parse-fragment-input'
import { createFullExportStream, createThoughtMarkdownStream } from '@/src/server/exports/export-streams'
import type {
  ExportConnection,
  ExportEntry,
  ExportThought,
  ThoughtExportRepository,
} from '@/src/server/repositories/thought-export-repository'

const userId = '018f6f3a-a1c2-47a8-8f1e-700000000001'
const thoughtId = '018f6f3a-a1c2-47a8-8f1e-700000000002'

describe('text import', () => {
  it('keeps Chinese, whitespace and punctuation byte for byte', async () => {
    const content = '  开头保留空格。\n第二行，“标点”也保留。\n'
    const parsed = await parseImportedText(new File([content], '上下文.MD'))
    expect(parsed).toEqual({ content, sourceLabel: '上下文.MD' })
    expect(
      parseEntryInput({ entryType: 'import', content: parsed.content, sourceLabel: null }),
    ).toEqual({ entryType: 'import', content, sourceLabel: null })
  })

  it('rejects unsupported, empty and oversized inputs', async () => {
    await expect(parseImportedText(new File(['text'], 'context.pdf'))).rejects.toThrow('只支持')
    await expect(parseImportedText(new File([' \n '], 'empty.txt'))).rejects.toThrow('不能为空')
    expect(() => validateImportedText('中'.repeat(400_000))).toThrow('1,000,000 字节')
  })
})

describe('streaming export', () => {
  const thought: ExportThought = {
    id: thoughtId,
    createdAt: '2026-08-20T01:00:00.000Z',
    lastActivityAt: '2026-08-20T01:02:00.000Z',
  }
  const entries: ExportEntry[] = Array.from({ length: 501 }, (_, index) => ({
    id: `entry-${index}`,
    thoughtId,
    entryType: index === 0 ? 'import' : 'user',
    content: index === 0 ? '外部原文\n第二行' : `正文 ${index}`,
    sourceLabel: index === 0 ? '来源.md' : null,
    aiAction: null,
    createdAt: new Date(Date.UTC(2026, 7, 20, 1, 0, index)).toISOString(),
  }))
  const confirmed: ExportConnection = {
    id: 'connection-1',
    sourceThoughtId: thoughtId,
    targetThoughtId: 'other-thought',
    sourceEntryId: 'entry-0',
    targetEntryId: 'other-entry',
    rationale: '保留的关系',
    decidedAt: '2026-08-20T01:03:00.000Z',
    createdAt: '2026-08-20T01:02:30.000Z',
  }

  function repository() {
    return {
      listThoughtPage: vi.fn(async (_userId: string, offset: number, limit: number) =>
        [thought].slice(offset, offset + limit),
      ),
      listEntryPage: vi.fn(async (_userId: string, offset: number, limit: number) =>
        entries.slice(offset, offset + limit),
      ),
      listThoughtEntryPage: vi.fn(
        async (_userId: string, _thoughtId: string, offset: number, limit: number) =>
          entries.slice(offset, offset + limit),
      ),
      listConfirmedConnectionPage: vi.fn(
        async (_userId: string, offset: number, limit: number) =>
          [confirmed].slice(offset, offset + limit),
      ),
    } satisfies Pick<
      ThoughtExportRepository,
      'listThoughtPage' | 'listEntryPage' | 'listThoughtEntryPage' | 'listConfirmedConnectionPage'
    >
  }

  it('produces parseable retniw.export.v1 data across page boundaries', async () => {
    const source = repository()
    const text = await new Response(
      createFullExportStream(source, userId, '2026-08-20T02:00:00.000Z'),
    ).text()
    const exported = JSON.parse(text)

    expect(exported.format).toBe('retniw.export.v1')
    expect(exported.entries).toHaveLength(501)
    expect(exported.entries[0].content).toBe('外部原文\n第二行')
    expect(exported.connections).toEqual([confirmed])
    expect(source.listEntryPage).toHaveBeenNthCalledWith(2, userId, 500, 500)
  })

  it('writes stable ids, author, source and original body to Markdown', async () => {
    const source = repository()
    const markdown = await new Response(
      createThoughtMarkdownStream(source, userId, thoughtId, thought.createdAt),
    ).text()

    expect(markdown).toContain(`过程 ID：${thoughtId}`)
    expect(markdown).toContain('条目 ID：entry-0')
    expect(markdown).toContain('作者：导入')
    expect(markdown).toContain('来源：来源.md')
    expect(markdown).toContain('外部原文\n第二行')
    expect(source.listThoughtEntryPage).toHaveBeenNthCalledWith(2, userId, thoughtId, 500, 500)
  })
})
