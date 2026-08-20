# Task Module: M-006 预览交付

## 模块概览

- 模块目标：把首版部署到可在真实手机和 Mac 验证的 Vercel 预览环境，并形成可复现的交付证据。
- 模块边界：包含构建、环境配置、预览部署和端到端冒烟；不增加产品能力，不切换正式域名。
- 模块依赖：M-004、M-005

## 任务卡

### M-006-T-001 完成跨端预览验收

- 任务目标：以真实预览环境证明登录、文字、澄清、重连、离线恢复和隐私边界可用。
- 设计依据：[TECH-DESIGN.md 验证映射](TECH-DESIGN.md#验证映射)「工程可交付」→「`nextjs-pwa`、`app-api`、`supabase-postgres`」；设计落点「风险与交付」。
- 目标代码/产出物：
  - [ ] 修改：在 `/Users/liyingliang.7/retniw` 更新 [package scripts](package.json#scripts)和测试配置，使 lint、类型检查、单元与集成测试、生产构建可重复执行。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 新增 [Next configuration](next.config.ts#nextConfig)，固定生产构建和 PWA 交付配置。
  - [ ] 配置：按 [TECH-DESIGN.md 风险与交付](TECH-DESIGN.md#风险与交付)配置 `Vercel Preview`项目的Supabase与DeepSeek环境变量；密钥不落入仓库文件或交付记录。
  - [ ] 更新：在 [TASK-STATUS.md 任务状态总览](TASK-STATUS.md#任务状态总览)的 `M-006-T-001`记录 Vercel 预览地址、验证命令、环境、通过项和未通过项，不记录个人内容或凭据。
- 实现步骤：
  1. 从 [package scripts](package.json#scripts)执行 `npm run lint`、类型检查、单元与集成测试和生产构建，读取退出码并修复本轮问题，输出完整通过状态。
  2. 依据 [Next configuration](next.config.ts#nextConfig)配置 Vercel 变量并触发预览部署；检查浏览器产物、网络请求和日志，输出无密钥、无个人内容缓存的检查结果。
  3. 打开 [CapturePage](app/page.tsx#CapturePage)，用手机WebKit从桌面图标联网冷启动并提交文字、澄清和连接决策；再由Mac同账号读取，输出跨端一致状态。
  4. 在 [CapturePage](app/page.tsx#CapturePage)已打开时断网输入并提交，刷新与联网后触发重试；另做离线冷启动，断言只出现离线页并在联网后恢复草稿。
  5. 模拟DeepSeek不可用，断言原文保持可读、错误可重试且不切换供应商；将结果更新到 [TASK-STATUS.md](TASK-STATUS.md#任务状态总览)，保持正式域名不变。
- 边界与不变约束：
  - [ ] 没有新鲜命令输出和真实浏览器证据不得标记完成；失败项如实保留。
  - [ ] 预览部署不得切换正式域名、迁移旧数据或删除新表；回滚只回退 Vercel 应用版本并保持数据不变。
  - [ ] 验证记录不得包含个人正文、回答、音频、Cookie、密钥或服务角色值。
- 前置依赖：M-004-T-001、M-005-T-001
- 完成定义：
  - [ ] 本地质量命令全部通过，预览环境在手机和 Mac 完成主路径与边界冒烟，隐私检查无泄漏，结果有可复查证据。
- 验证方式：
  - [ ] 入口：运行 [package scripts](package.json#scripts)定义的lint、类型检查、单元与集成测试、生产构建；被测：[Next configuration](next.config.ts#nextConfig)及全套业务入口；Mock：测试阶段按各模块约定，生产构建无；断言：命令退出码均为0，客户端产物无服务角色或DeepSeek密钥。
  - [ ] 入口：Vercel预览地址的手机WebKit与Mac浏览器冒烟；被测：[CapturePage](app/page.tsx#CapturePage)、[FragmentDetailPage](app/fragments/%5Bid%5D/page.tsx#FragmentDetailPage)、[service-worker](public/sw.js#service-worker)；Mock：一次DeepSeek 503和一次网络中断；断言：跨端内容一致、失败不丢原文、离线行为符合决策、日志与缓存无个人内容。
