# Task Module: M-004 澄清回应

## 模块概览

- 模块目标：原文保存后可得到一个可跳过的问题，并在之后重新打开详情时继续回答。
- 模块边界：包含唯一问题生成、首次回答、详情补发与呈现；不包含碎片连接。
- 模块依赖：M-002

## 任务卡

### M-004-T-001 交付可补发的单次澄清

- 任务目标：每条碎片最多生成一个问题，保存后立即离开也能在下次进入详情时补齐并回答，任何 AI 失败都不影响原文。
- 设计依据：[TECH-DESIGN.md 验证映射](TECH-DESIGN.md#验证映射)「原文保存后出现一个可跳过的问题；每条碎片最多一个问题，问题失败不影响原文。」；设计落点「澄清、重连与回看」「DeepSeek澄清」及 H3「数据库 DDL」中的 `clarifications`。
- 目标代码/产出物：
  - [ ] 在 `/Users/liyingliang.7/retniw` 的 `app-api` 新增 [POST clarification](app/api/fragments/%5Bid%5D/clarification/route.ts#POST)、[DeepSeekTextProvider.clarify](src/server/ai/deepseek-text-provider.ts#clarify)和 [PATCH clarification](app/api/clarifications/%5Bid%5D/route.ts#PATCH)。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 的 `nextjs-pwa` 新增 [FragmentDetailPage](app/fragments/%5Bid%5D/page.tsx#FragmentDetailPage)、[FragmentTimeline](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)和 [ClarificationCard](src/components/fragments/clarification-card.tsx#ClarificationCard)，替代旧 [NoteDetail](src/components/NoteDetail.tsx#NoteDetail)。
  - [ ] 前置任务新增文件、当前任务修改：在 `/Users/liyingliang.7/retniw` 扩充 [GET fragment detail](app/api/fragments/%5Bid%5D/route.ts#GET)，返回唯一澄清记录；由 [useCaptureOutbox](src/hooks/use-capture-outbox.ts#useCaptureOutbox)触发澄清请求。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 新增 [clarification API tests](tests/api/clarifications.test.ts#clarifications-api)和 [fragment detail tests](tests/e2e/fragment-detail.test.ts#fragment-detail)。
- 实现步骤：
  1. M-002 保存成功后并行调用 [POST clarification](app/api/fragments/%5Bid%5D/clarification/route.ts#POST)，但不等待 AI 结果决定原文保存是否成功。
  2. [POST clarification](app/api/fragments/%5Bid%5D/clarification/route.ts#POST)先读取当前用户碎片；已有问题直接返回，没有时只把当前原文交给 [DeepSeekTextProvider.clarify](src/server/ai/deepseek-text-provider.ts#clarify)，使用JSON Output并经服务端校验后依靠`fragment_id`唯一约束幂等写入。
  3. [FragmentDetailPage](app/fragments/%5Bid%5D/page.tsx#FragmentDetailPage)读取详情；没有澄清记录时补发同一接口，解决保存成功后立即关闭页面导致的缺失。
  4. [ClarificationCard](src/components/fragments/clarification-card.tsx#ClarificationCard)允许跳过或提交 1..10000 字回答；[PATCH clarification](app/api/clarifications/%5Bid%5D/route.ts#PATCH)只接受首次回答，相同结果幂等返回，不同重复回答返回 409。
  5. [FragmentTimeline](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)将原文作为不可编辑内容展示，并在手机与 Mac 上读取同一问题和回答。
- 边界与不变约束：
  - [ ] 每条碎片最多一条澄清；重复生成请求不新增记录，AI 失败不删除或修改原文。
  - [ ] 跳过不得写虚假回答；回答状态必须保持 `answer`与`answered_at`同时为空或同时非空。
  - [ ] DeepSeek只接收当前原文；正文、回答和模型原始输出不得写日志。
- 前置依赖：M-002-T-001
- 完成定义：
  - [ ] 保存后可看到或稍后补齐一个问题；用户可跳过或首次回答，重复与冲突行为符合契约。
- 验证方式：
  - [ ] 入口：运行 [clarification API tests](tests/api/clarifications.test.ts#clarifications-api)；被测：[POST clarification](app/api/fragments/%5Bid%5D/clarification/route.ts#POST)、[PATCH clarification](app/api/clarifications/%5Bid%5D/route.ts#PATCH)、[DeepSeekTextProvider.clarify](src/server/ai/deepseek-text-provider.ts#clarify)；Mock：DeepSeek Chat Completions；断言：并发请求只有一条问题、供应商失败不影响碎片、首次回答成功、不同重复回答为409、跨用户为404。
  - [ ] 入口：运行 [fragment detail tests](tests/e2e/fragment-detail.test.ts#fragment-detail)，保存后立即关闭再打开详情；被测：[FragmentDetailPage](app/fragments/%5Bid%5D/page.tsx#FragmentDetailPage)、[ClarificationCard](src/components/fragments/clarification-card.tsx#ClarificationCard)；Mock：首次保存后的澄清请求未发出；断言：详情补发一次、出现唯一问题、跳过不改变状态、回答跨端一致。
