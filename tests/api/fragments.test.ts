import { describe, expect, it } from 'vitest'
import { ApiError } from '@/src/lib/api-error'
import { parseFragmentInput } from '@/src/server/fragments/parse-fragment-input'
import { decodeCursor, encodeCursor } from '@/src/server/repositories/fragment-repository'

const validInput = {
  clientRequestId: '80b7de19-beda-46ec-947b-21c7d91430b9',
  content: '还没有成形的想法',
  inputMode: 'text',
}

describe('fragment API input', () => {
  it('accepts the fragment contract without changing the original content', () => {
    expect(parseFragmentInput(validInput)).toEqual(validInput)
  })

  it.each([
    null,
    { ...validInput, clientRequestId: 'not-a-uuid' },
    { ...validInput, content: '  ' },
    { ...validInput, content: 'x'.repeat(10_001) },
    { ...validInput, inputMode: 'other' },
  ])('rejects invalid input with the stable error code', (input) => {
    expect(() => parseFragmentInput(input)).toThrowError(
      expect.objectContaining<Partial<ApiError>>({ status: 400, code: 'INVALID_INPUT' }),
    )
  })
})

describe('fragment list cursor', () => {
  it('round-trips the ordered fields', () => {
    const cursor = { created_at: '2026-08-19T08:00:00.000Z', id: validInput.clientRequestId }
    expect(decodeCursor(encodeCursor(cursor))).toEqual({
      createdAt: cursor.created_at,
      id: cursor.id,
    })
  })

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrowError(
      expect.objectContaining<Partial<ApiError>>({ status: 400, code: 'INVALID_INPUT' }),
    )
  })
})
