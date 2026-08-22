# Task Module: M-009 统一操作层

## 模块概览
- 模块目标：所有菜单、抽屉和对话框只开一个，并按自然操作关闭和恢复焦点。
- 模块边界：包含统一浮层状态、外部点击、Escape、backdrop和焦点恢复；不实现具体归档、删除或停靠数据动作。
- 模块依赖：无

## 任务卡
### M-009-T-001 交付自然收起的操作层
- 任务目标：账号、更多、历史、导入及后续管理抽屉遵循同一开关规则，不再同时悬挂多个浮层。
- 设计依据：[TECH-DESIGN.md](../TECH-DESIGN.md)验证映射「打开其他操作、点击空白、按 Escape 或完成选择后，当前浮层收起；同一时刻只有一个操作层。」及设计落点「`retniw-web`统一浮层」。Brownfield符号：[AppHeader](../src/components/app-header.tsx#AppHeader)、[ThoughtMenu](../src/components/thoughts/thought-menu.tsx#ThoughtMenu)、[ThoughtNavigation](../src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)、[ImportTextDialog](../src/components/thoughts/import-text-dialog.tsx#ImportTextDialog)。
- 目标代码/产出物：
  - [x] 新增文件：在`retniw-web`新增[OverlayProvider](../src/components/overlay-provider.tsx#OverlayProvider)和[useOverlayController](../src/components/overlay-provider.tsx#useOverlayController)，提供唯一活动层与焦点恢复。
  - [x] 修改：在`retniw-web`更新[AppHeader](../src/components/app-header.tsx#AppHeader)、[ThoughtMenu](../src/components/thoughts/thought-menu.tsx#ThoughtMenu)、[ThoughtNavigation](../src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)和[ImportTextDialog](../src/components/thoughts/import-text-dialog.tsx#ImportTextDialog)，移除互不相识的`details`或局部开关。
- 实现步骤：
  1. 从账号、更多、历史或导入的点击、pointerdown和Escape事件进入[OverlayProvider](../src/components/overlay-provider.tsx#OverlayProvider)，读取活动层ID与触发器，判断是否切换或关闭，并更新唯一活动状态后恢复焦点。
  2. 在[useOverlayController](../src/components/overlay-provider.tsx#useOverlayController)统一注册外部`pointerdown`和Escape；关闭后将焦点还给仍在文档中的触发器。
  3. 把[AppHeader](../src/components/app-header.tsx#AppHeader)与[ThoughtMenu](../src/components/thoughts/thought-menu.tsx#ThoughtMenu)改为受控按钮和`role=menu`；把历史与导入dialog接入相同活动层。
  4. 对模态dialog补backdrop点击关闭，对删除确认保留明确按钮，不让正文点击误确认危险动作。
- 边界与不变约束：失败、空值与兼容行为如下。
  - [x] 保持浮层内部点击不触发外部关闭；打开模态时先关闭非模态层。
  - [x] 保持键盘用户可到达触发器、菜单项和关闭按钮，关闭后焦点不得丢到页面顶部。
  - [x] 不得增加玻璃横条或纯装饰容器；保持现有低对比设计语言。
- 前置依赖：无
- 完成定义：
  - [x] 任意浮层交叉打开时页面只存在一个活动层，四种关闭方式均生效，键盘焦点恢复正确。
- 验证方式：
  - [x] 入口：运行`npm test -- tests/ui/thought-workspace.test.ts`并用真实浏览器交叉操作账号、更多、历史和导入；被测：[OverlayProvider](../src/components/overlay-provider.tsx#OverlayProvider)、[AppHeader](../src/components/app-header.tsx#AppHeader)主流程；Mock：自动测试Mock DOM事件，浏览器验收不Mock；断言：单开、外部点击关闭、Escape关闭、完成选择关闭及焦点恢复。
