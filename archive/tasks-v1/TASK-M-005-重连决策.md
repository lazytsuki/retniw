# Task Module: M-005 重连决策

## 模块概览

- 模块目标：系统可在最近碎片中提出一个连接候选，并只在用户确认后形成已确认关系。
- 模块边界：包含候选生成、幂等补发、确认或否定、双方原文展示；不引入向量检索或后台任务。
- 模块依赖：M-004

## 任务卡

### M-005-T-001 交付不复活已决定关系的重连

- 任务目标：至少两条碎片时最多提出一个合法候选，用户可确认或否定，已决定的碎片对不再出现且并发冲突不返回 500。
- 设计依据：[TECH-DESIGN.md 验证映射](TECH-DESIGN.md#验证映射)「原文保存后出现一个可跳过的问题；候选连接在用户确认前不得成为长期关系；两端展示一致。」→「`nextjs-pwa`的详情时间线」；「至少两条碎片才可能出现候选；一次只有一个；确认前不建立长期关系。」→「`app-api`的Reconnect和决策接口」。设计落点「澄清、重连与回看」「Reconnect与用户决策」及 H3「数据库 DDL」中的 `connections`。现有数据形态：[VoiceNote](src/types/index.ts#VoiceNote)。
- 目标代码/产出物：
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 的 `app-api` 新增 [POST reconnect](app/api/fragments/%5Bid%5D/reconnect/route.ts#POST)、[PATCH connection](app/api/connections/%5Bid%5D/route.ts#PATCH)、[DeepSeekTextProvider.reconnect](src/server/ai/deepseek-text-provider.ts#reconnect)和 [ConnectionRepository.decide](src/server/repositories/connection-repository.ts#decide)。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 的 `nextjs-pwa` 新增 [ConnectionCandidate](src/components/fragments/connection-candidate.tsx#ConnectionCandidate)，接入 [FragmentTimeline](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)，并复用 [ClarificationCard](src/components/fragments/clarification-card.tsx#ClarificationCard)与 [RecentFragments](src/components/fragments/recent-fragments.tsx#RecentFragments)形成完整详情时间线。
  - [ ] 前置任务新增文件、当前任务修改：在 `/Users/liyingliang.7/retniw` 扩充 [GET fragment detail](app/api/fragments/%5Bid%5D/route.ts#GET)，返回 `reconnectCheckedAt`以及每条连接对端碎片的 `id`、`content`、`createdAt`；由 [useCaptureOutbox](src/hooks/use-capture-outbox.ts#useCaptureOutbox)触发重连请求。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 新增 [reconnect API tests](tests/api/reconnect.test.ts#reconnect-api)和 [connection decision tests](tests/e2e/connection-decision.test.ts#connection-decision)。
- 实现步骤：
  1. M-002 保存成功后并行调用 [POST reconnect](app/api/fragments/%5Bid%5D/reconnect/route.ts#POST)；[FragmentDetailPage](app/fragments/%5Bid%5D/page.tsx#FragmentDetailPage)在 `reconnectCheckedAt`为空时补发同一接口。
  2. [POST reconnect](app/api/fragments/%5Bid%5D/reconnect/route.ts#POST)读取当前碎片及同用户最近 20 条其他碎片和已有澄清回答；不足两条时只写检查时间并返回空候选。
  3. [DeepSeekTextProvider.reconnect](src/server/ai/deepseek-text-provider.ts#reconnect)通过JSON Output返回候选标识或空结果；服务端只接受输入集合内的标识，并规范化源、目标顺序。
  4. 插入前查询规范化碎片对：已有 `pending`返回原候选；已有 `confirmed`或`rejected`返回空候选并写检查时间；并发撞唯一约束时重读并走相同分支；新碎片对最多写一条 `pending`并更新检查时间。
  5. [ConnectionCandidate](src/components/fragments/connection-candidate.tsx#ConnectionCandidate)同时展示双方原文，只提供确认和不成立；[PATCH connection](app/api/connections/%5Bid%5D/route.ts#PATCH)通过 [ConnectionRepository.decide](src/server/repositories/connection-repository.ts#decide)将 `pending`一次性改为 `confirmed`或`rejected`，冲突返回 409。
  6. [GET fragment detail](app/api/fragments/%5Bid%5D/route.ts#GET)从任一端读取关系时均返回一致状态和对端原文；直接离开详情不改变 `pending`。
- 边界与不变约束：
  - [ ] 候选集合必须保持为同用户最近 20 条其他碎片；非法、跨用户或集合外目标不得写入关系。
  - [ ] `confirmed`和`rejected`碎片对不得复活；唯一约束竞争按既有状态处理，不返回 500。
  - [ ] 确认前状态必须保持 `pending`；离开页面不得等同确认或否定；一次检查最多一个候选。
  - [ ] 不得增加嵌入、向量库、图数据库、队列、定时任务或第二模型供应商。
- 前置依赖：M-004-T-001
- 完成定义：
  - [ ] 单条、无候选、pending、confirmed、rejected、并发和越权场景均有确定结果；详情两端展示一致且已决定关系不复活。
- 验证方式：
  - [ ] 入口：运行 [reconnect API tests](tests/api/reconnect.test.ts#reconnect-api)；被测：[POST reconnect](app/api/fragments/%5Bid%5D/reconnect/route.ts#POST)、[DeepSeekTextProvider.reconnect](src/server/ai/deepseek-text-provider.ts#reconnect)、[ConnectionRepository.decide](src/server/repositories/connection-repository.ts#decide)；Mock：DeepSeek Chat Completions；断言：单条和空结果写检查时间、非法目标为`AI_UNAVAILABLE`且不写关系、并发仅一条、pending返回既有、confirmed/rejected返回空且不复活、跨用户为404、所有路径均不返回500。
  - [ ] 入口：运行 [connection decision tests](tests/e2e/connection-decision.test.ts#connection-decision)；被测：[ConnectionCandidate](src/components/fragments/connection-candidate.tsx#ConnectionCandidate)、[GET fragment detail](app/api/fragments/%5Bid%5D/route.ts#GET)、[PATCH connection](app/api/connections/%5Bid%5D/route.ts#PATCH)；Mock：固定候选返回；断言：双方原文可见、确认后两端一致、否定后不再出现、离开保持 pending、冲突决定为 409。
