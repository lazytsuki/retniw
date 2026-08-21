# Task Module: M-011 思考停靠与发布

## 模块概览
- 模块目标：让长想法用“先到这里”自然停靠、返回全部想法并以后继续，同时完成本轮跨端和线上交付。
- 模块边界：包含checkpoint接口与界面、位置恢复、导出补充、完整回归、生产发布和正式域名回放；不生成AI总结或自动归档。
- 模块依赖：M-008、M-009、M-010

## 任务卡
### M-011-T-001 交付可继续的停靠闭环
- 任务目标：用户可在长想法中留一句或直接“先到这里”，立即回到全部想法；下次从停靠点继续，原想法未被归档，手机和桌面行为一致并在线可用。
- 设计依据：[TECH-DESIGN.md](../TECH-DESIGN.md)验证映射「长想法可以自然停靠并回到全部想法；下次打开从停靠点继续，且不自动归档。」及设计落点「`retniw-web`停靠；`retniw-api`checkpoint」；同时覆盖「点击100毫秒内出现就地状态；切换详情不整块替换导航和已显示内容。」及设计落点「`retniw-web`加载策略」。Brownfield符号：[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)、[ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)、[useThoughtPosition](src/hooks/use-thought-position.ts#useThoughtPosition)。
- 目标代码/产出物：
  - [ ] 新增接口：在`retniw-api`通过[ThoughtRepository](src/server/repositories/thought-repository.ts#ThoughtRepository)提供`POST /api/thoughts/[id]/checkpoints`，承担幂等停靠与所有权校验。
  - [ ] 新增文件：在`retniw-web`新增[CheckpointDialog](src/components/thoughts/checkpoint-dialog.tsx#CheckpointDialog)，承担可选备注和确认。
  - [ ] 修改：在`retniw-web`更新[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)、[ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)和[useThoughtPosition](src/hooks/use-thought-position.ts#useThoughtPosition)，展示过程边界、恢复位置并移除整页详情骨架。
  - [ ] 修改：在`retniw-api`更新[ThoughtExportRepository](src/server/repositories/thought-export-repository.ts#ThoughtExportRepository)和[export streams](src/server/exports/export-streams.ts#createFullExportStream)，保留checkpoint、合集与状态语义。
- 实现步骤：
  1. 从`POST /api/thoughts/[id]/checkpoints`请求进入[ThoughtRepository](src/server/repositories/thought-repository.ts#ThoughtRepository)，校验ID、0至500字备注、thought所有权和非删除状态；以`clientRequestId`幂等创建checkpoint并返回。
  2. 在[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)仅在已有内容时提供次级动作“先到这里”；通过[CheckpointDialog](src/components/thoughts/checkpoint-dialog.tsx#CheckpointDialog)允许空备注或一句备注，点击后立即显示处理中状态。
  3. 成功后把checkpoint边界加入时间线并返回首页；不得调用AI、写入entry、改变`archived_at`或`collection_id`。
  4. 在[useThoughtPosition](src/hooks/use-thought-position.ts#useThoughtPosition)恢复本设备更晚手动位置，否则滚到最后checkpoint；追加新内容后保留旧边界。
  5. 从[ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation)的历史选择事件进入，移除`app/thoughts/[id]/loading.tsx`整页边界并更新条目busy状态；慢网下旧工作区保持可读直到新详情提交。
  6. 更新导出、README、WORKFLOW-STATE、TASK-STATUS与发布文档，运行完整门禁，发布到Vercel后在`https://retniw.cn`回放桌面和移动闭环。
- 边界与不变约束：失败、重复与兼容行为如下。
  - [ ] 保持“先到这里”不是完成、总结或归档；无论备注是否为空都不得调用DeepSeek。
  - [ ] checkpoint失败时留在当前页面并可重试，不伪装成功或清空输入。
  - [ ] 保持加载优化不恢复历史列表批量prefetch，不得缓存用户专属RSC响应。
- 前置依赖：M-008-T-001、M-009-T-001、M-010-T-001
- 完成定义：
  - [ ] 手机和桌面均走通“写下—接着想—先到这里—回到全部想法—再次继续”；完整测试、构建、安全检查、生产部署和正式域名回放通过。
- 验证方式：
  - [ ] 入口：运行`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`和依赖审计，再用Chromium/WebKit在320、375、768、1024、1440像素及正式域名回放；被测：[ThoughtWorkspace](src/components/thoughts/thought-workspace.tsx#ThoughtWorkspace)、[ThoughtRepository](src/server/repositories/thought-repository.ts#ThoughtRepository)主流程；Mock：自动测试Mock网络与AI，生产回放使用真实Supabase且停靠过程不调用AI；断言：停靠幂等、不自动归档、重开定位、点击100毫秒内反馈、页面壳连续、控制台无错误警告。
