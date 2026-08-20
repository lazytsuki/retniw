export function isMarkdownContent(entryType: string, sourceLabel: string | null) {
  return entryType === 'ai' || (entryType === 'import' && /\.md$/i.test(sourceLabel ?? ''))
}

export function markdownToPlainText(content: string) {
  return content
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
