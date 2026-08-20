import { NextResponse } from 'next/server'
import { ApiError } from './api-error'

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, retryable: error.retryable } },
      { status: error.status },
    )
  }

  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error', retryable: false } },
    { status: 500 },
  )
}
