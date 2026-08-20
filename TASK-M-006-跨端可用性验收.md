# Task Module: M-006 跨端可用性验收

## 模块概览
- 模块目标：完成手机与 Mac 的同功能适配、加载承接、跨端一致性和首版全链路验证。
- 模块边界：包含响应式布局、局部加载、位置恢复、PWA边界和完整回归；不新增产品能力。
- 模块依赖：M-003、M-004、M-005

## 任务卡
### M-006-T-001 完成跨端可用版本验收
- 任务目标：用户在手机和 Mac 上都能自然完成记录、继续、主动 AI、关系处理、导入和导出，等待有反馈且个人内容不被缓存或越权读取。
- 设计依据：[TECH-DESIGN.md](TECH-DESIGN.md)验证映射「切换时先显示内容或骨架，不出现整页空白；返回同一过程后恢复阅读和输入位置。」及设计落点「缓存内容、ThoughtSkeleton和useThoughtPosition」；「个人内容仅本人可访问，服务角色和模型密钥不进入浏览器。」及设计落点「RLS无客户端策略、服务端userId过滤」；Brownfield 符号：[CapturePage](app/page.tsx#CapturePage)、[Service Worker](public/sw.js#fetch)、[RootLayout](app/layout.tsx#RootLayout)。受影响符号：requireUser、createServiceClient、ThoughtRepository、EntryRepository、ThoughtConnectionRepository。
- 目标代码/产出物：
  - [x] 新增文件并修改前置任务符号：在 `retniw-v2` 更新 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)、[global styles](src/index.css#app-shell)和 [RootLayout](app/layout.tsx#RootLayout)。
  - [x] 新增文件并创建符号：在 `retniw-v2` 新增 [ThoughtSkeleton](src/components/thoughts/thought-skeleton.tsx#ThoughtSkeleton)、[useThoughtPosition](src/hooks/use-thought-position.ts#useThoughtPosition)和 [Thought loading](app/thoughts/%5Bid%5D/loading.tsx#ThoughtLoading)。
  - [x] 修改现有文件并新增文件与测试符号：在 `retniw-v2` 复核 [Service Worker](public/sw.js#fetch)，并新增 [workspace acceptance tests](tests/ui/thought-workspace.test.ts#thought-workspace)与 [live verification](scripts/verify-retniw-v2-live.mjs#verifyRetniwV2Live)。
- 实现步骤：
  1. 从 `workspace` 入口进入 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)在手机保持打开即写和单手操作，在宽屏展示当前过程与辅助信息；两端不分叉功能。
  2. [ThoughtSkeleton](src/components/thoughts/thought-skeleton.tsx#ThoughtSkeleton)在无缓存初载时承接页面；已有本地内容时先显示内容，各异步区域只显示自身状态。
  3. [useThoughtPosition](src/hooks/use-thought-position.ts#useThoughtPosition)按 thought ID在同一设备恢复滚动和未提交输入；跨端共享服务端内容、顺序、来源和关系。
  4. [Service Worker](public/sw.js#fetch)继续只缓存静态资源与离线页；API、Cookie页面和流式导出均走网络。
  5. [verifyRetniwV2Live](scripts/verify-retniw-v2-live.mjs#verifyRetniwV2Live)依次验证空白用户、旧数据用户、离线恢复、DeepSeek流、关系决定、导入导出和第二账号隔离。
- 边界与不变约束：
  - [x] 不得用全屏 loading 覆盖独立状态，不为了视觉效果增加新流程；不得缓存个人正文、API和导出。
  - [x] 3秒首段目标必须使用真实 DeepSeek和正常网络记录，不得用 Mock结果证明。
- 前置依赖：M-003-T-001、M-004-T-001、M-005-T-001
- 完成定义：
  - [x] 自动检查、生产构建、真实 Supabase、真实 DeepSeek、手机和 Mac 全链路均通过；没有旧表新写入、越权、整页空白或输入阻塞。
- 验证方式：
  - [x] 入口：运行 npm run lint、npm run typecheck、npm test、npm run build，再执行 [verifyRetniwV2Live](scripts/verify-retniw-v2-live.mjs#verifyRetniwV2Live)和手机/Mac人工流程；被测：[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)及全部公开入口；Mock：自动单测按模块边界 Mock，最终验收不 Mock Supabase和DeepSeek；断言：跨端同内容同顺序、局部加载、位置恢复、时延记录、离线恢复、RLS隔离、导出完整、旧表零新增。
