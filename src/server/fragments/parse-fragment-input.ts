import { ApiError } from '@/src/lib/api-error'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type FragmentInput = {
  clientRequestId: string
  content: string
  inputMode: 'text' | 'voice'
}

export type EntryInput = {
  content: string
  entryType: 'user' | 'import'
  sourceLabel: string | null
}

export function parseEntryInput(body: unknown): EntryInput {
  if (!body || typeof body !== 'object') {
    throw new ApiError(400, 'INVALID_INPUT', '请求内容无效')
  }

  const input = body as Record<string, unknown>
  if (input.entryType !== 'user' && input.entryType !== 'import') {
    throw new ApiError(400, 'INVALID_INPUT', 'entryType 只允许 user 或 import')
  }
  if (typeof input.content !== 'string' || !input.content.trim()) {
    throw new ApiError(400, 'INVALID_INPUT', '内容不能为空')
  }

  if (input.entryType === 'user') {
    if (input.content.length > 10_000 || input.sourceLabel != null) {
      throw new ApiError(400, 'INVALID_INPUT', '普通输入无效')
    }
    return { content: input.content, entryType: 'user', sourceLabel: null }
  }

  if (new TextEncoder().encode(input.content).byteLength > 1_000_000) {
    throw new ApiError(400, 'INVALID_INPUT', '导入内容不能超过 1,000,000 字节')
  }
  if (input.sourceLabel != null && typeof input.sourceLabel !== 'string') {
    throw new ApiError(400, 'INVALID_INPUT', '来源名称无效')
  }
  const sourceLabel = typeof input.sourceLabel === 'string' ? input.sourceLabel.trim() : ''
  if (sourceLabel.length > 255) {
    throw new ApiError(400, 'INVALID_INPUT', '来源名称不能超过 255 个字符')
  }

  return { content: input.content, entryType: 'import', sourceLabel: sourceLabel || null }
}

export function parseFragmentInput(body: unknown): FragmentInput {
  const input = body as Record<string, unknown> | null
  const clientRequestId = input?.clientRequestId
  const content = input?.content
  const inputMode = input?.inputMode

  if (
    typeof clientRequestId !== 'string' ||
    !uuidPattern.test(clientRequestId) ||
    typeof content !== 'string' ||
    content.trim().length < 1 ||
    content.trim().length > 10_000 ||
    (inputMode !== 'text' && inputMode !== 'voice')
  ) {
    throw new ApiError(400, 'INVALID_INPUT', 'Invalid fragment input')
  }

  return { clientRequestId, content, inputMode }
}
