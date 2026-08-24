# Task Module: M-015 回看主区与隐私控制

## 模块概览
- 模块目标：让用户从以前的想法进入不含聊天输入的回看主区，明确开启或关闭，并判断系统提出的联系。
- 模块边界：包含 `/review`、候选与已保留联系、两端原文深链、入口提示、偏好控制和隐私披露；不生成复盘文章或自动分类。
- 模块依赖：M-013、M-014

## 任务卡
### M-015-T-001 交付可开关的独立回看主区
- 任务目标：用户能看懂开启后会处理什么、候选为什么出现，并用“保留 / 忽略”决定；回看不抢占记录主路径。
- 设计依据：[TECH-DESIGN.md](../TECH-DESIGN.md#验证映射)验证映射需求原文「首次开启前说明处理范围；候选可回到两端原文，保留的联系可再次打开；页面不被理解为聊天。」与设计落点原文「`retniw-web`独立回看；`retniw-api`全局关系读取」；需求原文「默认关闭，明确开启后才发送跨想法内容，关闭后新保存不再处理。」与设计落点原文「`retniw-web`回看开关；`retniw-api`偏好表」；需求原文「新旧账号默认关闭；明确开启和关闭随账号跨设备同步。」与设计落点原文「`retniw-web`偏好控制；`retniw-api`偏好表」；需求原文「同一对想法忽略后不再出现，保留后可持续查看；并发保存不产生重复边。」与设计落点原文「`retniw-api`关系幂等；`retniw-web`回看」；需求原文「当前想法AI仍由用户主动调用且只读当前内容」与设计落点原文「`retniw-web`当前工作区；`retniw-api`现有AI路由」。Brownfield受影响符号原文：`app/review/page.tsx`、`ReviewWorkspace`、`ConnectionCard`、`ThoughtNavigation`、`ThoughtWorkspace`、entry DOM锚点，以及`ReviewWorkspace`内的偏好控制与`app/login/page.tsx`。
- 目标代码/产出物：
  - [ ] 新增文件和组件：在 `retniw-web` 新增 [ReviewPage](app/review/page.tsx#ReviewPage)、[ReviewWorkspace](src/components/review/review-workspace.tsx#ReviewWorkspace) 与 [回看样式](src/components/review/review-workspace.module.css)，在同一工作区内承接说明、偏好开关、待判断卡片和已保留状态。
  - [ ] 修改：在 `retniw-web` 更新 [ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)、[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace) 与 [EntryContent](src/components/thoughts/entry-content.tsx#EntryContent)，增加回看次级入口和 `entry-:entryId` DOM 锚点，并从当前想法移除候选展示。
  - [ ] 移除：在 `retniw-web` 从 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace) 删除旧关系检查hook与当前想法候选调用，并删除旧文件；在 `retniw-api` 由 [ReviewService](src/server/review/review-service.ts#ReviewService) 唯一承接候选生成，移除对应的 `POST /api/thoughts/:id/relations/check`，避免第二套候选入口。
  - [ ] 修改：在 `retniw-web` 更新 [LoginPage](app/login/page.tsx#LoginPage) 与 [README DeepSeek说明](README.md#DeepSeek)，准确披露主动当前想法 AI 和明确开启后的跨想法处理范围。
  - [ ] 复用：在 `retniw-web` 通过 `retniw-api` 的 `PATCH /api/thought-connections/:id` 调用 [ThoughtConnectionRepository.decide](src/server/repositories/thought-connection-repository.ts#decide)，使“保留 / 忽略”沿用 pending 到 confirmed/rejected 的决定契约。
- 实现步骤：
  1. 从 [ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation) 的“回看”次级入口触发路由，加载认证动态 [ReviewPage](app/review/page.tsx#ReviewPage)；未登录返回登录页，已登录读取偏好、pending 数量和第一页关系并输出 [ReviewWorkspace](src/components/review/review-workspace.tsx#ReviewWorkspace)。
  2. 在 [ReviewWorkspace](src/components/review/review-workspace.tsx#ReviewWorkspace) 内根据偏好判断关闭或开启状态：关闭时展示处理对象、触发时机和AI边界并提交“开启”，开启后可提交“关闭回看”；请求失败回滚开关并展示真实状态。
  3. 在 [ReviewWorkspace](src/components/review/review-workspace.tsx#ReviewWorkspace) 内的 `ConnectionCard` 将pending输入映射为“这次写的 / 以前写的”两端最多1000字摘录、简短依据和“保留 / 忽略”，调用 [ThoughtConnectionRepository.decide](src/server/repositories/thought-connection-repository.ts#decide) 后更新为confirmed或从待判断列表移除；confirmed刷新后继续展示。
  4. 为 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace) 的user/import entry输出稳定 `entry-:entryId` 锚点，回看卡片两端链接 `/thoughts/:id#entry-:entryId`；打开后浏览器定位对应原文而非AI内容。
  5. 从 [ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace) 移除旧关系检查hook与候选组件调用，并删除侧栏手动检查入口；[LoginPage](app/login/page.tsx#LoginPage) 与 [README DeepSeek说明](README.md#DeepSeek) 更新后输出同一隐私边界，当前想法“帮我接着想 / 整理”保持用户主动触发。
- 边界与不变约束：
  - [ ] 页面加载、分页或决定请求失败时必须保持用户原文和偏好真实状态，不得自动确认、忽略、移入或归档。
  - [ ] `/review` 不得出现聊天输入框、自动总结或示例关系；空状态不得虚构候选，待判断提示不得弹窗、抢焦点或阻断记录。
  - [ ] 关闭回看必须停止后续保存触发，但不得删除已有 pending 或 confirmed；已经进入供应商调用的请求不能承诺撤回。
  - [ ] 当前想法 AI 必须保持用户主动调用且只读取当前想法，回看开关不得改变该既有行为；SVG 仅辅助识别且不得替代文字层级。
- 前置依赖：M-013-T-001、M-014-T-001
- 完成定义：
  - [ ] 未开启、开启无候选、pending、confirmed、关闭、分页失败和决定失败状态均可在手机与桌面走通，页面不存在 chatbot 输入结构。
  - [ ] 每条候选两端均可打开准确原文锚点，忽略后不再出现，保留后刷新仍可查看。
- 验证方式：
  - [ ] 入口：运行 `npm test -- tests/api/thought-connections.test.ts tests/ui/thought-workspace.test.ts tests/workspace/ai-action.test.ts` 并在 Chromium、WebKit 打开 `/review` 回放 320、375、768、1024、1440 像素；被测：[ReviewWorkspace](src/components/review/review-workspace.tsx#ReviewWorkspace)、[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)；Mock：UI测试Mock review API与决定API，浏览器预览使用临时账号真实接口；断言：默认关闭说明准确，失败后开关回滚，页面无输入框和横向溢出，pending可保留/忽略，confirmed刷新仍在，两端深链定位对应entry，未点击当前想法AI时Network无AI请求且点击后的上下文不含其他thought。
