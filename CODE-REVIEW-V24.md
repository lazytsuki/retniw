# CODE-REVIEW

## 1. 文档概览

- 对象：retniw V2.4「记录、联系、回看」版本
- 基线：上一生产版本 V2.3 / M-007 与当前 V2.4 工作树差异
- 输出：`CODE-REVIEW-V24.md`
- 日期：2026-08-24
- 当前阶段：发布验证中
- 结论：**GO，可进入生产应用部署与正式域名回放**

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

### 2.3 本次评审范围

- 永久删除、归档子视图与历史列表层级
- 跨想法回看的默认关闭、开启与关闭
- 保存后异步回看、entry 级原子认领与并发幂等
- 候选列表、精确计数与候选详情查询
- 独立回看页面及桌面、移动端关键闭环
- V2.4 数据迁移、自动门禁与发布前证据

## 3. 评审结论

### 3.1 Verdict 摘要

| 级别 | 数量 | 结论 |
|---|---:|---|
| 阻塞问题 | 0 | 无 |
| 重要风险 | 0 | 原复审发现的并发认领与查询边界问题已关闭 |
| 一般建议 | 0 | 无影响部署的遗留建议 |
| 待确认问题 | 0 | 无会改变 GO 的实现问题 |

本轮实现符合 V2.4 的主链：用户先记录；开启回看后，系统只在保存完成后比较必要的用户或导入原文；AI 只能提出候选，用户决定是否保留为联系。普通保存不等待模型，单想法内的 AI 能力仍由用户主动调用。

### 3.2 合入建议

- 允许进入生产应用部署。
- 部署前固定发布提交 SHA；部署后核对 Vercel 状态、别名和 source SHA。
- 正式域名回放通过前，不把 V2.4 记为已发布。

### 3.3 非评审范围

- 本报告不证明尚未执行的生产应用部署、READY 状态、别名来源和正式域名跨端闭环。
- 本地 DeepSeek 本轮真实请求返回 **0 个候选**；候选卡片与处理交互使用临时 fixture 验证。该证据只证明 UI 流程，不代表模型已在线上产出候选。
- 本地 Chromium 1440 与 WebKit 375 回放不等同于真实手机、三网环境和朋友账号的生产验收。

## 4. 需求-变更追溯矩阵

| 需求 | 主要实现 | 验证结论 |
|---|---|---|
| 强提醒后永久删除 | thought 原子删除、级联约束、删除确认界面 | 自动测试与本地浏览器闭环通过；正式域名待回放 |
| 归档回到历史层级 | 历史列表下的归档子视图，不再提供已删除区 | 自动测试与本地桌面、移动回放通过 |
| 回看默认关闭且可随时关闭 | 用户偏好表、偏好 API、独立回看主区 | 默认态与开关闭环通过；正式域名待回放 |
| 新内容保存后异步回看 | 保存响应后调度，不阻塞主保存链 | API 与 service 回归通过 |
| 每段新原文只处理一次 | nullable `entries.review_checked_at`，按 user_id、thought_id、entry_id 与空状态原子认领 | entry 级并发与乱序回调场景 PASS |
| AI 内容不触发回看 | 认领与列表只接受 user/import anchor | repository 与 service 测试通过 |
| 待处理数量与列表一致 | exact/head 计数仅在 pending 首屏请求；列表在 limit 前完成精确 FK 过滤 | PostgREST 生产冒烟与自动测试通过 |
| 候选排除已存在关系 | 合法 UUID 排除集合下推数据库后再 limit 20 | repository 测试与复审通过 |
| 候选由用户保留或忽略 | 独立回看页面呈现两端原文与一次性决定 | 本地 UI 候选流程由临时 fixture 验证；模型真实候选待生产观察 |
| 单想法 AI 仍由用户主动触发 | 原主动 AI 入口保留，普通保存不自动生成续写 | 全量回归与本地闭环通过 |

## 5. 主要发现

### 5.1 阻塞问题

无。

### 5.2 重要风险

无未关闭的重要风险。独立复审曾指出 thought 级时间水位会让不同 entry 的乱序回调互相覆盖；当前实现已经改为 entry 级 nullable 标记和原子认领，同一 entry 的幂等重试只处理一次，不同 entry 无论回调顺序都各处理一次。对应并发场景已验证 PASS。

独立复审同时指出候选查询可能在应用层过滤后少取数据；当前列表使用 4 个精确 FK 的 `!inner` 在 `limit` 前过滤两端未删除 thought 和 user/import anchor，count 使用 `exact + head` 且只在 pending 首屏请求，候选排除集合在数据库过滤后再 `limit 20`。复审结论为 GO。

### 5.3 一般建议

当前没有影响部署的一般建议。部署后只需按发布清单补齐生产证据，不再借发布步骤扩展功能范围。

### 5.4 待确认问题

当前没有会改变 GO 的实现问题。生产部署 SHA、READY、alias/source 与正式域名回放是待补发布证据，不是待确认方案。

## 6. 验证证据与缺口

| 验证项 | 结果 | 证据边界 |
|---|---|---|
| 自动测试 | PASS | 24 个测试文件、143 项测试全部通过 |
| TypeScript | PASS | typecheck 通过 |
| 代码规范 | PASS | lint 通过 |
| 生产构建 | PASS | Next.js 16.3.1 build 通过，产物包含 `/api/review`、`/api/review/preference` 与 `/review` |
| 依赖审计 | PASS | npm audit 高危门禁通过 |
| 差异检查 | PASS | `git diff --check` 通过 |
| 桌面本地闭环 | PASS | Chromium 1440 覆盖记录、归档、删除、回看开关与候选处理主链 |
| 移动本地闭环 | PASS | WebKit 375 覆盖同一关键闭环 |
| 数据迁移 | PASS | 两项生产迁移已应用；`entries.review_checked_at` 以 nullable 列读回 |
| 生产 PostgREST 冒烟 | PASS | 精确 FK 嵌入列表与 exact count 通过 |
| entry 级并发认领 | PASS | 同 entry 幂等一次、不同 entry 乱序各一次，AI entry 不可认领 |
| 独立复审 | GO | 关闭原并发认领与 P2 查询问题后复审通过 |
| DeepSeek 真实候选 | 有限证据 | 本地真实调用返回 0 候选；未获得模型产出候选的闭环证据 |
| 候选 UI | PASS（fixture） | 使用临时 fixture 验证候选呈现、保留与忽略；不是模型线上产出 |
| 生产应用部署 | 待验证 | 发布 SHA、Vercel READY、alias/source 尚未记录 |
| 正式域名跨端 | 待验证 | retniw.cn 的 Chromium 与 WebKit 闭环尚未执行 |

## 7. 风险视角扫描

| 风险视角 | 结论 | 处理 |
|---|---|---|
| 6A 密钥与凭据 | 未发现 V2.4 新增明文凭据 | 模型与 Supabase 凭据继续由生产环境注入 |
| 6B 身份与数据隔离 | 回看偏好、列表、计数与候选均受当前用户约束 | RLS 与服务端 user_id 边界保留；正式域名仍需临时账号回放 |
| 6C AI 事实边界 | 只有 user/import entry 可被认领；AI entry 不参与候选来源 | 精确 FK、来源过滤与 entry 级 claim 共同约束 |
| 6D 并发与幂等 | thought 级水位风险已消除 | entry 级原子认领通过并发与乱序验证 |
| 6E 不可逆操作 | 新删除不提供恢复 | 仅在强提醒确认后执行单条原子删除；生产回放需再次确认文案与焦点 |
| 6F 日志与隐私 | 未新增候选正文的外部日志通道 | 生产观察只记录必要状态，不记录用户正文 |
| 可观测性 | 本地和数据库证据齐全，应用生产证据未形成 | 部署后记录 source SHA、READY、别名、HTTP 与控制台结果 |
| 回滚 | 两项迁移均为向后兼容的新增结构 | 应用异常时回滚到上一 READY source；数据库结构保留，不在生产做破坏性降级 |

## 8. 待补充确认

- [ ] 固定并记录 V2.4 发布提交 SHA。
- [ ] 确认 Vercel production deployment 为 READY，别名包含 `retniw.cn`，source SHA 与发布提交一致。
- [ ] 在正式域名完成 Chromium 1440 与 WebKit 375 的登录后主链回放。
- [ ] 明确记录真实 DeepSeek 候选数量；若仍为 0，只记录为 0，不以 fixture 代替模型结果。
- [ ] 使用临时账号核对默认关闭、开启、关闭、跨账号隔离并完成数据清理。

## 9. 建议后续动作

1. 冻结当前通过门禁的工作树并形成发布提交。
2. 部署生产应用，读回 READY、alias 与 source SHA。
3. 按 `上线checkList-V24.md` 在 `retniw.cn` 完成桌面、移动端和临时账号回放。
4. 回填本报告与状态台账；全部通过后再把 V2.4 标为已发布。
