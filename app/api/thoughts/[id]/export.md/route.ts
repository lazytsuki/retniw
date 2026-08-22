import { apiErrorResponse } from '@/src/lib/api-response'
import { requireUser } from '@/src/lib/auth/require-user'
import { createServiceClient } from '@/src/lib/supabase/service'
import { createThoughtMarkdownStream } from '@/src/server/exports/export-streams'
import { ThoughtExportRepository } from '@/src/server/repositories/thought-export-repository'
import { ThoughtRepository } from '@/src/server/repositories/thought-repository'
import { requireUuid } from '@/src/server/thoughts/parse-thought-management'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser()
    const { id: rawId } = await params
    const id = requireUuid(rawId, 'id')
    const client = createServiceClient()
    const thought = await new ThoughtRepository(client).getOwned(user.id, id)
    const stream = createThoughtMarkdownStream(
      new ThoughtExportRepository(client),
      user.id,
      id,
      thought.createdAt,
    )

    return new Response(stream, {
      headers: {
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="retniw-${id}.md"`,
        'content-type': 'text/markdown; charset=utf-8',
      },
    })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
