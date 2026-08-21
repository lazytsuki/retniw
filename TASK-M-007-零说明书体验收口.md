# Task Module: M-007 零说明书体验收口

## 模块概览
- 模块目标：让首次用户不看说明也能完成新建、继续、回看和另起想法，并明确感知 AI 只是按需工具。
- 模块边界：包含统一工作区导航、首次空白状态、按需 AI 层级、所有想法分页、移动与桌面适配及必要文档同步；不新增标题、标签、文件夹、搜索、聊天或数据结构。
- 模块依赖：M-002、M-003、M-004、M-005、M-006

## 任务卡
### M-007-T-001 交付不用说明书的想法工作区
- 任务目标：用户在手机和 Mac 上都能直接“写新想法”或打开“以前的想法”，当前想法就在主区继续；不调用 AI 也能完成完整闭环，AI 能力按用户意图分层出现。
- 设计依据：[TECH-DESIGN.md](TECH-DESIGN.md)的统一工作区导航、页面状态表达、主动AI和独立关系检查。Brownfield 符号：[AppHeader](src/components/app-header.tsx#AppHeader)、[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)、[ThoughtComposer](src/components/thoughts/thought-composer.tsx#ThoughtComposer)、[ThoughtRepository.listRecent](src/server/repositories/thought-repository.ts#listRecent)、[DeepSeekTextProvider.findConnection](src/server/ai/deepseek-text-provider.ts#findConnection)、[ThoughtConnectionRepository](src/server/repositories/thought-connection-repository.ts#ThoughtConnectionRepository)。受影响符号：AppHeader、ThoughtWorkspace、ThoughtNavigation、ThinkingAssist、ThoughtMenu、GET /api/thoughts、ThoughtComposer、EntryContent、DeepSeekTextProvider.streamText、DeepSeekTextProvider.findConnection、ThoughtConnectionRepository、POST /api/thoughts/[id]/relations/check、PATCH /api/thought-connections/[id]。
- 目标代码/产出物：
  - [x] 修改现有组件：更新 [AppHeader](src/components/app-header.tsx#AppHeader)、[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)、[ThoughtComposer](src/components/thoughts/thought-composer.tsx#ThoughtComposer)、[ImportTextDialog](src/components/thoughts/import-text-dialog.tsx#ImportTextDialog)和 [ExportMenu](src/components/thoughts/export-menu.tsx#ExportMenu)，分别承担安静页头、工作区状态、直接输入、导入和导出语义；删除旧`AiActions`。
  - [x] 新增文件并创建组件：新增 [ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)、[ThinkingAssist](src/components/thoughts/thinking-assist.tsx#ThinkingAssist)、[ThoughtMenu](src/components/thoughts/thought-menu.tsx#ThoughtMenu)与[aiOutputForDisplay](src/lib/ai-output.ts#aiOutputForDisplay)，分别承担两项导航、单一继续入口、次级管理操作和旧前缀清理。
  - [x] 修改页面与样式：在当前仓库更新 [CapturePage](app/page.tsx#CapturePage)、详情页数据入口、[ThoughtSkeleton](src/components/thoughts/thought-skeleton.tsx#ThoughtSkeleton)和 [global styles](src/index.css#thought-layout)，传入下一游标并覆盖320至1440像素工作区布局。
  - [x] 修改测试与文档：更新 [workspace acceptance tests](tests/ui/thought-workspace.test.ts#thought-workspace)、[composer tests](tests/workspace/composer.test.ts#thought-composer)和 [README](README.md#retniw)，验证入口语义、按需模型边界、分页与正式域名。
- 实现步骤：
  1. 从 [CapturePage](app/page.tsx#CapturePage)和详情页读取首批thought与`nextCursor`，由 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)合并当前乐观内容和已加载历史；点击加载更多时调用 [Thoughts GET](app/api/thoughts/route.ts#GET)，按ID去重追加并更新游标，失败只在列表内显示可重试状态。
  2. 在 [ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)只固定提供“写新想法”和“以前的想法”；桌面常驻第一段原文摘录列表，移动端在主区上方常驻两项导航并用视口级面板展示同一列表，当前想法留在主区，不做第三个同级入口。
  3. 在 [AppHeader](src/components/app-header.tsx#AppHeader)移除返回、品牌首页跳转和大横条玻璃容器，将退出收进账号入口；在 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)用“写下你正在想的”直接说明当前动作；为首页工作区设置独立key，并区分用户明确新建与断网草稿恢复，确保新建不是只改变URL，也不会被旧话题的后台同步回写。
  4. 在 [ThoughtComposer](src/components/thoughts/thought-composer.tsx#ThoughtComposer)根据是否已有内容切换“写在这里/接着写”；在 [ImportTextDialog](src/components/thoughts/import-text-dialog.tsx#ImportTextDialog)与 [ExportMenu](src/components/thoughts/export-menu.tsx#ExportMenu)统一使用“想法”而非“过程”。
  5. 在 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)仅于已有用户内容时渲染“帮我接着想”；服务端自行选择问一句或给一个角度，不再输出“可以继续写”前缀。整理进入更多操作，找联系进入旧想法区域；关系候选只使用user/import entries，不能把AI输出当作用户想法。
  6. 在 [global styles](src/index.css#thought-layout)实现桌面侧栏、移动常驻导航和所有想法面板，确保导航不遮住输入，保持正文平面、高可读且无横向溢出；同步调整 [ThoughtSkeleton](src/components/thoughts/thought-skeleton.tsx#ThoughtSkeleton)避免切换时布局突变。
  7. 用 [workspace acceptance tests](tests/ui/thought-workspace.test.ts#thought-workspace)和 [composer tests](tests/workspace/composer.test.ts#thought-composer)覆盖结构与状态边界，并在 [README](README.md#retniw)把内测入口统一为`https://retniw.cn`，将旧`vercel.app`说明为永久跳转的备用地址。
  8. 根据现网反馈修正左栏滚动所有权：侧栏只允许纵向滚动，历史项不再横移；关闭历史详情的批量预取，详情与AI前置查询改为并行，点击后立即在原入口显示状态。
- 边界与不变约束：失败、兼容与明确不变行为如下。
  - [x] 历史为空、超过二十条或加载失败时都不能失去写新想法入口和当前主区；列表只读取当前账号，不能用客户端隐藏替代服务端所有权校验。
  - [x] 新建或切换不能等待同步，也不能清除`thought_outbox`中的草稿和失败项；普通保存、导入、打开详情均不得自动调用DeepSeek。
  - [x] 不得新增标题、标签、文件夹、搜索页、教程弹窗、示例聊天、自动欢迎回复、第二模型或数据库变更。
- 前置依赖：M-002-T-001、M-003-T-001、M-004-T-001、M-005-T-001、M-006-T-001
- 完成定义：
  - [x] 新账号和已有内容账号在手机与Mac均能完成“写下—接着想—另起—从以前的想法回来”，空白页无AI入口或模型请求；详情点击写新想法后正文为空；所有想法可加载超过二十条，正式域名文档与线上行为一致。
- 验证方式：
  - [x] 入口：运行`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`，再用Playwright或真实浏览器验证320、375、768、1024、1440像素和移动/桌面交互；被测：[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)、[ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)主流程；Mock：自动测试只Mock浏览器和网络边界，跨端验收使用真实Next.js页面；断言：两个导航动作始终可达、无横向溢出、空白页无AI、普通保存无关系请求、AI无指令式前缀、关系不使用AI entry、分页去重、新建状态真正清空且未同步内容仍可恢复。
