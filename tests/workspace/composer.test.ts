import { describe, expect, it } from 'vitest'
import { shouldSubmitThought, thoughtComposerCopy } from '@/src/components/thoughts/thought-composer'

describe('thought composer keyboard behavior', () => {
  it('uses different copy for a new idea and the current idea', () => {
    expect(thoughtComposerCopy(false)).toEqual({
      ariaLabel: '写在这里',
      placeholder: '从这里开始写',
    })
    expect(thoughtComposerCopy(true)).toEqual({
      ariaLabel: '继续写',
      placeholder: '补充一个新的点，或继续刚才的思路',
    })
  })

  it('submits with Enter for a precise pointer', () => {
    expect(
      shouldSubmitThought({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 }),
    ).toBe(true)
  })

  it('keeps Return as a newline for coarse-pointer mobile input', () => {
    expect(
      shouldSubmitThought({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 }, true),
    ).toBe(false)
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
