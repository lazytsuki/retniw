export const NICKNAME_MAX_CODE_POINTS = 24

export type AccountProfile = {
  email: string | null
  nickname: string | null
}

export type NicknameValidation =
  | { ok: true; nickname: string | null }
  | { ok: false; message: string }

const CONTROL_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/u

export function validateNickname(value: unknown): NicknameValidation {
  if (typeof value !== 'string') {
    return { ok: false, message: '请输入昵称。' }
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    return { ok: false, message: '昵称不能包含换行或其他不可见控制字符。' }
  }

  const nickname = value.trim()
  if (!nickname) return { ok: true, nickname: null }
  if ([...nickname].length > NICKNAME_MAX_CODE_POINTS) {
    return { ok: false, message: `昵称最多${NICKNAME_MAX_CODE_POINTS}个字符。` }
  }

  return { ok: true, nickname }
}

export function nicknameFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const result = validateNickname((metadata as { nickname?: unknown }).nickname)
  return result.ok ? result.nickname : null
}
