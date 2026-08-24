# Task Module: M-013 生命周期与历史层级

## 模块概览
- 模块目标：把归档恢复为“以前的想法”的子视图，并让新删除在强确认后不可恢复地生效。
- 模块边界：包含历史根与归档子视图、统一删除确认、HTTP DELETE、所有权与未删除过滤；不清理历史软删除数据。
- 模块依赖：无

## 任务卡
### M-013-T-001 交付删除与归档子视图
- 任务目标：最近内容、合集与归档形成清楚的父子层级；所有删除入口共用同一强确认，确认后想法、从属内容与相关联系不可再读取。
- 设计依据：[TECH-DESIGN.md](../TECH-DESIGN.md#验证映射)验证映射需求原文「进入归档后不出现“全部”或“已删除”标签；取消归档后回到最近内容，合集归属不变。」与设计落点原文「`retniw-web`历史根与归档」；需求原文「所有删除入口都先强提醒，确认后无法恢复，想法、内容和相关联系不可再读取。」与设计落点原文「`retniw-web`删除交互；`retniw-api`DELETE」；需求原文「确认后物理删除当前用户的可见想法及从属内容；历史软删除数据继续隐藏且不批量清理。」与设计落点原文「`retniw-api`DELETE与未删除过滤」；需求原文「删除、回看和导出不泄露旧软删除或他人内容」与设计落点原文「`retniw-api`所有权与未删除过滤」。Brownfield受影响符号原文：`ThoughtNavigation`、`navigationContent`、`View`、`GET /api/thoughts`；`ThoughtActionMenu`、`ThoughtListItem`、`ThoughtNavigation.performAction`、删除确认`dialog`；`ThoughtRepository.deleteOwned`、`DELETE /api/thoughts/:id`、`parseThoughtAction`、`ThoughtExportRepository`。
- 目标代码/产出物：
  - [ ] 修改：在 `retniw-web` 更新 [ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)、[View](src/components/thoughts/thought-navigation.tsx#View) 与 [navigationContent](src/components/thoughts/thought-navigation.tsx#navigationContent)，移除已删除视图并建立历史根与归档子视图。
  - [ ] 修改：在 `retniw-web` 更新 [ThoughtActionMenu](src/components/thoughts/thought-action-menu.tsx#ThoughtActionMenu)、[ThoughtListItem](src/components/thoughts/thought-list-item.tsx#ThoughtListItem)、[ThoughtNavigation.performAction](src/components/thoughts/thought-navigation.tsx#performAction) 与删除确认 [dialog](src/components/thoughts/thought-navigation.tsx#deleteDialogRef)，统一更多、右键、左滑和长按后的删除确认。
  - [ ] 新增方法与路由：在 `retniw-api` 为 [ThoughtRepository.deleteOwned](src/server/repositories/thought-repository.ts#deleteOwned) 实现带所有权及未删除条件的物理删除，由 `DELETE /api/thoughts/:id` 调用，并修改 [parseThoughtAction](src/server/thoughts/parse-thought-management.ts#parseThoughtAction) 只接受移动与归档动作。
  - [ ] 修改：在 `retniw-api` 更新 [GET /api/thoughts](app/api/thoughts/route.ts#GET)、[ThoughtRepository.listRecent](src/server/repositories/thought-repository.ts#listRecent) 与 [ThoughtExportRepository](src/server/repositories/thought-export-repository.ts#ThoughtExportRepository)，只读取当前用户未删除的 active/archived 内容及其导出数据。
- 实现步骤：
  1. 从 [GET /api/thoughts](app/api/thoughts/route.ts#GET) 接收 `scope`、`collectionId` 与 `cursor` 输入，在 [ThoughtRepository.listRecent](src/server/repositories/thought-repository.ts#listRecent) 校验只允许 `active | archived`，过滤 `deleted_at is not null` 后返回历史根或归档页数据。
  2. 在 [ThoughtNavigation.navigationContent](src/components/thoughts/thought-navigation.tsx#navigationContent) 根据 [View](src/components/thoughts/thought-navigation.tsx#View) 判断根视图或归档子视图：根视图展示最近内容、合集和次级入口，归档视图展示返回按钮、标题与空态，取消归档后输出到最近内容并保持合集 ID。
  3. 从 [ThoughtListItem](src/components/thoughts/thought-list-item.tsx#ThoughtListItem) 的更多、右键、左滑或长按事件进入 [ThoughtActionMenu](src/components/thoughts/thought-action-menu.tsx#ThoughtActionMenu)，选择删除只打开 [dialog](src/components/thoughts/thought-navigation.tsx#deleteDialogRef)；取消保持数据不变，确认禁用重复提交并调用 [ThoughtNavigation.performAction](src/components/thoughts/thought-navigation.tsx#performAction)。
  4. 在 [DELETE /api/thoughts/:id](app/api/thoughts/[id]/route.ts#DELETE) 读取认证用户与 UUID，调用 [ThoughtRepository.deleteOwned](src/server/repositories/thought-repository.ts#deleteOwned) 按 `user_id + id + deleted_at is null` 执行物理删除；命中返回 204，非本人、旧软删除或重复请求返回 404，约束冲突返回 409。
  5. 在 [ThoughtExportRepository](src/server/repositories/thought-export-repository.ts#ThoughtExportRepository) 为 thought、entry、checkpoint 与 confirmed connection 查询增加未删除 thought 集合边界，输出中不包含旧软删除或其他账号内容；删除成功时 [ThoughtNavigation.performAction](src/components/thoughts/thought-navigation.tsx#performAction) 移除条目，若为当前想法则路由到 `/`，请求失败则恢复条目并展示重试提示。
- 边界与不变约束：
  - [ ] 生产外键读回不存在 `entries`、`thought_checkpoints` 或 `thought_connections` 两端的 CASCADE 证据时不得发布物理删除，也不得用应用层多步删除绕过原子性。
  - [ ] 删除请求失败、重复或越权时必须保持原条目可见并返回 404/409，前端不得伪装成功。
  - [ ] 归档与取消归档不得改变合集、停靠点、原文或关系；删除合集保持只解除归属的既有行为。
  - [ ] 历史 `deleted_at is not null` 行必须继续隐藏且不得批量清理，新 DELETE 不得命中这些兼容数据。
- 前置依赖：无
- 完成定义：
  - [ ] 桌面侧栏和移动历史面板均只有历史根与归档子视图，归档返回和取消归档保持合集归属。
  - [ ] 四种删除入口显示同一“取消 / 删除”确认层，成功后深链及从属数据不可读取，产品中不存在恢复入口。
- 验证方式：
  - [ ] 入口：运行 `npm test -- tests/api/thought-management-routes.test.ts tests/unit/thought-lifecycle-repositories.test.ts tests/ui/thought-workspace.test.ts` 并在 Chromium、WebKit 执行四种入口回放；被测：[ThoughtRepository.deleteOwned](src/server/repositories/thought-repository.ts#deleteOwned)、[GET /api/thoughts](app/api/thoughts/route.ts#GET)、[ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)；Mock：路由测试 Mock Supabase 与前端测试 Mock fetch，真实环境只读回 Supabase 外键和删除后行数；断言：active/archived 以外 scope 返回 400，取消不发 DELETE，确认只发一次，204 后 thought、entries、checkpoints、connections 为 0，404/409 时 UI 回滚，320、375、1024、1440 像素均无“全部”或“已删除”标签。
