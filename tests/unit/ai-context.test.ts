import { describe, expect, it } from 'vitest'
import { hasNewUserContext } from '@/src/lib/ai-context'

describe('hasNewUserContext', () => {
  it('allows the first action and requires fresh user context after AI output', () => {
    expect(hasNewUserContext([{ entryType: 'user' }])).toBe(true)
    expect(hasNewUserContext([{ entryType: 'import' }])).toBe(true)
    expect(hasNewUserContext([{ entryType: 'user' }, { entryType: 'ai' }])).toBe(false)
    expect(hasNewUserContext([
      { entryType: 'user' },
      { entryType: 'ai' },
      { entryType: 'user' },
    ])).toBe(true)
  })
})
