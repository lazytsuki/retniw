# Task Module: M-001 安全可安装入口

## 模块概览

- 模块目标：项目所有者可从手机或 Mac 登录同一个可安装 PWA，个人数据只能经服务端身份校验访问。
- 模块边界：包含 Next.js App Router 迁移、PWA 壳、Supabase 身份与三表数据基础；不包含捕捉、转写、澄清和重连业务。
- 模块依赖：无

## 任务卡

### M-001-T-001 建立安全可安装的个人入口

- 任务目标：交付可安装、可登录、可跨端恢复会话且不向浏览器暴露业务表和服务角色密钥的应用入口。
- 设计依据：[TECH-DESIGN.md 验证映射](TECH-DESIGN.md#验证映射)「从手机桌面打开后直接进入捕捉页；手机与Mac访问同一份个人内容。」→「`nextjs-pwa`的PWA入口」；「个人内容仅本人可访问；手机和Mac使用同一身份。」→「`supabase-postgres`的身份外键与无客户端策略RLS」；「所有数据接口先验证当前身份，再限制到该身份拥有的资源。」→「`app-api`的Cookie身份和资源归属检查」；「原文、澄清和连接分别保存；旧语音笔记不迁移；结构只覆盖首版必要实体。」→「`supabase-postgres`三表及约束」；「删除身份不留孤儿数据」→「`supabase-postgres`级联外键」。设计落点「PWA入口与身份」「身份与数据范围」「服务端身份执行」「新数据结构」及 H3「数据库 DDL」。现有入口：[App](src/App.tsx#App)、[supabase](src/lib/supabase.ts#supabase)、[voice_notes](supabase-schema.sql#voice_notes)。
- 目标代码/产出物：
  - [ ] 修改：在 `/Users/liyingliang.7/retniw` 更新 [package scripts](package.json#scripts)及锁文件，将入口从 Vite 切换为 Next.js，同时保留已完成的 retniw 改名和文案变更。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 的 `nextjs-pwa` 新增 [RootLayout](app/layout.tsx#RootLayout)、[LoginPage](app/login/page.tsx#LoginPage)、[CapturePage](app/page.tsx#CapturePage)、[FragmentDetailPage](app/fragments/%5Bid%5D/page.tsx#FragmentDetailPage)、[OfflinePage](app/offline/page.tsx#OfflinePage)、[manifest](app/manifest.ts#manifest)和 [service-worker](public/sw.js#service-worker)。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 的 `app-api` 新增 [createServerAuthClient](src/lib/supabase/server.ts#createServerAuthClient)、[createServiceClient](src/lib/supabase/service.ts#createServiceClient)、[requireUser](src/lib/auth/require-user.ts#requireUser)和 [requireOwnedResource](src/lib/auth/require-owned-resource.ts#requireOwnedResource)。
  - [ ] 应用：在 `supabase-postgres` 新项目执行 [TECH-DESIGN.md 数据库 DDL](TECH-DESIGN.md#数据库-ddl)，创建 `auth.users`引用以及 `fragments`、`clarifications`、`connections`的约束、索引和 RLS；创建项目所有者账号并关闭公开注册。
  - [ ] 删除：在 `/Users/liyingliang.7/retniw` 移除旧 Vite 页面入口 [index.html](index.html#root)、[main](src/main.tsx#createRoot)和 [App](src/App.tsx#App)，移除旧数据与转写链路 [useNotes](src/hooks/useNotes.ts#useNotes)、[supabase](src/lib/supabase.ts#supabase)、[transcribeAudio](src/lib/groq.ts#transcribeAudio)和 [groqProxy](vite.config.ts#groqProxy)。
  - [ ] 删除：在 `/Users/liyingliang.7/retniw` 移除旧页面组件 [NotesList](src/components/NotesList.tsx#NotesList)、[NoteDetail](src/components/NoteDetail.tsx#NoteDetail)、[RecordButton](src/components/RecordButton.tsx#RecordButton)、[RecordingIndicator](src/components/RecordingIndicator.tsx#RecordingIndicator)及旧数据类型 [VoiceNote](src/types/index.ts#VoiceNote)，不迁移旧 `voice_notes` 数据。
  - [ ] 复用：在 `/Users/liyingliang.7/retniw` 保留 [useAudioRecorder](src/hooks/useAudioRecorder.ts#useAudioRecorder)，不在 M-001 删除或改写，交由 M-003 按浏览器录音边界重构。
- 实现步骤：
  1. 从 [package scripts](package.json#scripts)迁移构建入口，建立 [RootLayout](app/layout.tsx#RootLayout)、登录页、在线启动页占位和离线页；注册 manifest 与 Service Worker，后者只缓存版本化静态资源和 `/offline`。
  2. 按 [TECH-DESIGN.md 数据库 DDL](TECH-DESIGN.md#数据库-ddl)创建三张表并启用无客户端策略的 RLS；验证复合外键、唯一约束、检查约束、索引和账号级联删除。
  3. 在 [requireUser](src/lib/auth/require-user.ts#requireUser)通过 Cookie 取得用户；成功后才允许 [createServiceClient](src/lib/supabase/service.ts#createServiceClient)访问业务数据，并由 [requireOwnedResource](src/lib/auth/require-owned-resource.ts#requireOwnedResource)附加 `user_id`。
  4. 未登录访问业务页时进入登录页；已登录访问登录页时返回 `/`；服务端身份失败返回 401，非本人资源统一返回 404。
  5. 删除目标代码/产出物中列出的旧 Vite 入口、组件、匿名数据客户端、Groq 代理和 `VoiceNote` 类型，保留 [useAudioRecorder](src/hooks/useAudioRecorder.ts#useAudioRecorder)供 M-003 重构；随后运行类型检查，确认没有指向已删除文件的 import。
  6. 检查服务角色密钥只存在于服务端环境变量且不使用 `NEXT_PUBLIC_` 前缀，客户端构建产物不得包含该密钥。
- 边界与不变约束：
  - [ ] Service Worker 不得缓存 `/api/`、`/login`、Supabase 请求、带 Cookie 页面或个人内容；离线冷启动只显示离线页。
  - [ ] 三张业务表不得创建客户端访问策略；所有服务角色操作保持先认证并按 `user_id` 限定。
  - [ ] 不迁移旧 `voice_notes`，不得增加独立后端、队列、向量库、图数据库或额外产品实体。
  - [ ] 旧入口清理必须保持 [useAudioRecorder](src/hooks/useAudioRecorder.ts#useAudioRecorder)存在且行为不变，M-001 不得提前承担 M-003 的录音重构。
  - [ ] 账号删除必须级联清理三张表；回滚应用版本时必须保留新表和已写数据。
- 前置依赖：无
- 完成定义：
  - [ ] 手机与 Mac 可安装或访问同一 PWA、使用同一账号恢复会话；未登录和越权访问结果符合契约，数据库结构与 DDL 一致；类型检查中不存在旧入口的断裂 import，且 `useAudioRecorder`仍保留。
- 验证方式：
  - [ ] 入口：运行 lint、类型检查、生产构建和 Route Handler 集成测试，再用移动 WebKit 与 Mac 浏览器验证；被测：[RootLayout](app/layout.tsx#RootLayout)、[requireUser](src/lib/auth/require-user.ts#requireUser)、[requireOwnedResource](src/lib/auth/require-owned-resource.ts#requireOwnedResource)；Mock：Cookie 会话和服务角色客户端；断言：无 Cookie 为 401、跨账号资源为 404、已登录冷启动进入 `/`、离线冷启动进入 `/offline`、客户端产物无服务角色密钥。
  - [ ] 入口：执行匿名密钥、普通会话和 Supabase Auth 管理端验证；被测：[TECH-DESIGN.md 数据库 DDL](TECH-DESIGN.md#数据库-ddl)；Mock：无；断言：客户端直连三表无权限，约束和索引存在，删除测试账号后三表无对应记录，旧数据未进入新项目。
