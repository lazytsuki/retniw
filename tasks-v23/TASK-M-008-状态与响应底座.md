# Task Module: M-008 状态与响应底座

## 模块概览
- 模块目标：为单层合集、停靠、归档、删除和快速历史摘要提供可回退的数据与接口底座。
- 模块边界：包含TECH-DESIGN数据库DDL、所有权校验、历史摘要和身份校验优化；不包含历史条目手势和停靠界面。
- 模块依赖：无

## 任务卡
### M-008-T-001 交付独立状态与快速摘要
- 任务目标：服务端能独立保存合集归属、归档、删除和停靠状态，历史列表不再读取每个想法的全部正文，身份校验不请求不需要的用户资料。
- 设计依据：[TECH-DESIGN.md](../TECH-DESIGN.md)验证映射「历史列表读取量不随长想法正文增长；详情身份校验不做不需要的远程用户资料查询。」及设计落点「`retniw-api`摘要列与claims校验」；同时覆盖验证映射「数据不越权且可回退」及设计落点「`retniw-api`RLS与所有权过滤」；引用H3「数据库 DDL」中的`thought_collections`、`thought_checkpoints`、`thoughts`新增列与索引。Brownfield符号：[ThoughtRepository.listRecent](../src/server/repositories/thought-repository.ts#listRecent)、[requireUser](../src/lib/auth/require-user.ts#requireUser)、[Thoughts GET](../app/api/thoughts/route.ts#GET)。
- 目标代码/产出物：
  - [x] 修改：在`retniw-api`更新[ThoughtRepository.listRecent](../src/server/repositories/thought-repository.ts#listRecent)、[ThoughtRepository.getOwned](../src/server/repositories/thought-repository.ts#getOwned)和[requireUser](../src/lib/auth/require-user.ts#requireUser)，承担状态读取、单查询摘要和claims身份。
  - [x] 新增文件：在`retniw-api`新增[CollectionRepository](../src/server/repositories/collection-repository.ts#CollectionRepository)、[CheckpointRepository](../src/server/repositories/checkpoint-repository.ts#CheckpointRepository)和[摘要回填脚本](../scripts/backfill-thought-summaries.mjs#main)。
  - [x] 修改：在`retniw-api`按[TECH-DESIGN数据库DDL](../TECH-DESIGN.md#数据库-ddl)同步生产结构，不复制第二份DDL设计。
- 实现步骤：
  1. 按[TECH-DESIGN数据库DDL](../TECH-DESIGN.md#数据库-ddl)创建新表、可空列、约束、索引和RLS，执行后读取真实结构并验证无浏览器策略。
  2. 在[ThoughtRepository.listRecent](../src/server/repositories/thought-repository.ts#listRecent)按`active/archived/deleted`、可选合集和游标单次读取thought摘要；在首次entry保存后通过新增的`ThoughtRepository.setSummaryIfEmpty`只写一次短摘要并返回更新状态。
  3. 在[摘要回填脚本](../scripts/backfill-thought-summaries.mjs#main)对应的`scripts/backfill-thought-summaries.mjs`按页读取旧thought首段并幂等补齐摘要，禁止改写entries正文；重复执行结果一致。
  4. 在[requireUser](../src/lib/auth/require-user.ts#requireUser)使用`getClaims()`校验并只返回可信`id`；缺少、过期或无`sub`时返回401。
  5. 用[ThoughtRepository](../src/server/repositories/thought-repository.ts#ThoughtRepository)和新增repository实现所有权过滤、幂等状态更新及合集删除后的引用解除。
- 边界与不变约束：
  - [x] 新列保持可空，旧应用版本忽略它们仍可读写原有想法；数据库结构不在应用回退时删除。
  - [x] 服务角色查询始终带`user_id`；匿名、第二账号和软删除内容不能通过接口越权访问。
  - [x] 回填只写摘要字段，不修改原文、关系、活跃时间或AI内容。
- 前置依赖：无
- 完成定义：
  - [x] 新结构与RLS生效，旧摘要幂等补齐；大量entries的列表请求只执行摘要查询；合法claims返回用户ID，非法claims返回401。
- 验证方式：
  - [x] 入口：运行`npm test -- tests/api/thought-routes.test.ts tests/auth/auth-boundaries.test.ts`并执行真实Supabase结构、回填和列表回放；被测：[ThoughtRepository.listRecent](../src/server/repositories/thought-repository.ts#listRecent)、[requireUser](../src/lib/auth/require-user.ts#requireUser)主流程；Mock：单元测试Mock Supabase，在线回放不Mock数据库；断言：列表最多21条且不查询entries全集，重复回填无变化，跨账号404，非法claims401。
