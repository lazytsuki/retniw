import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('account menu', () => {
  it('shows the account identity and keeps nickname editing in the account surface', async () => {
    const header = await readFile('src/components/app-header.tsx', 'utf8')

    expect(header).toContain("const accountLabel = currentNickname || account?.email || '账号'")
    expect(header).toContain("aria-label={`账户：${accountLabel}`}")
    expect(header).toContain("{account?.email ?? '未提供邮箱'}")
    expect(header).toContain('action={nicknameAction}')
    expect(header).toContain('name="nickname"')
    expect(header).toContain('最多24个字符，留空即清除。')
  })

  it('provides the profile to every authenticated workspace page', async () => {
    const pages = await Promise.all([
      readFile('app/page.tsx', 'utf8'),
      readFile('app/thoughts/[id]/page.tsx', 'utf8'),
      readFile('app/review/page.tsx', 'utf8'),
    ])

    for (const page of pages) {
      expect(page).toContain('<AppHeader account={{ email: user.email, nickname: user.nickname }} />')
    }
  })
})
