'use client'

import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { userBoundFetch } from '@/src/lib/auth/user-bound-fetch'

type AccessToken = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
}

type Feedback = { status: 'success' | 'error'; message: string } | null

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

async function errorMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
  return payload?.error?.message || fallback
}

/** 账户菜单里的访问令牌：让授权的外部工具把你的原话写进 retniw。 */
export function AccessTokenSection({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [tokens, setTokens] = useState<AccessToken[] | null>(null)
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    const response = await userBoundFetch(userId, '/api/access-tokens')
    if (!response.ok) {
      setFeedback({ status: 'error', message: await errorMessage(response, '令牌列表读取失败') })
      return
    }
    const payload = await response.json() as { data: { accessTokens: AccessToken[] } }
    setTokens(payload.data.accessTokens)
  }, [userId])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && tokens === null) void load()
  }

  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) return
    setPending(true)
    setFeedback(null)
    try {
      const response = await userBoundFetch(userId, '/api/access-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) {
        setFeedback({ status: 'error', message: await errorMessage(response, '令牌创建失败') })
        return
      }
      const payload = await response.json() as { data: { token: string; accessToken: AccessToken } }
      setCreated({ name: payload.data.accessToken.name, token: payload.data.token })
      setTokens((current) => [payload.data.accessToken, ...(current ?? [])])
      form.reset()
    } finally {
      setPending(false)
    }
  }

  async function revokeToken(token: AccessToken) {
    if (!window.confirm(`撤销「${token.name}」后，用它的工具会立即无法写入。它已写入的内容会保留。`)) return
    setFeedback(null)
    const response = await userBoundFetch(userId, `/api/access-tokens/${token.id}`, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) {
      setFeedback({ status: 'error', message: await errorMessage(response, '撤销失败') })
      return
    }
    setTokens((current) => (current ?? []).filter((item) => item.id !== token.id))
    if (created?.name === token.name) setCreated(null)
  }

  async function copyCreated() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.token)
      setFeedback({ status: 'success', message: '已复制' })
    } catch {
      setFeedback({ status: 'error', message: '复制失败，请手动选中复制' })
    }
  }

  return (
    <section className="account-menu__tokens" aria-label="访问令牌">
      <button
        type="button"
        className="account-menu__tokens-toggle"
        aria-expanded={open}
        onClick={toggle}
      >访问令牌</button>
      {open ? (
        <div className="account-menu__tokens-body">
          <p className="account-menu__hint">
            让你授权的工具把你的原话写进 retniw，标为导入、注明来源。令牌只能新建想法，或接着写它自己建的想法，读不到你的内容。
          </p>
          {created ? (
            <div className="account-menu__token-created" role="status">
              <span className="account-menu__hint">「{created.name}」的令牌只显示这一次：</span>
              <div className="account-menu__nickname-row">
                <input
                  className="account-menu__input"
                  readOnly
                  value={created.token}
                  aria-label="新令牌"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" onClick={copyCreated}>复制</button>
              </div>
            </div>
          ) : null}
          <form className="account-menu__nickname-row" onSubmit={createToken}>
            <input
              className="account-menu__input"
              name="name"
              type="text"
              maxLength={40}
              placeholder="给令牌起个名字"
              aria-label="令牌名称"
            />
            <button type="submit" disabled={pending} aria-busy={pending}>{pending ? '生成中' : '生成'}</button>
          </form>
          {tokens && tokens.length > 0 ? (
            <ul className="account-menu__token-list">
              {tokens.map((token) => (
                <li key={token.id}>
                  <span className="account-menu__token-name">{token.name}</span>
                  <span className="account-menu__hint">
                    {token.lastUsedAt ? `${formatDay(token.lastUsedAt)} 用过` : '还没用过'}
                  </span>
                  <button type="button" onClick={() => void revokeToken(token)}>撤销</button>
                </li>
              ))}
            </ul>
          ) : null}
          {feedback ? (
            <p
              className={`account-menu__feedback account-menu__feedback--${feedback.status}`}
              role={feedback.status === 'error' ? 'alert' : 'status'}
            >{feedback.message}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
