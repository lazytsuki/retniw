const MAX_IMPORT_BYTES = 1_000_000
const ALLOWED_EXTENSIONS = ['.md', '.txt']

export type ParsedImportedText = {
  content: string
  sourceLabel: string
}

export function validateImportedText(content: string) {
  if (!content.trim()) throw new Error('导入内容不能为空')
  if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_BYTES) {
    throw new Error('导入内容不能超过 1,000,000 字节')
  }
  return content
}

export async function parseImportedText(file: File): Promise<ParsedImportedText> {
  const lowerName = file.name.toLowerCase()
  if (!ALLOWED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
    throw new Error('只支持 .md 和 .txt 文件')
  }
  if (file.size > MAX_IMPORT_BYTES) throw new Error('文件不能超过 1,000,000 字节')

  return {
    content: validateImportedText(await file.text()),
    sourceLabel: file.name,
  }
}
