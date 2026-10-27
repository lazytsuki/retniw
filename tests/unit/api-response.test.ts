import { describe, expect, it } from 'vitest'
import { ApiError } from '@/src/lib/api-error'
import { apiErrorResponse } from '@/src/lib/api-response'

describe('apiErrorResponse', () => {
  it('maps an ApiError to its status and error body', async () => {
    const response = apiErrorResponse(new ApiError(409, 'STATE_CONFLICT', 'Thought changed', true))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: { code: 'STATE_CONFLICT', message: 'Thought changed', retryable: true },
    })
  })

  it('defaults retryable to false', async () => {
    const response = apiErrorResponse(new ApiError(404, 'NOT_FOUND', 'Thought not found'))

    expect(response.status).toBe(404)
    expect((await response.json()).error.retryable).toBe(false)
  })

  it('hides unexpected errors behind a generic 500', async () => {
    const response = apiErrorResponse(new Error('database password leaked in stack'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error', retryable: false },
    })
  })
})
