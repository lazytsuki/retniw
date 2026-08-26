import type { User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { requireOwnedResource, type OwnedResourceClient } from '@/src/lib/auth/require-owned-resource'
import { requireUser, type AuthClient } from '@/src/lib/auth/require-user'

const user = { id: 'owner-id', email: 'owner@example.com' } as User

describe('requireUser', () => {
  it('returns the authenticated user', async () => {
    const client: AuthClient = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: user.id,
              email: user.email,
              user_metadata: { nickname: '  Winter  ' },
            },
          },
          error: null,
        }),
      },
    }

    await expect(requireUser(client)).resolves.toEqual({
      id: user.id,
      email: user.email,
      nickname: 'Winter',
    })
    expect(client.auth.getClaims).toHaveBeenCalledOnce()
  })

  it('ignores invalid optional profile claims without weakening authentication', async () => {
    const client: AuthClient = {
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: user.id,
              email: 42,
              user_metadata: { nickname: `Winter\nAdmin` },
            },
          },
          error: null,
        }),
      },
    }

    await expect(requireUser(client)).resolves.toEqual({
      id: user.id,
      email: null,
      nickname: null,
    })
  })

  it('maps a missing session to 401', async () => {
    const client: AuthClient = {
      auth: { getClaims: vi.fn().mockResolvedValue({ data: null, error: null }) },
    }

    await expect(requireUser(client)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    })
  })
})

describe('requireOwnedResource', () => {
  it('filters by both resource id and authenticated user id', async () => {
    const filters: Array<[string, string]> = []
    const resource = { id: 'fragment-id', user_id: user.id }
    const query = {
      eq(column: string, value: string) {
        filters.push([column, value])
        return query
      },
      maybeSingle: vi.fn().mockResolvedValue({ data: resource, error: null }),
    }
    const client: OwnedResourceClient<typeof resource> = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }),
    }

    await expect(
      requireOwnedResource({ table: 'fragments', id: resource.id, user, client }),
    ).resolves.toEqual(resource)
    expect(filters).toEqual([
      ['id', resource.id],
      ['user_id', user.id],
    ])
  })

  it('returns the same 404 when the filtered resource is absent', async () => {
    const query = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    query.eq.mockReturnValue(query)
    const client: OwnedResourceClient<never> = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }),
    }

    await expect(
      requireOwnedResource({ table: 'fragments', id: 'other-user-resource', user, client }),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
})
