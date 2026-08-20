# Task Module: M-003 主动 AI 推进

## 模块概览
- 模块目标：用户需要时才调用 AI，并在当前过程流式看到结果后继续输入。
- 模块边界：包含推进、追问、整理及 SSE 持久化；不包含自动回复、关系候选和第二模型供应商。
- 模块依赖：M-002

## 任务卡
### M-003-T-001 交付可中断的主动 AI
- 任务目标：普通记录不产生模型调用；主动操作立即有状态、逐步显示结果，完整输出独立保存，失败不影响用户内容。
- 设计依据：[TECH-DESIGN.md](TECH-DESIGN.md)验证映射「普通输入不自动回复；用户主动调用后100毫秒内有状态；逐步显示内容；失败不锁住输入。」及设计落点「显式AiActions、本地start状态和SSE」；「主动调用时流式显示；AI输出单独保存；模型失败不影响用户内容。」及设计落点「DeepSeekTextProvider.streamText和AI entry」；Brownfield 符号：[FragmentTimeline](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)、[DeepSeekTextProvider.complete](src/server/ai/deepseek-text-provider.ts#complete)。
- 目标代码/产出物：
  - [ ] 修改现有文件并新增方法：在 `retniw-v2` 扩充 [DeepSeekTextProvider.streamText](src/server/ai/deepseek-text-provider.ts#streamText)，保留现有服务端密钥边界。
  - [ ] 新增文件并创建符号：在 `retniw-v2` 新增 [POST thought AI](app/api/thoughts/%5Bid%5D/ai/route.ts#POST)、[useAiAction](src/hooks/use-ai-action.ts#useAiAction)、[AiActions](src/components/thoughts/ai-actions.tsx#AiActions)和 [StreamingAiEntry](src/components/thoughts/streaming-ai-entry.tsx#StreamingAiEntry)。
  - [ ] 新增文件并修改前置任务符号：在 `retniw-v2` 更新 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)并调用 [EntryRepository.createIdempotent](src/server/repositories/entry-repository.ts#createIdempotent)，将流式临时内容与正式 entries 分开。
- 实现步骤：
  1. 用户选择 `advance/question/organize` 后进入 [AiActions](src/components/thoughts/ai-actions.tsx#AiActions)只在用户选择推进、追问或整理时调用 [useAiAction](src/hooks/use-ai-action.ts#useAiAction)，点击后立即显示本地处理状态。
  2. [POST thought AI](app/api/thoughts/%5Bid%5D/ai/route.ts#POST)校验所有权并读取当前过程；上下文超过500,000字符返回 CONTEXT_TOO_LARGE，不静默截断。
  3. [DeepSeekTextProvider.streamText](src/server/ai/deepseek-text-provider.ts#streamText)使用 deepseek-v4-flash 非思考模式和 stream:true，解析 keep-alive、中文分块、结束标志和失败。
  4. 服务端发送 start、delta、saved、error；只有正常结束、非空且不超过20,000字符的结果才按请求 UUID写入 AI entry。
  5. [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)在断流时标记临时结果未保存，同时保持输入、复制和离开可用。
- 边界与不变约束：
  - [ ] 普通 entry 写入链路不得调用 DeepSeek；AI不得覆盖原文；半段输出不得进入正式列表和导出。
  - [ ] 日志不得包含正文、上下文、邮箱或密钥，不自动切换供应商。
- 前置依赖：M-002-T-001
- 完成定义：
  - [ ] 三个主动操作均流式显示并独立保存；模型失败后可继续记录；普通保存没有模型请求。
- 验证方式：
  - [ ] 入口：运行 npm test -- deepseek ai-stream，并执行一次真实 DeepSeek 流式调用；被测：[POST thought AI](app/api/thoughts/%5Bid%5D/ai/route.ts#POST)、[DeepSeekTextProvider.streamText](src/server/ai/deepseek-text-provider.ts#streamText)、[useAiAction](src/hooks/use-ai-action.ts#useAiAction)；Mock：自动测试 Mock DeepSeek SSE，真实验收不 Mock供应商；断言：100毫秒内本地状态、分块顺序、完整输出只写一次、断流不写入、普通保存零模型调用。
