import { ApiError } from '@/src/lib/api-error'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type TokenEntryInput = {
  thoughtId: string
  entryId: string
  requestId: string
  content: string
  sourceLabel: string | null
}

function requireUuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', `${field} 必须是有效的 UUID`)
  }
  return value
}

/**
 * 外部工具写入的是用户自己的原话，按「导入」保存：
 * 内容不能为空、不超过 10,000 字；来源名称可选，不超过 255 字，缺省用令牌名。
 */
export function parseTokenEntryInput(body: unknown): TokenEntryInput {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'INVALID_INPUT', '请求内容无效')
  }
  const input = body as Record<string, unknown>
  if (typeof input.content !== 'string' || !input.content.trim()) {
    throw new ApiError(400, 'INVALID_INPUT', '内容不能为空')
  }
  if (input.content.length > 10_000) {
    throw new ApiError(400, 'INVALID_INPUT', '内容不能超过 10,000 字')
  }
  if (input.sourceLabel != null && typeof input.sourceLabel !== 'string') {
    throw new ApiError(400, 'INVALID_INPUT', '来源名称无效')
  }
  const sourceLabel = typeof input.sourceLabel === 'string' ? input.sourceLabel.trim() : ''
  if (sourceLabel.length > 255) {
    throw new ApiError(400, 'INVALID_INPUT', '来源名称不能超过 255 个字符')
  }

  return {
    thoughtId: requireUuid(input.thoughtId, 'thoughtId'),
    entryId: requireUuid(input.entryId, 'entryId'),
    requestId: requireUuid(input.requestId, 'requestId'),
    content: input.content,
    sourceLabel: sourceLabel || null,
  }
}

export function parseAccessTokenName(body: unknown) {
  const name = (body as Record<string, unknown> | null)?.name
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
    throw new ApiError(400, 'INVALID_INPUT', '令牌名称需要 1 到 40 个字')
  }
  return name.trim()
}
