# Task Module: M-016 跨端终验与发布

## 模块概览
- 模块目标：把记录、联系、回看与删除在同一个生产版本中闭环，并留下可复核的自动化、跨端、数据库与线上证据。
- 模块边界：包含完整回归、代码审查、发布清单、数据库迁移、Vercel 部署、正式域名回放和文档同步；三网真机与首次用户理解继续按真实样本单独记录。
- 模块依赖：M-013、M-014、M-015

## 任务卡
### M-016-T-001 完成跨端、数据与线上闭环
- 任务目标：在生产走通“先记下来—慢慢表达—回来看见联系”，并用新鲜证据证明删除、隐私、跨账号、失败降级和文档披露一致。
- 设计依据：[TECH-DESIGN.md](../TECH-DESIGN.md#风险与交付)「风险与交付」的发布顺序、生产外键读回门禁、`after()` 降级、性能上限与回滚口径，以及[TECH-DESIGN.md](../TECH-DESIGN.md#验证映射)全部验证映射；数据库迁移应用 [TECH-DESIGN.md H3「数据库 DDL」](../TECH-DESIGN.md#数据库-DDL) 中 `user_review_preferences` 建表与`entries.review_checked_at`可空列增量。
- 目标代码/产出物：
  - [ ] 更新：在 `retniw-web` 与 `retniw-api` 以 [package scripts](package.json#scripts) 执行测试、typecheck、lint 与 build，并更新 [README DeepSeek说明](README.md#DeepSeek)、任务状态、工作流状态、代码审查报告与 V2.4 发布清单的真实证据。
  - [ ] 应用：在 `retniw-api` 应用 [TECH-DESIGN.md H3「数据库 DDL」](../TECH-DESIGN.md#数据库-DDL) 对应的两个增量，读回 `user_review_preferences` 的表、默认值、RLS、权限和账号删除级联，以及`entries.review_checked_at`的类型、可空性与既有行默认null；发布前读回所有thought子引用的CASCADE约束。
  - [ ] 复用：在 `retniw-web` 与 `retniw-api` 复用 [package build入口](package.json#build) 和 [package test入口](package.json#test) 生成门禁结果，以同一 source SHA 发布 Vercel 并在 `https://retniw.cn` 回放桌面与移动主链。
- 实现步骤：
  1. 从 [package test入口](package.json#test) 运行受影响测试和全量测试输入，再调用 [package typecheck入口](package.json#typecheck)、[package lint入口](package.json#lint) 与 [package build入口](package.json#build)；任一失败先修复对应实现并重新执行，输出完整退出码和日志摘要。2026-08-24已完成一轮：24个测试文件共143项测试及全部门禁通过，部署前若source继续变化需重跑。
  2. 依据 [TECH-DESIGN.md H3「数据库 DDL」](../TECH-DESIGN.md#数据库-DDL) 依次应用偏好表迁移与entry认领列迁移，查询并校验偏好表结构、默认关闭、RLS、service_role权限与账号删除级联，以及`entries.review_checked_at`为可空`timestamptz`且既有行保持null；随后读取所有指向thought的外键，若entries、checkpoints或connections两端不是CASCADE则拒绝发布删除能力。2026-08-24两项生产迁移与entry列读回已完成，生产PostgREST嵌入列表和exact计数冒烟通过。
  3. 用临时双账号从 [POST /api/thoughts](app/api/thoughts/route.ts#POST) 提交 user/import 输入，依次验证默认关闭、开启后异步候选、保留/忽略、归档参与、关闭后不再处理和跨账号隔离；再从 [DELETE /api/thoughts/:id](app/api/thoughts/[id]/route.ts#DELETE) 删除临时想法并输出关联行均为 0 的检查结果。
  4. 以同一 source SHA 部署并从 [ReviewPage](app/review/page.tsx#ReviewPage) 与 [ThoughtNavigation](src/components/thoughts/thought-navigation.tsx#ThoughtNavigation) 打开正式域名，在 Chromium、WebKit 的桌面与移动视口回归记录、历史、归档、回看和删除；确认 Vercel READY 与 alias 后更新 [README DeepSeek说明](README.md#DeepSeek) 及交付文档并清理临时数据和账号。
- 边界与不变约束：
  - [ ] 生产外键、迁移读回或任一自动门禁失败时必须停止发布，不得绕过约束或把预览证据当作正式域名结果。
  - [ ] 不得批量清理历史软删除数据，也不得把代码回滚描述成可恢复已发生的新删除。
  - [ ] 日志、报告与截图不得包含密钥、邮箱、正文或临时账号标识；清理失败必须如实记录残留范围。
  - [ ] 三网无代理、真机手势和至少 5 名首次用户理解必须保持为待真实验证项，不得用自动测试或单次样本替代。
- 前置依赖：M-013-T-001、M-014-T-001、M-015-T-001
- 完成定义：
  - [ ] 自动门禁、两项生产迁移、entry级乱序认领、外键读回、Vercel READY、正式域名主链、跨账号隔离、临时数据清理和文档同步均有时间、source SHA与结果证据。
  - [ ] 手机与桌面主链没有横向溢出或导航断点，保存响应不等待模型，删除和回看边界与技术设计一致。
- 验证方式：
  - [ ] 入口：运行 `npm test && npm run typecheck && npm run lint && npm run build && npm audit --audit-level=high && git diff --check`，随后在 Chromium、WebKit 打开 `https://retniw.cn`；被测：[package scripts](package.json#scripts)、[ReviewPage](app/review/page.tsx#ReviewPage)、[DELETE /api/thoughts/:id](app/api/thoughts/[id]/route.ts#DELETE)；Mock：自动测试 Mock DeepSeek 和 Supabase，生产回放仅使用临时双账号与可清理内容；断言：全部命令退出码为 0，Vercel 为 READY 且 alias/source SHA 一致，320、375、768、1024、1440 像素主链无横向溢出，默认关闭无跨想法请求，开启后候选不阻塞保存，删除后四类关联行均为 0，第二账号无法读取第一账号内容。
