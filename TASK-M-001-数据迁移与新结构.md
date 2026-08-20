# Task Module: M-001 数据迁移与新结构

## 模块概览
- 模块目标：建立持续思考数据结构，完整迁移现有内容，并提供可幂等读写的新接口。
- 模块边界：包含新三表、repository、基础 API、迁移和核对；不包含工作区页面、AI、关系生成和导出界面。
- 模块依赖：无

## 任务卡
### M-001-T-001 保留旧内容并启用持续思考结构
- 任务目标：现有碎片、问题、回答和关系无损进入新结构；新接口能创建过程、追加内容并按过程回读，重复请求不重复写入。
- 设计依据：[TECH-DESIGN.md](TECH-DESIGN.md)验证映射「现有用户内容不清空，旧链接可继续打开，新代码不继续产生旧结构数据。」及设计落点「幂等迁移、旧链接重定向和旧写入口停用」；「短内容和连续内容使用同一结构；用户、导入和 AI 内容分别保存；最近记录按过程归组。」及设计落点「thoughts + entries和entry类型」；引用[数据库 DDL](TECH-DESIGN.md#数据库-ddl)中的 thoughts、entries、thought_connections；Brownfield 符号：[FragmentRepository.createIdempotent](src/server/repositories/fragment-repository.ts#createIdempotent)、[FragmentDetailRepository.get](src/server/repositories/fragment-detail-repository.ts#get)、[ConnectionRepository](src/server/repositories/connection-repository.ts#ConnectionRepository)。受影响符号：requireUser、createServiceClient、ThoughtRepository、EntryRepository、ThoughtConnectionRepository；scripts/migrate-fragments-to-thoughts.mjs、fragments、clarifications、connections、thoughts、entries、thought_connections。
- 目标代码/产出物：
  - [ ] 新增文件并创建符号：在 `retniw-v2` 新增 [ThoughtRepository](src/server/repositories/thought-repository.ts#ThoughtRepository)、[EntryRepository](src/server/repositories/entry-repository.ts#EntryRepository)、[GET/POST thoughts](app/api/thoughts/route.ts#POST)、[GET thought](app/api/thoughts/%5Bid%5D/route.ts#GET)与 [POST entry](app/api/thoughts/%5Bid%5D/entries/route.ts#POST)。
  - [ ] 新增文件并创建函数：在 `retniw-v2` 新增 [migrateFragmentsToThoughts](scripts/migrate-fragments-to-thoughts.mjs#migrateFragmentsToThoughts)，只执行设计已确定的数据映射。
  - [ ] 复用：在 `retniw-v2` 复用 [requireUser](src/lib/auth/require-user.ts#requireUser)和 [createServiceClient](src/lib/supabase/service.ts#createServiceClient)。
- 实现步骤：
  1. 从 `数据库 DDL` 入口按[数据库 DDL](TECH-DESIGN.md#数据库-ddl)原样在 Supabase 建立新三表、约束、索引和 RLS，不复制或改写第二份 SQL。
  2. [POST thoughts](app/api/thoughts/route.ts#POST)先保证 thought 存在，再由 [EntryRepository](src/server/repositories/entry-repository.ts#EntryRepository)按用户与请求 UUID 幂等写入首条 entry，最后补齐活跃时间。
  3. [POST entry](app/api/thoughts/%5Bid%5D/entries/route.ts#POST)校验所有权后追加 user 或 import entry；entry 已存在但活跃时间未更新时，重试只补更新时间。
  4. [migrateFragmentsToThoughts](scripts/migrate-fragments-to-thoughts.mjs#migrateFragmentsToThoughts)将 fragment 映射为同 ID thought，将原文、问题、回答依时间映射为不同 entry，将旧 connection 映射为 thought connection并保留状态与时间；重复执行只补缺失记录。
  5. [GET thoughts](app/api/thoughts/route.ts#GET)只返回至少有一条 entry 的过程；[GET thought](app/api/thoughts/%5Bid%5D/route.ts#GET)按 created_at,id 返回完整顺序和关系两端原文。
- 边界与不变约束：
  - [ ] 不删除旧表，不修改旧正文，不把旧自动问题标成用户内容；所有服务角色查询限制 user_id，非本人资源返回404。
  - [ ] 部分写入失败返回可重试错误；同一请求重复重试后只能得到一条 entry。
- 前置依赖：无
- 完成定义：
  - [ ] 新三表与 RLS 生效；迁移脚本执行两次结果一致；新接口完成创建、追加、列表和详情回读；旧数据逐项核对无缺失。
- 验证方式：
  - [ ] 入口：运行 npm test -- thoughts、真实 Supabase DDL 与迁移脚本；被测：[POST thoughts](app/api/thoughts/route.ts#POST)、[POST entry](app/api/thoughts/%5Bid%5D/entries/route.ts#POST)、[migrateFragmentsToThoughts](scripts/migrate-fragments-to-thoughts.mjs#migrateFragmentsToThoughts)；Mock：API单测 Mock Supabase，迁移核对不 Mock数据库约束；断言：并发幂等、部分失败可恢复、跨账号404、迁移前后正文与关系一致、旧表仍存在。
