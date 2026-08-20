import { describe, expect, it } from 'vitest'
import { shouldSubmitThought } from '@/src/components/thoughts/thought-composer'

describe('thought composer keyboard behavior', () => {
  it('submits with Enter', () => {
    expect(
      shouldSubmitThought({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 }),
    ).toBe(true)
  })

  it.each([
    { key: 'Enter', shiftKey: true, isComposing: false, keyCode: 13 },
    { key: 'Enter', shiftKey: false, isComposing: true, keyCode: 13 },
    { key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 },
    { key: 'a', shiftKey: false, isComposing: false, keyCode: 65 },
  ])('does not submit for a newline or IME composition', (event) => {
    expect(shouldSubmitThought(event)).toBe(false)
  })
})
