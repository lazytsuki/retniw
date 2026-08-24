# CODE-REVIEW

## 1. 文档概览

- 对象：retniw V2.4「记录、联系、回看」版本
- 基线：上一生产版本 V2.3 / M-007 与 V2.4 功能提交、移动焦点热修差异
- 输出：`CODE-REVIEW-V24.md`
- 日期：2026-08-24
- 当前阶段：正式发布终验通过
- 结论：**GO，V2.4 已正式发布**

## 2. 输入来源

### 2.1 需求侧证据

- `REQUIREMENT-ANALYSIS.md`
- `PRD.md`
- `TECH-DESIGN.md`
- `tasks-v24/TASK-STATUS.md`
- `tasks-v24/TASK-M-013-生命周期与历史层级.md`
- `tasks-v24/TASK-M-014-跨想法回看底座.md`
- `tasks-v24/TASK-M-015-回看主区与隐私控制.md`
- `tasks-v24/TASK-M-016-跨端终验与发布.md`

### 2.2 变更侧证据

- 生命周期与历史层级：`app/api/thoughts/[id]/route.ts`、`src/server/repositories/thought-repository.ts`、`src/components/thoughts/thought-action-menu.tsx`、`src/components/thoughts/thought-navigation.tsx`
- 保存后回看：`app/api/thoughts/[id]/entries/route.ts`、`src/server/review/schedule-saved-entry-review.ts`、`src/server/review/review-service.ts`、`src/server/repositories/entry-repository.ts`
- 独立回看主区：`app/review/page.tsx`、`app/api/review/route.ts`、`app/api/review/preference/route.ts`、`src/components/review/`
- 数据库：`supabase/migrations/20260824090000_user_review_preferences.sql`、`supabase/migrations/20260824150000_entry_review_claim.sql`
- 自动测试：本轮变更涉及的 API、UI、service 与 repository 测试，以及全量回归门禁
- 独立复审：当前修订完成后的终局结论为 GO
- 发布提交：功能提交 `861301a6bc01e84966e7fe4bca85621650172720`；移动焦点热修 `1fe9eb9a97df3d495a7df0c86dba2577cf8e4a2d`
- 生产部署：`dpl_9daty4JH33kdQbc8qqBFb4nEruXB` / `retniw-n5r6ieddw-winter24.vercel.app` 为 READY，Vercel API 读回 `gitSource.sha` 与 `meta.githubCommitSha` 均为移动焦点热修 SHA
- 正式域名：Chromium 1440、WebKit 375、双账号越权、未登录路由、旧域名跳转与近 30 分钟部署日志终验

### 2.3 本次评审范围

- 永久删除、归档子视图与历史列表层级
- 跨想法回看的默认关闭、开启与关闭
- 保存后异步回看、entry 级原子认领、幂等与乱序
- 候选列表、精确计数与候选详情查询
- 独立回看页面及桌面、移动端关键闭环
- V2.4 数据迁移、自动门禁、生产部署与正式域名终验

## 3. 评审结论

### 3.1 Verdict 摘要

| 级别 | 数量 | 结论 |
|---|---:|---|
| 阻塞问题 | 0 | 无 |
| 重要风险 | 0 | 原复审发现的认领与查询边界问题已关闭 |
| 一般建议 | 0 | 无影响部署的遗留建议 |
| 待确认问题 | 0 | 无会改变 GO 的实现问题 |

本轮实现符合 V2.4 的主链：用户先记录；开启回看后，系统只在保存完成后比较必要的用户或导入原文；AI 只能提出候选，用户决定是否保留为联系。普通保存不等待模型，单想法内的 AI 能力仍由用户主动调用。

### 3.2 合入建议

- 功能提交与移动焦点热修均已进入生产部署，可以保留当前正式版本。
- 生产 deployment、READY、alias 与 source SHA 已相互核对，正式域名终验通过。
- 后续只做真实用户验证和持续观察，不再把观察项写成发布阻塞。

### 3.3 非评审范围

- Chromium 1440 与 WebKit 375 的正式域名终验各得到 **1 次真实 DeepSeek 候选并完成保留**；两个样本使用同一组测试语义，只证明真实主链可用，不外推候选的稳定性与长期质量。
- 真实物理触摸设备手势、三网与朋友样本、至少 5 名首次用户、规模放大后的 exact count 成本和实际回滚演练留作持续验证。

## 4. 需求-变更追溯矩阵

| 需求 | 主要实现 | 验证结论 |
|---|---|---|
| 强提醒后永久删除 | thought 原子删除、级联约束、删除确认界面 | 自动测试、本地与正式域名主链通过 |
| 归档回到历史层级 | 历史列表下的归档子视图，不再提供已删除区 | 自动测试、本地与正式域名主链通过 |
| 回看默认关闭且可随时关闭 | 用户偏好表、偏好 API、独立回看主区 | 第二账号默认关闭，正式域名开启与关闭主链通过 |
| 新内容保存后异步回看 | 保存响应后调度，不阻塞主保存链 | API、service 回归与正式域名反馈通过 |
| 每段新原文只处理一次 | nullable `entries.review_checked_at`，按 user_id、thought_id、entry_id 与空状态原子认领 | entry 级幂等重试与乱序回调场景 PASS |
| AI 内容不触发回看 | 认领与列表只接受 user/import anchor | repository 与 service 测试通过 |
| 待处理数量与列表一致 | exact/head 计数仅在 pending 首屏请求；列表在 limit 前完成精确 FK 过滤 | PostgREST 生产冒烟与自动测试通过 |
| 候选排除已存在关系 | 合法 UUID 排除集合下推数据库后再 limit 20 | repository 测试与复审通过 |
| 候选由用户保留或忽略 | 独立回看页面呈现两端原文与一次性决定 | Chromium 与 WebKit 正式域名均得到真实候选并完成保留 |
| 单想法 AI 仍由用户主动触发 | 原主动 AI 入口保留，普通保存不自动生成续写 | 全量回归、本地与正式域名闭环通过 |

## 5. 主要发现

### 5.1 阻塞问题

无。

### 5.2 重要风险

无未关闭的重要风险。独立复审曾指出 thought 级时间水位会让不同 entry 的乱序回调互相覆盖；当前实现已经改为 entry 级 nullable 标记和原子认领，同一 entry 的幂等重试只处理一次，不同 entry 无论回调顺序都各处理一次。对应幂等与乱序场景已验证 PASS。

独立复审同时指出候选查询可能在应用层过滤后少取数据；当前列表使用 4 个精确 FK 的 `!inner` 在 `limit` 前过滤两端未删除 thought 和 user/import anchor，count 使用 `exact + head` 且只在 pending 首屏请求，候选排除集合在数据库过滤后再 `limit 20`。复审结论为 GO。

### 5.3 一般建议

当前没有影响正式版本的一般建议。继续观察模型候选长期质量、exact count 在规模放大后的成本和真实触摸手势，不借观察期扩展功能范围。

### 5.4 待确认问题

当前没有会改变 GO 的实现问题。生产提交、deployment、READY、alias/source 与正式域名终验证据均已形成。

## 6. 验证证据与缺口

| 验证项 | 结果 | 证据边界 |
|---|---|---|
| 自动测试 | PASS | 24 个测试文件、143 项测试全部通过 |
| TypeScript | PASS | typecheck 通过 |
| 代码规范 | PASS | lint 通过 |
| 生产构建 | PASS | Next.js 16.3.1 build 通过，产物包含 `/api/review`、`/api/review/preference` 与 `/review` |
| 依赖审计 | PASS | npm audit 高危门禁通过 |
| 差异检查 | PASS | `git diff --check` 通过 |
| 桌面本地闭环 | PASS | Chromium 1440 覆盖记录、归档、删除与回看开关；候选 UI 使用 fixture |
| 移动本地闭环 | PASS | WebKit 375 覆盖同一关键闭环；候选 UI 使用 fixture |
| 数据迁移 | PASS | 两项生产迁移已应用；`entries.review_checked_at` 以 nullable 列读回 |
| 生产外键读回 | PASS | 指向 `thoughts` 的 entries、thought_checkpoints 与 thought_connections 两端共 4 个外键均为 `ON DELETE CASCADE` |
| 生产 PostgREST 冒烟 | PASS | 精确 FK 嵌入列表与 exact count 通过 |
| entry 级原子认领 | PASS | 同 entry 幂等一次、不同 entry 乱序各一次，AI entry 不可认领 |
| 独立复审 | GO | 关闭原认领与 P2 查询问题后复审通过 |
| 发布提交 | PASS | 功能提交 `861301a6bc01e84966e7fe4bca85621650172720`，移动焦点热修 `1fe9eb9a97df3d495a7df0c86dba2577cf8e4a2d` |
| 生产应用部署 | PASS | `dpl_9daty4JH33kdQbc8qqBFb4nEruXB` / `retniw-n5r6ieddw-winter24.vercel.app` READY；alias 含 `retniw.cn`、`retniw.vercel.app`，两个 Vercel source SHA 字段均等于最新热修 SHA |
| 桌面正式域名 | PASS | Chromium 1440：feedbackMs 54 / 32，无溢出、0 consoleErrors；真实 DeepSeek 产出候选并完成保留 |
| 移动正式域名 | PASS | WebKit 375：最新 feedbackMs 59 / 45，无溢出、0 consoleErrors；真实候选保留、关闭后重开、左滑归档、永久删除的取消与确认均通过，原文锚点在 viewport 内，亮蓝焦点热修生效 |
| 模型真实候选 | PASS（两端各一次） | Chromium 与 WebKit 正式域名各得到 1 次真实候选并完成保留；测试语义相同，只证明主链可用，不外推稳定质量 |
| 双账号隔离 | PASS | 读、写、删越权均返回 404；第二账号默认关闭；临时账号与相关数据清理回查为 0 |
| 未登录与旧域名 | PASS | retniw.cn 未登录根页、`/review` 均 307 到 `/login`，`/api/review` 返回 401；`retniw.vercel.app` 308 到 `retniw.cn` |
| 线上产品主链 | PASS | 永久删除、归档、公开注册、checkpoint、关闭与开启回看均通过 |
| 生产日志 | PASS | 近 30 分钟该 deployment 的 500 日志查询为空 |

## 7. 风险视角扫描

| 风险视角 | 结论 | 处理 |
|---|---|---|
| 6A 密钥与凭据 | 未发现 V2.4 新增明文凭据 | 模型与 Supabase 凭据继续由生产环境注入 |
| 6B 身份与数据隔离 | 回看偏好、列表、计数与候选均受当前用户约束 | 双账号读、写、删越权均为 404，临时数据清理为 0 |
| 6C AI 事实边界 | 只有 user/import entry 可被认领；AI entry 不参与候选来源 | 精确 FK、来源过滤与 entry 级 claim 共同约束 |
| 6D 认领与幂等 | thought 级水位风险已消除 | entry 级原子认领通过幂等与乱序验证 |
| 6E 不可逆操作 | 新删除不提供恢复 | 强提醒、取消与确认后的永久删除已在正式域名主链验证 |
| 6F 日志与隐私 | 未新增候选正文的外部日志通道 | 生产观察只记录必要状态，不记录用户正文 |
| 可观测性 | 发布时段无控制台错误，近 30 分钟该 deployment 无 500 日志 | 继续观察低频瞬时错误和模型候选质量 |
| 回滚 | 两项迁移均为向后兼容的新增结构 | 应用可按 deployment 回滚，数据库结构保留；本轮未实际执行回滚演练 |

## 8. 待补充确认

正式发布没有待补的阻塞证据。以下项目进入真实用户验证与持续观察：

- [ ] 在真实物理触摸设备验证长按、左滑与删除确认手势。
- [ ] 在移动、联通、电信网络及朋友账号继续观察可达性与完整链路。
- [ ] 邀请至少 5 名未听过介绍的用户，验证能否自然理解“先记录，再回看，再决定是否留下联系”。
- [ ] 累积真实 DeepSeek 候选样本后评估稳定性与长期质量；当前只有桌面、移动各 1 次且测试语义相同的闭环证据。
- [ ] 数据规模放大后复核 pending exact count 的查询成本。
- [ ] 在不影响用户数据的演练环境执行一次应用回滚；本轮未实际演练。

## 9. 建议后续动作

1. 保持当前生产版本，观察部署日志与用户反馈。
2. 按第 8 节补齐真实触摸、三网、首次用户和长期候选质量样本。
3. 规模增长后复核 exact count 成本，并安排一次不影响真实数据的回滚演练。
