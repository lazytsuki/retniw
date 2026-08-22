export const MIN_PASSWORD_LENGTH = 6

export type CredentialValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: 'invalid-email' | 'invalid-password' | 'password-mismatch' }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function readEmail(formData: FormData) {
  const value = formData.get('email')
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}
function readPassword(formData: FormData, name = 'password') {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export function parseLoginCredentials(formData: FormData): CredentialValidation<{
  email: string
  password: string
}> {
  const email = readEmail(formData)
  const password = readPassword(formData)

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, error: 'invalid-email' }
  }
  if (!password) return { ok: false, error: 'invalid-password' }

  return { ok: true, value: { email, password } }
}

export function parseSignupCredentials(formData: FormData): CredentialValidation<{
  email: string
  password: string
}> {
  const email = readEmail(formData)
  const password = readPassword(formData)
  const passwordConfirmation = readPassword(formData, 'passwordConfirmation')

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, error: 'invalid-email' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: 'invalid-password' }
  }
  if (password !== passwordConfirmation) {
    return { ok: false, error: 'password-mismatch' }
  }

  return { ok: true, value: { email, password } }
}
