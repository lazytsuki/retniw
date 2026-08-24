# retniw V2.4「记录、联系、回看」· 上线checkList

> 当前状态：正式发布终验通过。代码审查结论为 GO；生产数据库、应用部署、正式域名跨端与双账号隔离均已验证。

## 发布依赖总表

| 顺序 | 依赖项 | 当前状态 | 放行条件 |
|---:|---|---|---|
| 1 | V2.4 两项数据库迁移 | 已完成 | 生产迁移可读回，entry nullable 列、精确嵌入列表与 exact count 冒烟通过 |
| 2 | 发布提交冻结 | 已完成 | 功能提交与移动焦点热修 SHA 已记录，工作树与 24 文件 / 143 测试门禁结果一致 |
| 3 | Vercel 生产应用部署 | 已完成 | deployment READY，alias 含 `retniw.cn`、`retniw.vercel.app`，两个 Vercel source SHA 字段均等于最新热修 SHA |
| 4 | 正式域名跨端回放 | 已完成 | Chromium 1440、WebKit 375、临时双账号隔离、路由鉴权与清理全部通过 |

## 1. 发布冻结

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 需求范围 | 永久删除、归档子视图、默认关闭的跨想法回看与独立回看主区均与 PRD / TECH-DESIGN 一致 | [x] | Codex |
| 代码审查 | `CODE-REVIEW-V24.md` 结论为 GO，无未关闭阻塞或重要风险 | [x] | 独立复审 / Codex |
| 自动测试 | 24 个测试文件、143 项测试通过 | [x] | Codex |
| 静态门禁 | typecheck、lint、npm audit 高危门禁、`git diff --check` 通过 | [x] | Codex |
| 生产构建 | Next.js 16.3.1 build 通过，包含 `/api/review`、`/api/review/preference`、`/review` | [x] | Codex |
| 发布提交 | 功能提交 `861301a6bc01e84966e7fe4bca85621650172720`；移动焦点热修 `1fe9eb9a97df3d495a7df0c86dba2577cf8e4a2d` | [x] | Codex |
| 文档状态 | 发布 SHA、deployment、READY、alias/source 与正式域名结果已回填 | [x] | Codex |

## 2. 数据库

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 偏好迁移 | `20260824090000_user_review_preferences.sql` 已在生产应用 | [x] | Codex |
| entry 认领迁移 | `20260824150000_entry_review_claim.sql` 已在生产应用 | [x] | Codex |
| nullable 读回 | `entries.review_checked_at` 存在且允许为空 | [x] | Codex |
| 删除级联 | 指向 `thoughts` 的 entries、thought_checkpoints 与 thought_connections 两端共 4 个外键均为 `ON DELETE CASCADE` | [x] | Codex |
| 来源与删除过滤 | 4 个精确 FK 的 `!inner` 在 limit 前过滤两端未删除 thought 和 user/import anchor | [x] | Codex |
| 精确计数 | pending 首屏使用 `exact + head`，生产 PostgREST 冒烟通过 | [x] | Codex |
| entry 级原子认领 | 同 entry 重试一次、不同 entry 乱序各一次、AI entry 不可认领 | [x] | Codex |
| 候选排除 | 合法 UUID 排除集合在数据库过滤后再 limit 20 | [x] | Codex |
| RLS | 偏好与回看数据仍按当前账号隔离 | [x] | Codex |
| 正式域名账号隔离 | 双账号读、写、删越权均返回 404；第二账号的跨想法回看默认关闭 | [x] | Codex |
| 数据清理 | 临时账号与相关 thoughts、entries、preferences、connections 数据回查为 0 | [x] | Codex |
| jimDB / ES / MQ / DUCC / jdos / Color | 本轮未引入，不需要额外变更 | [x] | Codex |

## 3. Supabase Auth

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| Auth 配置 | V2.4 不改变已上线的公开邮箱密码注册策略 | [x] | Codex |
| 默认隐私 | 新用户和旧用户的跨想法回看默认关闭 | [x] | Codex |
| 登录前后文案 | 登录页只说明可控的回看能力，不承诺候选结果 | [x] | Codex |
| 正式域名注册登录 | retniw.cn 公开注册、退出与重登主链通过 | [x] | Codex |
| 关闭回看 | 正式域名关闭、开启回看主链通过，第二账号默认关闭 | [x] | Codex |

## 4. 部署与域名

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 发布提交 | V2.4 功能终验 deployment 的 source SHA 为 `1fe9eb9a97df3d495a7df0c86dba2577cf8e4a2d` | [x] | Codex |
| GitHub | 功能提交与移动焦点热修已进入生产分支 | [x] | Codex |
| Vercel 状态 | `dpl_9daty4JH33kdQbc8qqBFb4nEruXB` / `retniw-n5r6ieddw-winter24.vercel.app` 为 READY | [x] | Codex |
| Vercel 来源 | API 读回 `gitSource.sha`、`meta.githubCommitSha` 均等于最新热修 SHA | [x] | Codex |
| 正式别名 | deployment aliases 包含 `retniw.cn`、`retniw.vercel.app` | [x] | Codex |
| 正式入口 | `https://retniw.cn` 已加载 V2.4；未登录根页与 `/review` 均 307 到 `/login` | [x] | Codex |
| review 路由 | 未登录 `/api/review` 返回 401；登录后回看主链通过 | [x] | Codex |
| 旧地址 | `retniw.vercel.app` 以 308 跳转到 `retniw.cn` | [x] | Codex |
| 回滚演练 | 应用可按 deployment 切回上一 READY source；本轮未实际执行回滚演练 | [ ] | Codex |

## 5. 核心产品闭环

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 普通记录 | 保存 user/import entry 后立即进入或停留在真实想法，不等待模型 | [x] | Codex（本地与线上） |
| 普通记录线上 | retniw.cn 保存响应与详情连续性通过 | [x] | Codex |
| 永久删除 | 强提醒确认后直接删除，列表、详情与导出不再出现，不提供恢复区 | [x] | Codex（本地与线上） |
| 永久删除线上 | retniw.cn 桌面与移动端强提醒、取消、确认与删除结果通过 | [x] | Codex |
| 归档子视图 | 归档只从常用列表移出，可在以前的想法下进入归档区 | [x] | Codex（本地与线上） |
| 归档线上 | 归档、进入归档子视图与列表层级在正式域名通过；取消归档由自动测试与本地回放覆盖 | [x] | Codex |
| 默认关闭 | 未主动开启时没有后台跨想法回看；第二账号默认关闭 | [x] | Codex（本地与线上） |
| 开启与关闭 | 正式域名关闭、开启回看完整主链通过 | [x] | Codex |
| 保存后调度 | 开启后仅 user/import entry 在保存响应完成后异步进入认领 | [x] | Codex |
| 独立回看 | 回看不隶属于单个 thought，可查看待处理与已处理结果 | [x] | Codex（本地与线上） |
| 桌面真实候选 | Chromium 正式域名由 DeepSeek 产出真实候选并完成保留 | [x] | Codex |
| 移动真实候选 | WebKit 375 由 DeepSeek 产出真实候选，完成两端原文、保留与原文锚点闭环 | [x] | Codex |
| 候选证据边界 | Chromium 与 WebKit 各 1 次真实候选闭环，测试语义相同，不外推模型稳定质量 | [x] | Codex |
| checkpoint | 正式域名 checkpoint 主链通过 | [x] | Codex |
| 公开注册 | 正式域名公开注册、退出与重登通过 | [x] | Codex |
| 主动 AI | 单想法推进、追问、整理仍只在用户点击后运行 | [x] | Codex（本地与线上） |
| 正式域名总闭环 | 记录 → 回看 → 保留真实候选 → 返回原想法与联系 | [x] | Codex |

## 6. 跨端与交互

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 桌面本地 | Chromium 1440 完成记录、归档、删除、回看开关与 fixture 候选 UI 闭环 | [x] | Codex |
| 移动本地 | WebKit 375 完成同一关键闭环，候选 UI 使用 fixture | [x] | Codex |
| 浮层互斥 | 点击空白、切换抽屉、Esc 或返回后只保留当前有效状态 | [x] | Codex（本地） |
| 桌面正式域名 | Chromium 1440：feedbackMs 54 / 32，无溢出、0 consoleErrors，真实候选保留通过 | [x] | Codex |
| 移动正式域名 | WebKit 375：最新 feedbackMs 59 / 45，无溢出、0 consoleErrors；关闭后重开、真实候选保留、左滑归档、永久删除的取消与确认通过，原文锚点在 viewport 内，亮蓝焦点热修生效 | [x] | Codex |
| 触摸操作 | 真实物理触摸设备的长按、左滑与删除确认手势继续观察 | [ ] | Codex |
| 返回连续性 | review 与 thought 之间返回后保留可理解的位置和状态 | [x] | Codex |

## 7. 响应与运行时

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 保存主链 | 回看调度不阻塞 entry 保存响应 | [x] | Codex |
| 列表查询 | 精确 FK 过滤在 limit 前执行，不先取后筛 | [x] | Codex |
| 数量查询 | exact/head 只在 pending 首屏请求 | [x] | Codex |
| 候选查询 | 排除集合下推数据库后再 limit 20 | [x] | Codex |
| 认领幂等 | entry 级 claim 在重复与乱序回调下通过 | [x] | Codex |
| 模型真实调用 | Chromium 与 WebKit 正式域名各得到 1 次 DeepSeek 真实候选并完成保留 | [x] | Codex |
| 正式域名响应 | Chromium feedbackMs 54 / 32，WebKit 最新 feedbackMs 59 / 45，可感知反馈连续 | [x] | Codex |
| HTTP / 控制台 | 两端均 0 consoleErrors；近 30 分钟该 deployment 的 500 日志查询为空 | [x] | Codex |
| 未登录路由 | 根页和 `/review` 307 到 `/login`，`/api/review` 返回 401 | [x] | Codex |

## 8. 回滚与持续观察

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 应用回滚 | 生产异常时可切回上一 READY source；本轮未实际执行回滚演练 | [ ] | Codex |
| 数据库回滚 | 两项迁移为兼容新增，应用回滚时保留，不在生产做破坏性降级 | [x] | Codex |
| 永久删除 | 删除无恢复能力；线上强提醒、取消与确认主链通过 | [x] | Codex |
| 回看关闭 | 可通过用户偏好立即停止新 entry 的后台回看 | [x] | Codex |
| 模型候选质量 | 当前只有桌面、移动各 1 次且测试语义相同的真实候选闭环；持续观察稳定性与长期质量 | [ ] | Codex |
| 瞬时异常 | 近 30 分钟该 deployment 的 500 日志查询为空，继续观察低频异常 | [x] | Codex |
| exact count 成本 | 数据规模放大后复核 pending exact count 成本 | [ ] | Codex |
| 三网与朋友样本 | 在移动、联通、电信网络和朋友账号继续观察完整链路 | [ ] | 用户 / Codex |
| 首次用户验证 | 至少 5 名未听过介绍的用户验证“先记录，再回看，再决定是否留下联系” | [ ] | 用户 / Codex |

## 设计与任务完成度校验（生产基线 vs 当前发布）

### 已完成

- V2.4 需求、技术设计与四个模块任务已落盘。
- 永久删除、归档子视图、回看偏好、entry 级认领、独立回看主区与 P2 查询实现已进入当前工作树。
- 24 个测试文件、143 项测试，以及 typecheck、lint、Next.js 16.3.1 build、npm audit 高危门禁、`git diff --check` 全部通过。
- 两项生产数据库迁移、entry nullable 列读回、精确 FK 嵌入列表与 exact count 冒烟通过。
- 本地 Chromium 1440 与 WebKit 375 关键闭环通过，独立复审结论为 GO。
- 功能提交与移动焦点热修均已部署；production deployment READY，alias 与两个 Vercel source SHA 字段读回一致。
- 正式域名 Chromium 1440、WebKit 375、双账号越权、默认关闭、临时数据清理、未登录路由、旧域名跳转和近 30 分钟 500 日志检查通过。
- 永久删除、归档、公开注册、checkpoint、关闭与开启回看均完成线上主链终验。
- Chromium 与 WebKit 各得到 1 次 DeepSeek 真实候选并完成保留；WebKit 同时完成关闭后重开、左滑归档和永久删除取消/确认。

### 部分完成

- DeepSeek 已有桌面、移动各 1 次真实候选闭环，只能证明主链可用；两个样本使用同一组测试语义，稳定性与长期质量仍需真实样本。
- 自动化视口已覆盖移动交互，真实物理触摸设备的长按与左滑手势仍需观察。

### 未完成

- [ ] 三网与朋友账号样本、至少 5 名首次用户验证。
- [ ] 模型候选长期质量与数据规模放大后的 exact count 成本观察。
- [ ] 不影响真实用户数据的应用回滚演练。

### 基于分支差异补充的检查项

- 构建产物保留新的 `/review`、`/api/review` 与 `/api/review/preference`，旧关系检查入口未回到正式主链。
- pending 首屏只在需要时请求 exact count，规模放大后的成本进入持续观察。
- 关闭回看与保存请求先后接近时继续以 entry claim 条件为准，生产观察不改变当前契约。
- 移动端原文锚点与亮蓝焦点热修已随最新 source SHA 上线。
