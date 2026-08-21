export type AiOutputAction = 'advance' | 'question' | 'organize'

const LEGACY_ADVANCE_PREFIX = /^(?:#{1,6}\s*)?可以继续写[：:]\s*/

export function aiOutputForDisplay(content: string, action: AiOutputAction | null) {
  const trimmed = content.trim()
  if (action !== 'advance') return trimmed
  return trimmed.replace(LEGACY_ADVANCE_PREFIX, '').trimStart()
}
