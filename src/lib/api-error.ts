export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | 'INVALID_INPUT'
      | 'UNAUTHENTICATED'
      | 'NOT_FOUND'
      | 'STATE_CONFLICT'
      | 'CONTEXT_TOO_LARGE'
      | 'AI_NEEDS_INPUT'
      | 'AI_UNAVAILABLE'
      | 'INTERNAL_ERROR',
    message: string,
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
