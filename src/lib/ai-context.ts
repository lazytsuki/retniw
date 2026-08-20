export type AiContextEntry = {
  entryType: string
}

export function hasNewUserContext(entries: AiContextEntry[]) {
  const lastAiIndex = entries.findLastIndex((entry) => entry.entryType === 'ai')
  return entries
    .slice(lastAiIndex + 1)
    .some((entry) => entry.entryType === 'user' || entry.entryType === 'import')
}
