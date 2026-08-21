# Task Module: M-010 想法管理与合集

## 模块概览
- 模块目标：用户能在手机和桌面自然地移入、归档和删除以前的想法，并通过单层合集回看内容。
- 模块边界：包含合集和想法状态接口、历史信息架构、显式入口、右键、左滑、长按及恢复；不做嵌套、标签、永久删除和自动分类。
- 模块依赖：M-008、M-009

## 任务卡
### M-010-T-001 交付跨端想法管理
- 任务目标：一个想法最多属于一个合集，归档只移出最近列表，删除可恢复；桌面和移动端的显式入口与快捷手势执行同一语义。
- 设计依据：[TECH-DESIGN.md](../TECH-DESIGN.md)验证映射「一个想法可移入单层合集、归档或删除；移动端支持左滑与长按，桌面支持更多与右键，语义一致。」及设计落点「`retniw-web`历史管理；`retniw-api`动作接口」；同时覆盖「移入、归档、删除和停靠互不串联；删除可恢复；合集删除不删除想法。」及设计落点「`retniw-web`合集入口；`retniw-api`合集与状态接口」。Brownfield符号：[ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)、[ThoughtRepository](src/server/repositories/thought-repository.ts#ThoughtRepository)、[Thoughts GET](app/api/thoughts/route.ts#GET)。
- 目标代码/产出物：
  - [ ] 修改并创建路由：在`retniw-api`更新[Thoughts GET](app/api/thoughts/route.ts#GET)并新增`PATCH /api/thoughts/[id]`与合集路由，承担状态动作、范围列表和合集CRUD。
  - [ ] 新增文件：在`retniw-web`新增[ThoughtListItem](src/components/thoughts/thought-list-item.tsx#ThoughtListItem)、[ThoughtActionMenu](src/components/thoughts/thought-action-menu.tsx#ThoughtActionMenu)和[CollectionPicker](src/components/thoughts/collection-picker.tsx#CollectionPicker)。
  - [ ] 修改：在`retniw-web`更新[ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)，展示最近、合集、归档和已删除入口并乐观更新列表。
- 实现步骤：
  1. 从`PATCH /api/thoughts/[id]`请求进入[ThoughtRepository](src/server/repositories/thought-repository.ts#ThoughtRepository)，解析`move/archive/unarchive/delete/restore`，逐项验证UUID、所有权和当前状态，返回更新后的thought。
  2. 从合集请求调用新增的`CollectionRepository`提供列表、新建、重命名和删除；删除依靠外键解除归属，不删除thought；停靠相关的`CheckpointRepository`与`POST /api/thoughts/[id]/checkpoints`保持独立，不被管理动作改写。
  3. 在[ThoughtListItem](src/components/thoughts/thought-list-item.tsx#ThoughtListItem)让正文点击保持打开详情；悬停/聚焦显示更多，右键打开同一菜单；图标分别使用移入文件夹、归档盒和垃圾桶线性SVG，文字固定为“移入、归档、删除”。
  4. 在移动端只在水平位移显著大于垂直位移时左滑，露出归档和删除；长按450ms且移动不超过8像素时打开完整操作抽屉，滚动或回滑时复位。
  5. 在[ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)先展示最近，再展示合集和归档次级入口；操作先乐观更新，失败恢复条目并显示短错误。
  6. 删除使用确认层并进入软删除；已删除入口支持恢复，快捷入口不提供永久删除。
- 边界与不变约束：失败、权限与兼容行为如下。
  - [ ] 保持移入不移出最近，归档不改变合集，删除不永久清理；三者不得共用一个状态字段。
  - [ ] 保持左滑和长按只作快捷入口，不得替代可见更多按钮；触摸滚动不得误触操作。
  - [ ] 权限边界下第二账号不能查看合集名称、数量或其中想法；非本人资源保持统一404。
- 前置依赖：M-008-T-001、M-009-T-001
- 完成定义：
  - [ ] 最近、合集、归档和已删除四种回看路径可用；一个想法最多一个合集；所有端能完成移入、归档、删除和恢复，语义不串联。
- 验证方式：
  - [ ] 入口：运行`npm test -- tests/api/thought-routes.test.ts tests/ui/thought-workspace.test.ts`并在320、375、1024、1440像素真实浏览器执行更多、右键、左滑和长按；被测：[ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)、[ThoughtRepository](src/server/repositories/thought-repository.ts#ThoughtRepository)主流程；Mock：单元测试Mock网络，端到端使用真实Supabase；断言：动作语义一致、跨账号404、失败回滚、滚动无误触、删除可恢复。
