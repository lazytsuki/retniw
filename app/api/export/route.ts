import { apiErrorResponse } from '@/src/lib/api-response'
import { requireRequestUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { createFullExportStream } from '@/src/server/exports/export-streams'
import { ThoughtExportRepository } from '@/src/server/repositories/thought-export-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function HEAD(request: Request) {
  try {
    await requireRequestUser(request)
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const response = apiErrorResponse(error)
    return new Response(null, { status: response.status, headers: response.headers })
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request)
    const stream = createFullExportStream(new ThoughtExportRepository(createServiceClient()), user.id)
    const date = new Date().toISOString().slice(0, 10)
    return new Response(stream, {
      headers: {
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="retniw-${date}.json"`,
        'content-type': 'application/json; charset=utf-8',
      },
    })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
