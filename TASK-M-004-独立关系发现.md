# Task Module: M-004 独立关系发现

## 模块概览
- 模块目标：在不打断记录的前提下发现一个可确认关系，并尊重用户的决定。
- 模块边界：包含后台检查、补发、候选展示和确认或否定；不包含可视化图谱、向量库和多候选列表。
- 模块依赖：M-002

## 任务卡
### M-004-T-001 交付不阻塞且不复活的关系
- 任务目标：每次内容同步后可独立检查关系，一次最多出现一个候选；确认前不成为长期关系，否定后同一过程对不再提出。
- 设计依据：[TECH-DESIGN.md](TECH-DESIGN.md)验证映射「关系检查不阻塞输入；一次最多一个候选；候选未经确认不成为长期关系；否定后不重复提出同一对。」及设计落点「独立关系接口、唯一约束和状态分支」；引用[数据库 DDL](TECH-DESIGN.md#数据库-ddl)中的 thought_connections；Brownfield 符号：[ConnectionRepository](src/server/repositories/connection-repository.ts#ConnectionRepository)、[DeepSeekTextProvider.reconnect](src/server/ai/deepseek-text-provider.ts#reconnect)、[FragmentTimeline](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)。
- 目标代码/产出物：
  - [ ] 新增文件并创建符号：在 `retniw-v2` 新增 [ThoughtConnectionRepository](src/server/repositories/thought-connection-repository.ts#ThoughtConnectionRepository)、[POST relation check](app/api/thoughts/%5Bid%5D/relations/check/route.ts#POST)和 [PATCH thought connection](app/api/thought-connections/%5Bid%5D/route.ts#PATCH)。
  - [ ] 修改现有文件并新增方法：在 `retniw-v2` 新增 [DeepSeekTextProvider.findConnection](src/server/ai/deepseek-text-provider.ts#findConnection)，只从给定候选中返回一个结构化结果。
  - [ ] 新增文件并创建组件：在 `retniw-v2` 新增 [RelationCandidate](src/components/thoughts/relation-candidate.tsx#RelationCandidate)和 [useRelationCheck](src/hooks/use-relation-check.ts#useRelationCheck)。
- 实现步骤：
  1. 从 `entry-synced` 事件进入 [useRelationCheck](src/hooks/use-relation-check.ts#useRelationCheck)在 user 或 import entry 同步成功后独立调用关系接口；详情发现检查时间早于活跃时间时补发。
  2. [POST relation check](app/api/thoughts/%5Bid%5D/relations/check/route.ts#POST)读取当前过程与最近20个其他过程；不足两个过程直接记录完成，不调用模型。
  3. [DeepSeekTextProvider.findConnection](src/server/ai/deepseek-text-provider.ts#findConnection)只允许返回给定 thought 与依据 entry；非法目标不写关系。
  4. [ThoughtConnectionRepository](src/server/repositories/thought-connection-repository.ts#ThoughtConnectionRepository)规范化 thought 对：pending返回既有候选，confirmed/rejected不复活，并发冲突后重读；结束时更新 relation_checked_at。
  5. [RelationCandidate](src/components/thoughts/relation-candidate.tsx#RelationCandidate)展示两端原文和理由；[PATCH thought connection](app/api/thought-connections/%5Bid%5D/route.ts#PATCH)只允许 pending 首次决定。
- 边界与不变约束：
  - [ ] 检查失败不锁住输入、AI或导出；只有一段过程时不虚构关系。
  - [ ] 不得增加向量表、图数据库、后台任务表或多候选实体；决定不修改两端正文。
- 前置依赖：M-002-T-001
- 完成定义：
  - [ ] 后台检查、离开后补发、单候选展示和一次性决定均闭合；并发检查不重复，rejected关系不复活。
- 验证方式：
  - [ ] 入口：运行 npm test -- thought-connections，并用真实 Supabase 验证约束；被测：[POST relation check](app/api/thoughts/%5Bid%5D/relations/check/route.ts#POST)、[ThoughtConnectionRepository](src/server/repositories/thought-connection-repository.ts#ThoughtConnectionRepository)、[PATCH thought connection](app/api/thought-connections/%5Bid%5D/route.ts#PATCH)；Mock：DeepSeek返回可 Mock，数据库唯一约束不 Mock；断言：单过程零模型调用、输入不中断、最多一个候选、非法目标拒绝、三种既有状态正确、跨账号404。
