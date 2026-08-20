# Task Module: M-002 连续思考工作区

## 模块概览
- 模块目标：交付保存后不跳走、断网可恢复、可以持续追加的统一工作区。
- 模块边界：包含首页、详情、IndexedDB同步、最近过程和旧链接兼容；不包含 AI、关系、文件导入和导出。
- 模块依赖：M-001

## 任务卡
### M-002-T-001 交付不中断的连续记录
- 任务目标：用户从一句话开始可在原处连续追加，断网、刷新和重试不丢内容，手机与桌面使用同一过程。
- 设计依据：[TECH-DESIGN.md](TECH-DESIGN.md)验证映射「一句话保存后留在原处；至少可连续追加三段；AI 输出后仍可继续写；桌面与手机使用同一套功能。」及设计落点「retniw-v2稳定工作区」；「输入下一帧可见；断网和刷新不丢；同步失败可重试；失败状态不能伪装成已同步。」及设计落点「本地乐观entry、thought_outbox和独立同步状态」；Brownfield 符号：[CaptureComposer.handleSubmit](src/components/capture/capture-composer.tsx#handleSubmit)、[FragmentTimeline](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)、[RecentFragments](src/components/fragments/recent-fragments.tsx#RecentFragments)、[CapturePage](app/page.tsx#CapturePage)、[CaptureItem](src/lib/capture/capture-store.ts#CaptureItem)、[useCaptureOutbox](src/hooks/use-capture-outbox.ts#useCaptureOutbox)。
- 目标代码/产出物：
  - [ ] 修改现有组件并新增文件与组件：在 `retniw-v2` 将 [CaptureComposer](src/components/capture/capture-composer.tsx#CaptureComposer)改为可持续追加的 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)。
  - [ ] 修改：在 `retniw-v2` 将 [captureStore](src/lib/capture/capture-store.ts#CaptureItem)与 [useCaptureOutbox](src/hooks/use-capture-outbox.ts#useCaptureOutbox)升级为 thought_outbox 多段队列。
  - [ ] 新增文件并创建组件：在 `retniw-v2` 新增 [ThoughtPage](app/thoughts/%5Bid%5D/page.tsx#ThoughtPage)、[ThoughtComposer](src/components/thoughts/thought-composer.tsx#ThoughtComposer)和 [SyncStatus](src/components/thoughts/sync-status.tsx#SyncStatus)；复用 [CapturePage](app/page.tsx#CapturePage)承接旧链接重定向入口。
- 实现步骤：
  1. 从 `submit` 事件进入 [ThoughtComposer](src/components/thoughts/thought-composer.tsx#ThoughtComposer)保留 Enter保存、Shift+Enter换行和中文输入法组词保护；提交时先生成稳定 UUID，将 entry 同步写入页面状态与 IndexedDB。
  2. [useCaptureOutbox](src/hooks/use-capture-outbox.ts#useCaptureOutbox)按本地创建顺序串行调用 M-001 接口；成功只移除对应项，失败保留正文并由 [SyncStatus](src/components/thoughts/sync-status.tsx#SyncStatus)显示真实状态和重试入口。
  3. [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)在首段保存后保持输入区挂载，继续提交时追加到同一 thought；最近过程切换复用同一工作区，不建立固定步骤。
  4. [ThoughtPage](app/thoughts/%5Bid%5D/page.tsx#ThoughtPage)加载完整 entries；旧 [FragmentDetailPage](app/fragments/%5Bid%5D/page.tsx#FragmentDetailPage)将同 ID 地址重定向到新页面。
- 边界与不变约束：
  - [ ] 普通输入不得触发 AI 或关系等待，不要求标题、分类和后续处理。
  - [ ] 同步失败不得清空正文或显示为已同步；不新增聊天气泡、步骤条或新内容实体。
- 前置依赖：M-001-T-001
- 完成定义：
  - [ ] 首页可连续追加至少三段，保存过程无整页跳转；离线刷新后内容仍在，联网重试后顺序与数据库一致。
- 验证方式：
  - [ ] 入口：运行 npm test -- workspace outbox，并用 Chrome 桌面与移动视口执行离线流程；被测：[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)、[useCaptureOutbox](src/hooks/use-capture-outbox.ts#useCaptureOutbox)；Mock：组件测试 Mock API，浏览器验收使用真实 API 与 IndexedDB；断言：下一帧可见、三段连续追加、中文组词不提交、失败状态真实、并发重试无重复、旧链接可达。
