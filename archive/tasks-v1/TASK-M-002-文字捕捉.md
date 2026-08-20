# Task Module: M-002 文字捕捉

## 模块概览

- 模块目标：用户无需标题或分类即可保存文字碎片，断网或失败时内容可恢复且重试不重复写入。
- 模块边界：包含捕捉页、IndexedDB 草稿与重试、碎片保存和最近列表；不包含语音、澄清与连接。
- 模块依赖：M-001

## 任务卡

### M-002-T-001 交付可恢复的文字捕捉

- 任务目标：从 PWA 启动页直接输入和保存原文，失败后可恢复并以同一请求标识安全重试。
- 设计依据：[TECH-DESIGN.md 验证映射](TECH-DESIGN.md#验证映射)「无需标题、分类或输入方式选择即可输入；保存失败不清空内容。」→「`nextjs-pwa`的IndexedDB重试项」；「AI处理前保存原文；重复提交不重复写入；原文不可被AI覆盖。」→「`app-api`的幂等碎片接口」。设计落点「文字捕捉与失败恢复」「原始碎片保存」及 H3「数据库 DDL」中的 `fragments`。现有入口：[App](src/App.tsx#App)、[useNotes.saveNote](src/hooks/useNotes.ts#saveNote)。
- 目标代码/产出物：
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 的 `nextjs-pwa` 新增 [CapturePage](app/page.tsx#CapturePage)、[CaptureComposer](src/components/capture/capture-composer.tsx#CaptureComposer)和 [RecentFragments](src/components/fragments/recent-fragments.tsx#RecentFragments)，替代旧入口。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 新增 [captureStore](src/lib/capture/capture-store.ts#captureStore)和 [useCaptureOutbox](src/hooks/use-capture-outbox.ts#useCaptureOutbox)，管理 IndexedDB `capture_items`。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 的 `app-api` 新增 [POST fragments](app/api/fragments/route.ts#POST)、[GET fragments](app/api/fragments/route.ts#GET)、[GET fragment detail](app/api/fragments/%5Bid%5D/route.ts#GET)和 [FragmentRepository.createIdempotent](src/server/repositories/fragment-repository.ts#createIdempotent)。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 新增 [fragment API integration tests](tests/api/fragments.test.ts#fragments-api)。
- 实现步骤：
  1. [CaptureComposer](src/components/capture/capture-composer.tsx#CaptureComposer)默认聚焦无标题文字区；输入时把 `clientRequestId`、`content`、`inputMode=text`、`state`、`updatedAt`写入 [captureStore](src/lib/capture/capture-store.ts#captureStore)。
  2. [useCaptureOutbox](src/hooks/use-capture-outbox.ts#useCaptureOutbox)向 [POST fragments](app/api/fragments/route.ts#POST)提交本地项；成功后删除草稿，网络或服务失败时保留 `pending`并提供重试。
  3. [POST fragments](app/api/fragments/route.ts#POST)先认证，再校验 UUID、正文 1..10000 和输入方式；[FragmentRepository.createIdempotent](src/server/repositories/fragment-repository.ts#createIdempotent)以 `user_id + client_request_id`创建或读取，首次返回 201、重复返回 200。
  4. [GET fragments](app/api/fragments/route.ts#GET)按 `created_at desc, id desc`返回当前用户最近 20 条及游标；[RecentFragments](src/components/fragments/recent-fragments.tsx#RecentFragments)同时展示服务端碎片和本地 `pending`项。
  5. [GET fragment detail](app/api/fragments/%5Bid%5D/route.ts#GET)先返回当前用户原文和空的澄清、连接结构，为后续模块保留契约；不提供原文更新接口。
- 边界与不变约束：
  - [ ] 保存失败、刷新或离线时不得清空正文；只有服务端确认成功才删除对应 IndexedDB 项。
  - [ ] 同一 `clientRequestId`并发或重复提交只产生一行；AI 后续失败不得回滚或覆盖原文。
  - [ ] 正文、Cookie 和个人内容不得进入日志或 Service Worker 缓存。
- 前置依赖：M-001-T-001
- 完成定义：
  - [ ] 用户可直接保存文字、查看最近碎片和详情；离线失败项恢复后只写入一次，原文没有更新入口。
- 验证方式：
  - [ ] 入口：运行 [fragment API integration tests](tests/api/fragments.test.ts#fragments-api)；被测：[POST fragments](app/api/fragments/route.ts#POST)、[FragmentRepository.createIdempotent](src/server/repositories/fragment-repository.ts#createIdempotent)；Mock：Supabase 测试账号，不 Mock 数据库唯一约束；断言：输入错误码正确、并发同请求返回同一标识且数据库只有一行、另一账号读取为 404。
  - [ ] 入口：Playwright 持久化上下文执行离线输入、提交、刷新、联网重试；被测：[CaptureComposer](src/components/capture/capture-composer.tsx#CaptureComposer)、[useCaptureOutbox](src/hooks/use-capture-outbox.ts#useCaptureOutbox)；Mock：首次 API 网络失败；断言：正文和 `pending`项保留，恢复后列表只出现一条对应碎片。
