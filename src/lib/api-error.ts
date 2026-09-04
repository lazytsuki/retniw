export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | 'INVALID_INPUT'
      | 'UNAUTHENTICATED'
      | 'AUTH_CONTEXT_CHANGED'
      | 'NOT_FOUND'
      | 'STATE_CONFLICT'
      | 'THOUGHT_DELETED'
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
