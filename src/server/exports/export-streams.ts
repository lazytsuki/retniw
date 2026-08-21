import {
  EXPORT_PAGE_SIZE,
  type ExportEntry,
  type ThoughtExportRepository,
} from '@/src/server/repositories/thought-export-repository'

type ExportRepository = Pick<
  ThoughtExportRepository,
  | 'listThoughtPage'
  | 'listCollectionPage'
  | 'listCheckpointPage'
  | 'listEntryPage'
  | 'listThoughtEntryPage'
  | 'listThoughtCheckpointPage'
  | 'listConfirmedConnectionPage'
>

const encoder = new TextEncoder()

async function writePaged<T>(
  controller: ReadableStreamDefaultController<Uint8Array>,
  readPage: (offset: number, limit: number) => Promise<T[]>,
) {
  let offset = 0
  let first = true
  while (true) {
    const page = await readPage(offset, EXPORT_PAGE_SIZE)
    for (const item of page) {
      controller.enqueue(encoder.encode(`${first ? '' : ','}${JSON.stringify(item)}`))
      first = false
    }
    if (page.length < EXPORT_PAGE_SIZE) break
    offset += page.length
  }
}

export function createFullExportStream(
  repository: ExportRepository,
  userId: string,
  exportedAt = new Date().toISOString(),
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`{"format":"retniw.export.v2","exportedAt":${JSON.stringify(exportedAt)},"collections":[`))
        await writePaged(controller, (offset, limit) =>
          repository.listCollectionPage(userId, offset, limit),
        )
        controller.enqueue(encoder.encode('],"thoughts":['))
        await writePaged(controller, (offset, limit) =>
          repository.listThoughtPage(userId, offset, limit),
        )
        controller.enqueue(encoder.encode('],"checkpoints":['))
        await writePaged(controller, (offset, limit) =>
          repository.listCheckpointPage(userId, offset, limit),
        )
        controller.enqueue(encoder.encode('],"entries":['))
        await writePaged(controller, (offset, limit) =>
          repository.listEntryPage(userId, offset, limit),
        )
        controller.enqueue(encoder.encode('],"connections":['))
        await writePaged(controller, (offset, limit) =>
          repository.listConfirmedConnectionPage(userId, offset, limit),
        )
        controller.enqueue(encoder.encode(']}'))
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

function entryAuthor(entry: ExportEntry) {
  if (entry.entryType === 'import') return '导入'
  if (entry.entryType === 'ai') return 'AI'
  return '用户'
}

export function createThoughtMarkdownStream(
  repository: ExportRepository,
  userId: string,
  thoughtId: string,
  createdAt: string,
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(`# retniw\n\n- 过程 ID：${thoughtId}\n- 创建时间：${createdAt}\n`),
        )
        let offset = 0
        while (true) {
          const page = await repository.listThoughtEntryPage(
            userId,
            thoughtId,
            offset,
            EXPORT_PAGE_SIZE,
          )
          for (const entry of page) {
            const source = entry.sourceLabel ? `\n- 来源：${entry.sourceLabel}` : ''
            controller.enqueue(
              encoder.encode(
                `\n## ${entry.createdAt}\n\n- 条目 ID：${entry.id}\n- 作者：${entryAuthor(entry)}${source}\n\n${entry.content}\n`,
              ),
            )
          }
          if (page.length < EXPORT_PAGE_SIZE) break
          offset += page.length
        }
        offset = 0
        while (true) {
          const page = await repository.listThoughtCheckpointPage(
            userId,
            thoughtId,
            offset,
            EXPORT_PAGE_SIZE,
          )
          for (const checkpoint of page) {
            controller.enqueue(
              encoder.encode(`\n## 先到这里 · ${checkpoint.createdAt}\n\n${checkpoint.note || '（未留备注）'}\n`),
            )
          }
          if (page.length < EXPORT_PAGE_SIZE) break
          offset += page.length
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}
