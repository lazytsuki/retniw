import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { requireMutationUser, requireRequestUser, type AuthClient } from '@/src/lib/auth/require-user'

const userId = '018f6f3a-a1c2-47a8-8f1e-100000000099'

function authClient(): AuthClient {
  return {
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: { sub: userId, email: 'owner@example.com' } },
        error: null,
      })),
    },
  }
}

function request(expectedUserId?: string) {
  const headers = new Headers()
  if (expectedUserId) headers.set('x-retniw-expected-user-id', expectedUserId)
  return new Request('http://localhost/api/thoughts', { method: 'POST', headers })
}

describe('authenticated mutation identity fence', () => {
  it('accepts only the account that rendered the page', async () => {
    await expect(requireMutationUser(request(userId), authClient())).resolves.toMatchObject({
      id: userId,
    })

    for (const expected of [undefined, '018f6f3a-a1c2-47a8-8f1e-100000000088']) {
      await expect(requireMutationUser(request(expected), authClient())).rejects.toMatchObject({
        status: 409,
        code: 'AUTH_CONTEXT_CHANGED',
      })
    }
  })

  it('applies the same account fence to client-side reads', async () => {
    await expect(requireRequestUser(request(userId), authClient())).resolves.toMatchObject({
      id: userId,
    })
    await expect(
      requireRequestUser(request('018f6f3a-a1c2-47a8-8f1e-100000000088'), authClient()),
    ).rejects.toMatchObject({ status: 409, code: 'AUTH_CONTEXT_CHANGED' })

    await expect(requireRequestUser(
      new Request(`http://localhost/api/export?expectedUserId=${userId}`),
      authClient(),
    )).resolves.toMatchObject({ id: userId })
  })

  it('guards every API mutation route before repository work', async () => {
    const paths = (await readdir('app/api', { recursive: true }))
      .filter((path) => path.endsWith('route.ts'))
      .map((path) => `app/api/${path}`)
    let mutationCount = 0

    for (const path of paths) {
      const source = await readFile(path, 'utf8')
      const methods = source.match(/export async function (?:POST|PATCH|PUT|DELETE)\(/g) ?? []
      if (!methods.length) continue
      mutationCount += methods.length
      expect(source, path).toContain("from '@/src/lib/auth/require-user'")
      expect(source.match(/requireMutationUser\(request\)/g) ?? [], path).toHaveLength(methods.length)
    }

    expect(mutationCount).toBe(18)
  })

  it('routes every mounted client mutation through the page-account header helper', async () => {
    const expected = new Map([
      ['src/hooks/use-capture-outbox.ts', 1],
      ['src/hooks/use-ai-action.ts', 1],
      ['src/components/thoughts/thought-workspace.tsx', 2],
      ['src/components/thoughts/thought-navigation.tsx', 5],
      ['src/components/review/review-workspace.tsx', 3],
      ['src/components/product-event-sender.tsx', 1],
      ['src/components/fragments/clarification-card.tsx', 1],
      ['src/components/fragments/connection-candidate.tsx', 1],
      ['src/components/fragments/fragment-timeline.tsx', 2],
    ])

    for (const [path, minimumCalls] of expected) {
      const source = await readFile(path, 'utf8')
      const calls = source.match(/(?:currentUserBoundFetch|userBoundFetch)\(/g) ?? []
      expect(calls.length, path).toBeGreaterThanOrEqual(minimumCalls)
    }
  })

  it('routes every mounted client fetch through the page-account header helper', async () => {
    const paths = [
      'src/components/review/review-workspace.tsx',
      'src/components/thoughts/thought-navigation.tsx',
      'src/components/fragments/fragment-timeline.tsx',
    ]
    for (const path of paths) {
      const source = await readFile(path, 'utf8')
      expect(source, path).not.toMatch(/\bfetch\(/)
    }
  })
})
