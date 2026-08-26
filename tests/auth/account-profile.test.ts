import { describe, expect, it } from 'vitest'
import {
  NICKNAME_MAX_CODE_POINTS,
  nicknameFromMetadata,
  validateNickname,
} from '@/src/lib/auth/account-profile'

describe('account nickname', () => {
  it('trims a nickname and treats an empty value as clearing it', () => {
    expect(validateNickname('  Winter  ')).toEqual({ ok: true, nickname: 'Winter' })
    expect(validateNickname('   ')).toEqual({ ok: true, nickname: null })
  })

  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect(validateNickname('你'.repeat(NICKNAME_MAX_CODE_POINTS))).toEqual({
      ok: true,
      nickname: '你'.repeat(NICKNAME_MAX_CODE_POINTS),
    })
    expect(validateNickname('好'.repeat(NICKNAME_MAX_CODE_POINTS + 1))).toMatchObject({ ok: false })
    expect(validateNickname('𠮷'.repeat(NICKNAME_MAX_CODE_POINTS))).toMatchObject({ ok: true })
  })

  it('rejects control characters before trimming', () => {
    expect(validateNickname('Winter\n')).toMatchObject({ ok: false })
    expect(validateNickname('Win\tter')).toMatchObject({ ok: false })
    expect(validateNickname('Win\u200Bter')).toMatchObject({ ok: false })
    expect(validateNickname('Win\u202Eter')).toMatchObject({ ok: false })
  })

  it('reads only a valid nickname from user metadata', () => {
    expect(nicknameFromMetadata({ nickname: '  Winter  ' })).toBe('Winter')
    expect(nicknameFromMetadata({ nickname: 'x'.repeat(25) })).toBeNull()
    expect(nicknameFromMetadata({ nickname: 42 })).toBeNull()
    expect(nicknameFromMetadata(null)).toBeNull()
  })
})
