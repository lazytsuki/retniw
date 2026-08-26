import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  parseLoginCredentials,
  parseSignupCredentials,
} from '@/src/lib/auth/credentials'

function form(values: Record<string, string>) {
  const data = new FormData()
  Object.entries(values).forEach(([key, value]) => data.set(key, value))
  return data
}

describe('auth credential validation', () => {
  it('normalizes the email without changing the password', () => {
    expect(parseLoginCredentials(form({
      email: '  Friend@Example.COM ',
      password: ' keep spaces ',
    }))).toEqual({
      ok: true,
      value: { email: 'friend@example.com', password: ' keep spaces ' },
    })
  })

  it('uses the same minimum password length exposed by the signup form', () => {
    expect(parseSignupCredentials(form({
      email: 'friend@example.com',
      password: 'x'.repeat(MIN_PASSWORD_LENGTH - 1),
      passwordConfirmation: 'x'.repeat(MIN_PASSWORD_LENGTH - 1),
    }))).toEqual({ ok: false, error: 'invalid-password' })

    expect(parseSignupCredentials(form({
      email: 'friend@example.com',
      password: 'x'.repeat(MIN_PASSWORD_LENGTH),
      passwordConfirmation: 'x'.repeat(MIN_PASSWORD_LENGTH),
    }))).toMatchObject({ ok: true })
  })

  it('rejects a different confirmation before calling Supabase', () => {
    expect(parseSignupCredentials(form({
      email: 'friend@example.com',
      password: 'password',
      passwordConfirmation: 'different',
    }))).toEqual({ ok: false, error: 'password-mismatch' })
  })

  it('shows immediate pending feedback and prevents repeated auth submits', async () => {
    const page = await readFile('app/login/page.tsx', 'utf8')
    const submitButton = await readFile('app/login/auth-submit-button.tsx', 'utf8')

    expect(page).toContain('<AuthSubmitButton isSignup={isSignup} />')
    expect(submitButton).toContain("import { useFormStatus } from 'react-dom'")
    expect(submitButton).toContain('disabled={pending}')
    expect(submitButton).toContain('aria-busy={pending}')
    expect(submitButton).toContain("isSignup ? '正在创建并进入' : '正在登录'")
    const css = await readFile('src/index.css', 'utf8')
    expect(css).toMatch(/\.login-form button:disabled \{[\s\S]*?opacity: 0\.64;[\s\S]*?cursor: default;/)
  })
})
