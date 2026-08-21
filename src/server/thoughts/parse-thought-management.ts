import { ApiError } from '@/src/lib/api-error'

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function requireUuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', `${field} 必须是有效的 UUID`)
  }
  return value
}

export function parseThoughtAction(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'INVALID_INPUT', '请求内容无效')
  }
  const input = body as Record<string, unknown>
  if (input.action === 'move') {
    return {
      action: 'move' as const,
      collectionId: input.collectionId === null
        ? null
        : requireUuid(input.collectionId, 'collectionId'),
    }
  }
  if (['archive', 'unarchive', 'delete', 'restore'].includes(String(input.action))) {
    return { action: input.action as 'archive' | 'unarchive' | 'delete' | 'restore' }
  }
  throw new ApiError(400, 'INVALID_INPUT', '操作无效')
}

export function parseCollectionInput(body: unknown, requireId = false) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'INVALID_INPUT', '请求内容无效')
  }
  const input = body as Record<string, unknown>
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 80) {
    throw new ApiError(400, 'INVALID_INPUT', '合集名称需要 1 至 80 个字')
  }
  return {
    ...(requireId ? { id: requireUuid(input.id, 'id') } : {}),
    name,
  }
}

export function parseCheckpointInput(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'INVALID_INPUT', '请求内容无效')
  }
  const input = body as Record<string, unknown>
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (note.length > 500) throw new ApiError(400, 'INVALID_INPUT', '这句话不能超过 500 个字')
  return {
    id: requireUuid(input.entryId, 'entryId'),
    clientRequestId: requireUuid(input.clientRequestId, 'clientRequestId'),
    note,
  }
}
