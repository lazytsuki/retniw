import { ApiError } from '@/src/lib/api-error'

type Fetch = typeof fetch
export type AiAction = 'advance' | 'question' | 'organize'

type ReconnectCandidate = {
  id: string
  content: string
  clarificationAnswer: string | null
}

type ReconnectResult = {
  targetFragmentId: string | null
  rationale: string | null
}

type ConnectionThought = {
  id: string
  entries: Array<{ id: string; content: string }>
}

export type ConnectionSuggestion = {
  targetThoughtId: string
  sourceEntryId: string
  targetEntryId: string
  rationale: string
} | null

export class DeepSeekTextProvider {
  constructor(
    private readonly apiKey = process.env.DEEPSEEK_API_KEY,
    private readonly fetchImplementation: Fetch = fetch,
  ) {}

  private async complete(system: string, input: unknown) {
    if (!this.apiKey) {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service is not configured', true)
    }

    let response: Response
    try {
      response = await this.fetchImplementation('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
          thinking: { type: 'disabled' },
          stream: false,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service is temporarily unavailable', true)
    }

    if (!response.ok) {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service is temporarily unavailable', true)
    }

    const result = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: unknown } }>
    } | null
    const content = result?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service returned an invalid result', true)
    }

    try {
      return JSON.parse(content) as unknown
    } catch {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service returned an invalid result', true)
    }
  }

  async *streamText(
    action: AiAction,
    entries: Array<{ entryType: string; content: string; sourceLabel: string | null }>,
    requestSignal?: AbortSignal,
  ) {
    if (!this.apiKey) {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service is not configured', true)
    }

    const instructions: Record<AiAction, string> = {
      advance: '基于用户最后一条新输入，给出一个下一步可写的方向。第一句以“可以继续写：”开头，只写一到三句。只能提出可补充的角度，不能代写具体经历、场景或结论。',
      question: '只输出一句具体且有推进作用的中文问句，最后一个字符必须是“？”。禁止复述输入原句，禁止输出陈述句，不要替用户回答。',
      organize: '整理当前思考的已有内容，保留不确定性和原意，清楚呈现已形成的部分与仍然开放的部分。',
    }
    const context = entries
      .filter((entry) => entry.entryType === 'user' || entry.entryType === 'import')
      .map((entry) => ({
      type: entry.entryType,
      source: entry.sourceLabel,
      content: entry.content,
      }))
    const sourceBoundary = '用户输入和导入内容是唯一事实来源。输入中没有出现的专名、时间、数字、地点、人物关系、动作、场景、偏好、动机、情绪和结论一律不得补写。需要新信息时，改成让用户补充的角度或问题。语气克制、简短、讲人话，禁止文学化修辞。'

    let response: Response
    try {
      response = await this.fetchImplementation('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
          thinking: { type: 'disabled' },
          temperature: 0.2,
          max_tokens: action === 'organize' ? 1200 : 240,
          stream: true,
          messages: [
            {
              role: 'system',
              content: `${sourceBoundary}${instructions[action]}直接输出正文，不要使用 JSON，不要解释你的任务。`,
            },
            { role: 'user', content: JSON.stringify(context) },
          ],
        }),
        signal: requestSignal
          ? AbortSignal.any([requestSignal, AbortSignal.timeout(60_000)])
          : AbortSignal.timeout(60_000),
      })
    } catch {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service is temporarily unavailable', true)
    }

    if (!response.ok || !response.body) {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service is temporarily unavailable', true)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let completed = false

    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''

      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data) continue
          if (data === '[DONE]') {
            completed = true
            continue
          }

          let payload: { choices?: Array<{ delta?: { content?: unknown } }> }
          try {
            payload = JSON.parse(data) as typeof payload
          } catch {
            throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service returned an invalid stream', true)
          }
          const content = payload.choices?.[0]?.delta?.content
          if (typeof content === 'string' && content) yield content
        }
      }

      if (done) break
    }

    if (!completed) {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI stream ended before completion', true)
    }
  }

  async clarify(content: string) {
    const result = (await this.complete(
      '你帮助用户继续形成一个尚未完成的想法。只返回 JSON，格式为 {"question":"一个简短、具体、可跳过的问题"}。不总结，不替用户回答。',
      { content },
    )) as { question?: unknown }

    if (
      typeof result.question !== 'string' ||
      !result.question.trim() ||
      result.question.trim().length > 1000
    ) {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service returned an invalid result', true)
    }
    return result.question.trim()
  }

  async reconnect(current: { id: string; content: string }, candidates: ReconnectCandidate[]) {
    const result = (await this.complete(
      '判断当前想法是否与一个候选想法存在值得用户确认的直接联系。只返回 JSON，格式为 {"targetFragmentId":"候选 id 或 null","rationale":"简短理由或 null"}。没有明确联系时两个字段都返回 null；不得返回候选列表外的 id。',
      { current, candidates },
    )) as { targetFragmentId?: unknown; rationale?: unknown }

    if (result.targetFragmentId === null && result.rationale === null) {
      return { targetFragmentId: null, rationale: null } satisfies ReconnectResult
    }
    if (
      typeof result.targetFragmentId !== 'string' ||
      !candidates.some((candidate) => candidate.id === result.targetFragmentId) ||
      typeof result.rationale !== 'string' ||
      !result.rationale.trim() ||
      result.rationale.trim().length > 1000
    ) {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service returned an invalid result', true)
    }
    return {
      targetFragmentId: result.targetFragmentId,
      rationale: result.rationale.trim(),
    } satisfies ReconnectResult
  }

  async findConnection(current: ConnectionThought, candidates: ConnectionThought[]) {
    const result = (await this.complete(
      '判断当前思考是否与一个候选思考存在值得用户确认的直接联系。只返回 JSON，格式为 {"targetThoughtId":"候选id或null","sourceEntryId":"当前思考中的依据entry id或null","targetEntryId":"候选思考中的依据entry id或null","rationale":"简短理由或null"}。没有明确联系时四个字段都返回null。不得返回输入之外的思考或entry id。',
      { current, candidates },
    )) as Record<string, unknown>

    if (
      result.targetThoughtId === null &&
      result.sourceEntryId === null &&
      result.targetEntryId === null &&
      result.rationale === null
    ) return null

    const candidate = candidates.find((item) => item.id === result.targetThoughtId)
    if (
      !candidate ||
      typeof result.sourceEntryId !== 'string' ||
      !current.entries.some((entry) => entry.id === result.sourceEntryId) ||
      typeof result.targetEntryId !== 'string' ||
      !candidate.entries.some((entry) => entry.id === result.targetEntryId) ||
      typeof result.rationale !== 'string' ||
      !result.rationale.trim() ||
      result.rationale.trim().length > 1000
    ) {
      throw new ApiError(503, 'AI_UNAVAILABLE', 'AI service returned an invalid result', true)
    }

    return {
      targetThoughtId: candidate.id,
      sourceEntryId: result.sourceEntryId,
      targetEntryId: result.targetEntryId,
      rationale: result.rationale.trim(),
    } satisfies Exclude<ConnectionSuggestion, null>
  }
}
