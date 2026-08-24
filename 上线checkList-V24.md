# retniw V2.4「记录、联系、回看」· 上线checkList

> 当前状态：发布验证中。代码审查结论为 GO；生产数据库迁移已完成，生产应用部署与正式域名回放尚未完成。

## 发布依赖总表

| 顺序 | 依赖项 | 当前状态 | 放行条件 |
|---:|---|---|---|
| 1 | V2.4 两项数据库迁移 | 已完成 | 生产迁移可读回，entry nullable 列、精确嵌入列表与 exact count 冒烟通过 |
| 2 | 发布提交冻结 | 待完成 | 固定提交 SHA，工作树与 24 文件 / 143 测试门禁结果一致 |
| 3 | Vercel 生产应用部署 | 待完成 | deployment READY，alias 含 `retniw.cn`，source SHA 与发布提交一致 |
| 4 | 正式域名跨端回放 | 待完成 | Chromium 1440、WebKit 375、临时账号隔离与清理全部通过 |

## 1. 发布冻结

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 需求范围 | 永久删除、归档子视图、默认关闭的跨想法回看与独立回看主区均与 PRD / TECH-DESIGN 一致 | [x] | Codex |
| 代码审查 | `CODE-REVIEW-V24.md` 结论为 GO，无未关闭阻塞或重要风险 | [x] | 独立复审 / Codex |
| 自动测试 | 24 个测试文件、143 项测试通过 | [x] | Codex |
| 静态门禁 | typecheck、lint、npm audit 高危门禁、`git diff --check` 通过 | [x] | Codex |
| 生产构建 | Next.js 16.3.1 build 通过，包含 `/api/review`、`/api/review/preference`、`/review` | [x] | Codex |
| 发布提交 | 固定本次发布提交 SHA，并确认没有未纳入发布的必要文件 | [ ] | Codex |
| 文档状态 | 回填发布 SHA、deployment、READY、alias/source 与正式域名结果 | [ ] | Codex |

## 2. 数据库

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 偏好迁移 | `20260824090000_user_review_preferences.sql` 已在生产应用 | [x] | Codex |
| entry 认领迁移 | `20260824150000_entry_review_claim.sql` 已在生产应用 | [x] | Codex |
| nullable 读回 | `entries.review_checked_at` 存在且允许为空 | [x] | Codex |
| 来源与删除过滤 | 4 个精确 FK 的 `!inner` 在 limit 前过滤两端未删除 thought 和 user/import anchor | [x] | Codex |
| 精确计数 | pending 首屏使用 `exact + head`，生产 PostgREST 冒烟通过 | [x] | Codex |
| entry 级并发 | 同 entry 重试一次、不同 entry 乱序各一次、AI entry 不可认领 | [x] | Codex |
| 候选排除 | 合法 UUID 排除集合在数据库过滤后再 limit 20 | [x] | Codex |
| RLS | 偏好与回看数据仍按当前账号隔离 | [x] | Codex |
| 正式域名账号隔离 | 使用两个临时账号在生产 UI 复核回看偏好、候选与想法不可串读 | [ ] | Codex |
| 数据清理 | 回查临时账号及 thoughts、entries、preferences、connections 测试数据为 0 | [ ] | Codex |
| jimDB / ES / MQ / DUCC / jdos / Color | 本轮未引入，不需要额外变更 | [x] | Codex |

## 3. Supabase Auth

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| Auth 配置 | V2.4 不改变已上线的公开邮箱密码注册策略 | [x] | Codex |
| 默认隐私 | 新用户和旧用户的跨想法回看默认关闭 | [x] | Codex |
| 登录前后文案 | 登录页只说明可控的回看能力，不把 fixture 或 0 候选写成既有结果 | [x] | Codex |
| 正式域名注册登录 | retniw.cn 注册、退出、重登后进入同一账号内容 | [ ] | Codex |
| 关闭回看 | 正式域名关闭后不再认领新 user/import entry | [ ] | Codex |

## 4. 部署与域名

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 发布提交 | 记录 V2.4 production source SHA | [ ] | Codex |
| GitHub | 发布提交已推送到生产分支 | [ ] | Codex |
| Vercel 状态 | production deployment 为 READY | [ ] | Codex |
| Vercel 来源 | deployment source SHA 与发布提交一致 | [ ] | Codex |
| 正式别名 | deployment aliases 包含 `retniw.cn` | [ ] | Codex |
| 正式入口 | `https://retniw.cn` 返回 2xx 并加载 V2.4 页面 | [ ] | Codex |
| review 路由 | `/review`、`/api/review`、`/api/review/preference` 在生产可用 | [ ] | Codex |
| 旧地址 | 已有旧地址跳转口径不因本次部署回退 | [ ] | Codex |
| 回滚基线 | 记录上一 READY deployment / source，明确应用回滚目标 | [ ] | Codex |

## 5. 核心产品闭环

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 普通记录 | 保存 user/import entry 后立即进入或停留在真实想法，不等待模型 | [x] | Codex（本地） |
| 普通记录线上 | retniw.cn 保存响应与详情连续性通过 | [ ] | Codex |
| 永久删除 | 强提醒确认后直接删除，列表、详情与导出不再出现，不提供恢复区 | [x] | Codex（本地） |
| 永久删除线上 | retniw.cn 桌面与移动端确认、取消、焦点与删除结果通过 | [ ] | Codex |
| 归档子视图 | 归档只从常用列表移出，可在以前的想法下进入归档区 | [x] | Codex（本地） |
| 归档线上 | 归档、查看、取消归档与列表层级在正式域名通过 | [ ] | Codex |
| 默认关闭 | 未主动开启时没有后台跨想法回看 | [x] | Codex（本地） |
| 开启与关闭 | 用户可明确开启并随时关闭，状态变化不伪装成 AI 结果 | [x] | Codex（本地） |
| 保存后调度 | 开启后仅 user/import entry 在保存响应完成后异步进入认领 | [x] | Codex |
| 独立回看 | 回看不隶属于单个 thought，可查看待处理与已处理结果 | [x] | Codex（本地） |
| 候选 UI | 两端原文、保留、忽略与关闭交互通过 | [x] | Codex（临时 fixture） |
| 候选证据边界 | 明确记录本地 DeepSeek 本轮返回 0 候选；不把 fixture 写成模型线上产出 | [x] | Codex |
| 模型真实候选 | 在生产真实出现候选时，验证两端依据、一次性决定和长期联系落库 | [ ] | Codex |
| 主动 AI | 单想法推进、追问、整理仍只在用户点击后运行 | [x] | Codex（本地回归） |
| 正式域名总闭环 | 记录 → 回看 → 保留或忽略 → 返回原想法与联系 | [ ] | Codex |

## 6. 跨端与交互

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 桌面本地 | Chromium 1440 完成记录、归档、删除、回看开关与候选处理闭环 | [x] | Codex |
| 移动本地 | WebKit 375 完成同一关键闭环 | [x] | Codex |
| 浮层互斥 | 点击空白、切换抽屉、Esc 或返回后只保留当前有效状态 | [x] | Codex（本地） |
| 桌面正式域名 | Chromium 1440 无横向溢出、遮挡、错误和关键警告 | [ ] | Codex |
| 移动正式域名 | WebKit 375 无横向溢出、遮挡、误触和滚动断点 | [ ] | Codex |
| 触摸操作 | 归档与删除长按、滑动及确认在真实触摸设备通过 | [ ] | Codex |
| 返回连续性 | review 与 thought 之间返回后仍保留可理解的位置和状态 | [ ] | Codex |

## 7. 响应与运行时

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 保存主链 | 回看调度不阻塞 entry 保存响应 | [x] | Codex |
| 列表查询 | 精确 FK 过滤在 limit 前执行，不先取后筛 | [x] | Codex |
| 数量查询 | exact/head 只在 pending 首屏请求 | [x] | Codex |
| 候选查询 | 排除集合下推数据库后再 limit 20 | [x] | Codex |
| 并发幂等 | entry 级 claim 在重复与乱序回调下通过 | [x] | Codex |
| 本地模型调用 | DeepSeek 本轮返回 0 候选；未观察到候选生成耗时 | [x] | Codex |
| 正式域名响应 | 记录保存、打开回看、开关偏好与候选处理的可感知反馈连续 | [ ] | Codex |
| HTTP / 控制台 | 正式域名关键链路无 5xx、未处理异常和新增 console error | [ ] | Codex |

## 8. 回滚与持续观察

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 应用回滚 | 生产异常时切回上一 READY source；本次发布 SHA 与回滚 source 均已记录 | [ ] | Codex |
| 数据库回滚 | 两项迁移为兼容新增，应用回滚时保留，不在生产做破坏性降级 | [x] | Codex |
| 永久删除 | 删除无恢复能力；正式发布前再次确认强提醒和作用对象 | [ ] | Codex |
| 回看关闭 | 可通过用户偏好立即停止新 entry 的后台回看 | [x] | Codex |
| 模型 0 候选 | 真实用户期若仍为 0，记录为模型结果，不用 fixture 补齐产品结论 | [ ] | Codex |
| 瞬时异常 | 继续观察详情读取、review API 与 PostgREST 嵌入查询的 5xx | [ ] | Codex |
| 用户验证 | 验证用户能否不经说明理解“先记录，再回看，再决定是否留下联系” | [ ] | 用户 / Codex |

## 设计与任务完成度校验（生产基线 vs 当前发布）

### 已完成

- V2.4 需求、技术设计与四个模块任务已落盘。
- 永久删除、归档子视图、回看偏好、entry 级认领、独立回看主区与 P2 查询实现已进入当前工作树。
- 24 个测试文件、143 项测试，以及 typecheck、lint、Next.js 16.3.1 build、npm audit 高危门禁、`git diff --check` 全部通过。
- 两项生产数据库迁移、entry nullable 列读回、精确 FK 嵌入列表与 exact count 冒烟通过。
- 本地 Chromium 1440 与 WebKit 375 关键闭环通过，独立复审结论为 GO。

### 部分完成

- 候选 UI 已用临时 fixture 完成闭环；本地 DeepSeek 真实调用返回 0 候选，因此尚无模型产出候选的端到端证据。
- 数据库生产侧已就绪，生产应用尚未部署。

### 未完成

- 固定并推送 V2.4 发布 SHA。
- 取得 Vercel READY、alias 与 source SHA 证据。
- 在 retniw.cn 完成 Chromium 1440、WebKit 375、临时双账号隔离和清理回放。
- 记录真实 DeepSeek 候选结果及真实用户对“记录 → 回看 → 留下联系”链路的理解。

### 基于分支差异补充的检查项

- 发布前确认删除旧关系检查路由与组件后，没有残留链接、导入或离线缓存入口。
- 正式域名核对 `/review` 首屏是否只在需要时请求 exact count，切换筛选不产生重复请求。
- 正式域名核对关闭回看与保存请求并发时，以 claim 条件为准，不误处理关闭后的新 entry。
- 部署证据未形成前，所有文档只写“发布验证中”，不写“已发布”。
