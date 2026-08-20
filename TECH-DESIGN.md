---
delivery_scope: fullstack
source_inputs: PRD.md, WORKFLOW-STATE.md, package.json, app/page.tsx, app/fragments/[id]/page.tsx, app/api/fragments/route.ts, app/api/fragments/[id]/route.ts, src/components/capture/capture-composer.tsx, src/components/fragments/fragment-timeline.tsx, src/hooks/use-capture-outbox.ts, src/lib/capture/capture-store.ts, src/server/repositories/fragment-repository.ts, src/server/repositories/fragment-detail-repository.ts, src/server/ai/deepseek-text-provider.ts, public/sw.js, 用户确认 2026-08-19
codebase_path: /Users/liyingliang.7/retniw
codebase_mode: brownfield
implementation_target: retniw-v2
persistent_reference_states: delete
database_change: new_table
sql_dialect: postgresql
---
# retniw 技术设计

## 决策摘要

### 改动点

| 位置 | 处理 | 结果 |
| --- | --- | --- |
| `CaptureComposer`、`FragmentTimeline` | 重写 | 保存后留在当前过程，输入始终可继续 |
| `fragments`、`clarifications`、`connections` | 停止写入 | 旧数据迁入新结构，旧表保留作回退 |
| 新增 `thoughts`、`entries`、`thought_connections` | 新建 | 分开保存思考过程、内容段和关系 |
| `DeepSeekTextProvider` | 重构 | 普通输入不调用 AI；主动操作流式返回；关系检查独立运行 |
| IndexedDB 捕捉队列 | 重构 | 从单条草稿改为按思考过程保存多段待同步内容 |
| 导入与导出 | 新增 | 浏览器读取文本文件；服务端流式导出 Markdown 和结构化数据 |

- 页面和数据围绕“思考过程”组织。一个过程可以只有一段，也可以持续追加；每段内容独立、不可覆盖。[PRD]
- 用户输入、导入内容和 AI 输出统一按发生顺序展示，但保留各自来源。普通输入只保存，不自动生成 AI 回复。[PRD]
- AI 只在用户选择“推进”“追问”“整理”时生成内容；“寻找联系”启动关系检查，不生成一段聊天回复。DeepSeek 主输出使用 SSE，页面收到首个可读片段后立即展示。[PRD][DeepSeek 官方接口](https://api-docs.deepseek.com/api/create-chat-completion/)
- 保存、同步、AI 和关系检查是四套独立状态。任何一项失败都不撤销本地内容，也不锁住输入框。[PRD]
- `.md`、`.txt`文件由浏览器读取，不上传原文件、不增加对象存储；服务端只接收正文和来源名称。[设计决策]
- 新数据结构与旧三表并存。迁移后新代码只读写新表；旧表不删除，确认新版本稳定后再另行决定清理。[设计决策]
- 继续使用 Next.js App Router、Supabase、Vercel 和现有 DeepSeek 服务，不增加独立后端、消息队列、向量库、图数据库或第二模型供应商。[PRD]
- DeepSeek `deepseek-v4-flash`当前支持 SSE 和 1M 上下文；实现仍在服务端限制输入，避免把无关内容送给模型。[DeepSeek 官方模型说明](https://api-docs.deepseek.com/quick_start/pricing/)
- Vercel Function 请求和响应体上限为4.5 MB。单文件导入限制为1,000,000字节；导出采用流式响应，避免一次拼装全部数据。[Vercel 官方限制](https://vercel.com/docs/functions/limitations)
- 数据库方言为`postgresql`，新表DDL只使用Supabase PostgreSQL支持的表、约束、索引和RLS语法。[代码: package.json]

### 修改后流程

```mermaid
flowchart TD
    A[打开 retniw] --> B[输入或导入]
    B --> C[立即写入页面和 IndexedDB]
    C --> D[后台同步 thoughts 和 entries]
    D --> E[继续输入]
    D --> F[独立检查关系]
    E --> D
    E --> G{用户主动调用 AI}
    G --> H[DeepSeek 流式返回]
    H --> I[完成后保存为 AI 内容段]
    I --> E
    F --> J{有候选}
    J -->|是| K[用户保留或否定]
    J -->|否| E
    E --> L[复制或导出]
```

## 改动设计

### 前端

#### 稳定的思考工作区

- 需求/验收：一句话保存后留在原处；至少可连续追加三段；AI 输出后仍可继续写；桌面与手机使用同一套功能。
- 实现目标：`retniw-v2`，把首页和详情改成同一个持续可写的工作区。
- 现状逻辑与代码证据：[`CaptureComposer.handleSubmit`](src/components/capture/capture-composer.tsx#handleSubmit)保存后执行`router.push('/fragments/...')`；[`FragmentTimeline`](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)依次自动请求 Clarify 和 Reconnect，末尾只提供“继续记录”返回首页。当前状态机把单条碎片当成流程终点。
- 增量修改：新增`ThoughtWorkspace`作为首页和`/thoughts/[id]`的共同主体。第一次保存后，本地状态从空白输入切换为当前过程，不卸载输入区；后续每次 Enter 都追加一条 entry。宽屏左侧显示过程，右侧显示最近过程、来源和关系；900px 以下改为单列。访问旧`/fragments/[id]`时按同一标识重定向到`/thoughts/[id]`。
- 受影响符号：`CaptureComposer`、`FragmentTimeline`、`RecentFragments`、`CapturePage`、`FragmentDetailPage`、`ThoughtWorkspace`、`ThoughtPage`
- 验证入口：从空白首页连续保存三段，断言同步期间输入区不卸载、页面无空白；在手机和桌面断点打开同一过程，断言内容和操作一致。
- 边界与不变约束：不新增聊天会话、标题、文件夹、标签或步骤向导；一段内容仍可单独构成完整过程。

#### 本地先保存与后台同步

- 需求/验收：输入下一帧可见；断网和刷新不丢；同步失败可重试；失败状态不能伪装成已同步。
- 实现目标：`retniw-v2`，把 IndexedDB 从单条捕捉队列改成按过程保存多段内容的 outbox。
- 现状逻辑与代码证据：[`CaptureItem`](src/lib/capture/capture-store.ts#CaptureItem)只保存`clientRequestId + content + state`；[`useCaptureOutbox`](src/hooks/use-capture-outbox.ts#useCaptureOutbox)成功后删除单条；当前无法表达一个过程中的多段顺序和来源。
- 增量修改：对象仓升级为`thought_outbox`，每项保存`thoughtId`、`entryId`、`clientRequestId`、`entryType`、`content`、`sourceLabel`、`state`、`createdAt`。客户端预先生成稳定 UUID，先把 entry 加到页面和 IndexedDB，再调用 API。同步成功只删除对应项；失败项留在原位置并显示“未同步”和重试。队列按本地创建顺序串行发送。
- 受影响符号：`captureStore`、`useCaptureOutbox`、`ThoughtWorkspace`、`SyncStatus`
- 验证入口：离线连续输入三段、刷新、恢复网络，断言三段仍在且按原顺序同步；对同一`clientRequestId`并发重试，数据库只有一条 entry。
- 状态传导：本地保存、远端同步、AI 和关系检查分别存储与展示；一个状态变化不清空其他状态。

#### Enter、导入和来源

- 需求/验收：Enter 保存，Shift+Enter 换行，中文输入法选词不提交；支持粘贴导入和`.md`、`.txt`文件；来源可识别。
- 实现目标：`retniw-v2`，让直接输入和外部文本进入同一工作区，同时保留来源。
- 现状逻辑与代码证据：[`CaptureComposer`](src/components/capture/capture-composer.tsx#CaptureComposer)已有 Enter、Shift+Enter 和`isComposing`判断，但只创建`inputMode: text`碎片；当前没有文件读取和来源字段。
- 增量修改：保留现有键盘判定。新增`ImportTextDialog`，用户选择加入当前过程或新过程；文件在浏览器用`File.text()`读取，前端先检查扩展名、非空和不超过1,000,000字节，服务端再校验正文。文件来源名固定为文件名；粘贴来源名可空。导入正文作为一条`entryType=import`的 entry，不自动拆分或调用 AI。
- 受影响符号：`ThoughtComposer`、`ImportTextDialog`、`parseImportedText`、`POST /api/thoughts`、`POST /api/thoughts/[id]/entries`
- 验证入口：导入含中文、换行和常见标点的 md/txt；断言正文逐字一致、文件名可见；不支持格式、空文件和超限文件不创建 entry。

#### 主动 AI 与流式显示

- 需求/验收：普通输入不自动回复；用户主动调用后100毫秒内有状态；逐步显示内容；失败不锁住输入。
- 实现目标：`retniw-v2`，把 AI 从固定流程改为工作区中的显式工具。
- 现状逻辑与代码证据：[`FragmentTimeline`](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)在详情加载后自动调用 Clarify；[`DeepSeekTextProvider.complete`](src/server/ai/deepseek-text-provider.ts#complete)固定`stream:false`并等待完整 JSON 后返回。
- 增量修改：工作区提供“推进”“追问”“整理”“寻找联系”。前三项调用`POST /api/thoughts/[id]/ai`，点击时立即创建独立的本地 AI 状态，读取服务端 SSE 并逐段显示；服务端完成后返回已持久化 entry 标识，客户端把临时内容替换为已同步内容。“寻找联系”只启动关系检查。AI 请求进行时输入框、复制和导出仍可用；中断的部分输出标记为未保存，不混入正式过程。
- 受影响符号：`AiActions`、`StreamingAiEntry`、`useAiAction`、`DeepSeekTextProvider.streamText`、`POST /api/thoughts/[id]/ai`
- 验证入口：普通保存时断言没有 DeepSeek 请求；逐块模拟 SSE，断言首块立刻可见；供应商超时、断流和非法响应时，原有 entries 不变且输入仍可提交。
- 边界与不变约束：AI 不自动续聊、不替用户决定下一步、不覆盖用户或导入原文。

#### 加载、回看与位置恢复

- 需求/验收：切换时先显示内容或骨架，不出现整页空白；返回同一过程后恢复阅读和输入位置。
- 实现目标：`retniw-v2`，为页面初载、过程切换和各类后台操作提供一致状态。
- 现状逻辑与代码证据：[`CapturePage`](app/page.tsx#CapturePage)在首页服务端等待最近记录后才渲染主体；[`FragmentTimeline`](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)让 Clarify 和 Reconnect共用`phase`状态，页面缺少本地内容承接。
- 增量修改：新增`ThoughtSkeleton`处理无缓存初载；有本地缓存时先画已有 entries，再后台校准。页面用`sessionStorage`按`thoughtId`保存滚动位置和未提交输入位置，重新打开后恢复；跨端依赖服务端 entries 恢复内容与顺序，不把设备 A 的滚动位置强制覆盖设备 B。每个异步区域就地显示状态，不使用全屏 loading。
- 受影响符号：`ThoughtSkeleton`、`ThoughtWorkspace`、`useThoughtPosition`、`app/thoughts/[id]/loading.tsx`
- 验证入口：慢速网络下切换最近过程，断言先见骨架或缓存；同一设备离开再返回恢复位置；另一设备打开时内容与顺序一致。

#### 复制与导出

- 需求/验收：复制单段不带界面文字；导出完整过程 Markdown；导出全部内容和已确认关系的结构化数据。
- 实现目标：`retniw-v2`，输出不依赖 AI，且数据离开应用后仍可解释。
- 现状逻辑与代码证据：当前页面和 API 没有复制或导出入口，[`FragmentDetailRepository.get`](src/server/repositories/fragment-detail-repository.ts#get)只返回单条原文、澄清和当前连接。
- 增量修改：每条 entry 提供复制按钮，只复制`content`。过程菜单下载`/api/thoughts/[id]/export.md`；全量导出下载`/api/export`。两条导出接口都使用`ReadableStream`分批写出，页面显示“准备中/正在下载/失败”，失败不修改内容。
- 受影响符号：`EntryActions`、`ExportMenu`、`GET /api/thoughts/[id]/export.md`、`GET /api/export`
- 验证入口：复制一条含换行正文并与数据库逐字比对；导出 Markdown 和 JSON 后离线解析，断言顺序、来源、作者类型、稳定标识和已确认关系完整。

### 后端与数据

#### 思考过程与内容段

- 需求/验收：短内容和连续内容使用同一结构；用户、导入和 AI 内容分别保存；最近记录按过程归组。
- 实现目标：`retniw-v2`，用thoughts表示持续过程，用entries表示不可覆盖的内容段。
- 现状逻辑与代码证据：[`FragmentRepository.createIdempotent`](src/server/repositories/fragment-repository.ts#createIdempotent)每次请求都向`fragments`写一行；[`FragmentDetailRepository.get`](src/server/repositories/fragment-detail-repository.ts#get)只装载一个 fragment 和一条 clarification，无法在同一对象下继续追加任意数量内容。
- 增量修改：首次写入由`POST /api/thoughts`创建 thought 和第一条 entry；后续由`POST /api/thoughts/[id]/entries`追加。客户端提供 thought、entry 和请求 UUID。若两步写入中断，重试先读取已有记录，再补齐 entry 和`last_activity_at`，只有包含 entry 的 thought 才进入最近列表。`entries`不提供正文更新和删除接口。
- 受影响符号：`ThoughtRepository`、`EntryRepository`、`POST /api/thoughts`、`POST /api/thoughts/[id]/entries`、`GET /api/thoughts`、`GET /api/thoughts/[id]`
- 验证入口：覆盖首次写入在 thought 后失败、entry 已写入但活跃时间未更新、重复请求和并发请求；重试后断言只有一个 thought 和一条对应 entry，最近列表顺序正确。

#### 服务端身份与所有权

- 需求/验收：个人内容仅本人可访问，服务角色和模型密钥不进入浏览器。
- 实现目标：`retniw-v2`，沿用当前 Cookie 身份和服务端数据边界覆盖新表。
- 现状逻辑与代码证据：[`requireUser`](src/lib/auth/require-user.ts#requireUser)从 Supabase Cookie 会话取身份；[`createServiceClient`](src/lib/supabase/service.ts#createServiceClient)只在服务端使用，当前repository查询同时带`user_id`。
- 增量修改：新三表同样启用 RLS 且不创建浏览器策略。所有 Route Handler先`requireUser`，repository所有读取、写入和状态更新都同时限制`user_id`。非本人资源返回404。正文、导入内容、AI上下文和密钥不写日志。
- 受影响符号：`requireUser`、`createServiceClient`、`ThoughtRepository`、`EntryRepository`、`ThoughtConnectionRepository`
- 验证入口：匿名客户端、普通 Supabase 客户端和第二账号分别尝试读取与修改新三表；断言被拒绝或返回404，浏览器构建产物不含服务角色或 DeepSeek 密钥。
- 状态传导：
  - 删除：
    - 代码入口：Supabase Auth 管理端删除用户
    - 新引用结构：`thoughts.user_id`、`entries.user_id`、`thought_connections.user_id`引用`auth.users.id`
    - 风险：账号删除后残留不可访问的个人内容
    - 传导/清理方案：三表使用`on delete cascade`；旧表继续沿用已有级联约束
    - 验证：测试账号写入新旧结构后删除账号，断言所有对应记录清理

#### DeepSeek 主输出

- 需求/验收：主动调用时流式显示；AI输出单独保存；模型失败不影响用户内容。
- 实现目标：`retniw-v2`，提供文本 SSE 适配层，并在完整结束后持久化结果。
- 现状逻辑与代码证据：[`DeepSeekTextProvider.complete`](src/server/ai/deepseek-text-provider.ts#complete)固定使用非思考模式、`stream:false`和 JSON Output，适合旧 Clarify/Reconnect，但不能逐段展示自由文本。
- 增量修改：保留非思考模式和单一供应商。新增`streamText(action, entries)`，向 DeepSeek发送当前过程内按顺序整理的必要 entries，设置`stream:true`并解析`data:`事件、keep-alive和`[DONE]`。服务端向浏览器转发`start`、`delta`、`saved`、`error`事件；只有正常结束、正文非空且不超过20,000字符时，才以同一`clientRequestId`保存 AI entry。最多发送500,000字符上下文；超限不静默截断，返回`CONTEXT_TOO_LARGE`。
- 受影响符号：`DeepSeekTextProvider.streamText`、`POST /api/thoughts/[id]/ai`、`EntryRepository.createIdempotent`
- 验证入口：模拟 SSE keep-alive、多字节中文分块、`[DONE]`、限流、超时、断流和超长输出；断言事件顺序正确，只有完整输出持久化一次。

#### 关系检查与决策

- 需求/验收：关系检查不阻塞输入；一次最多一个候选；候选未经确认不成为长期关系；否定后不重复提出同一对。
- 实现目标：`retniw-v2`，关系建立在思考过程之间，并保留两端具体内容段作为依据。
- 现状逻辑与代码证据：[`Connection`](src/server/repositories/fragment-detail-repository.ts#Connection)只表达 fragment 对；[`FragmentTimeline`](src/components/fragments/fragment-timeline.tsx#FragmentTimeline)必须回答或跳过问题后才请求 Reconnect，关系状态与固定澄清流程互相阻塞。
- 增量修改：每次用户或导入 entry 同步后，客户端独立请求`POST /api/thoughts/[id]/relations/check`；若页面提前关闭，详情加载时发现`relation_checked_at < last_activity_at`则补发。服务端读取当前过程和同用户最近20个其他过程，DeepSeek JSON Output最多返回一个候选及两端依据 entry。`thought_connections`按 thought ID 规范化并唯一；已有 pending 返回原候选，confirmed/rejected均不复活，并发唯一冲突后重读。完成或无候选都更新`relation_checked_at`。
- 受影响符号：`DeepSeekTextProvider.findConnection`、`ThoughtConnectionRepository`、`POST /api/thoughts/[id]/relations/check`、`PATCH /api/thought-connections/[id]`
- 验证入口：覆盖单过程、无候选、非法目标、并发检查、已有三种状态、离开后补发和跨用户访问；断言输入接口不等待关系结果，否定关系不再出现。

#### 导入、导出和数据边界

- 需求/验收：外部文本原样进入；过程和全量数据可离开；导出不经过 AI。
- 实现目标：`retniw-v2`，限制输入体积，分批读取数据库并流式输出。
- 现状逻辑与代码证据：[`CaptureComposer`](src/components/capture/capture-composer.tsx#CaptureComposer)把输入限制为10,000字符；[`FragmentRecord`](src/server/repositories/fragment-repository.ts#FragmentRecord)没有来源字段，也没有导出契约。
- 增量修改：直接输入仍限制10,000字符；单次导入限制1,000,000字节且 entry 正文最多1,000,000字符。Markdown导出按`created_at,id`排序写出过程元数据和 entries；全量JSON按500行分页读取 thoughts、entries和 confirmed connections，边读边写，不调用模型、不创建导出记录。
- 受影响符号：`parseEntryInput`、`ThoughtExportRepository`、`GET /api/thoughts/[id]/export.md`、`GET /api/export`
- 验证入口：分别测试边界值、超限、中文多字节、超出单次响应大小的全量导出和客户端中断；断言原数据不变且输出可重新解析。

#### 旧数据迁移

- 需求/验收：现有用户内容不清空，旧链接可继续打开，新代码不继续产生旧结构数据。
- 实现目标：`retniw-v2`，幂等迁移现有 fragments、clarifications 和 connections，并保留旧表回退。
- 现状逻辑与代码证据：[`FragmentRepository`](src/server/repositories/fragment-repository.ts#FragmentRepository)、[`FragmentDetailRepository`](src/server/repositories/fragment-detail-repository.ts#FragmentDetailRepository)和[`ConnectionRepository`](src/server/repositories/connection-repository.ts#ConnectionRepository)正在读写三张旧表；浏览器验收已经产生真实内容与关系。
- 增量修改：新增一次性`scripts/migrate-fragments-to-thoughts.mjs`。每个 fragment 迁为同 ID thought，原文迁为首条 user entry；clarification问题迁为`ai_action=question`的 AI entry，已有回答迁为后一条 user entry；旧 connection迁为 thought connection并保留 pending、confirmed或rejected状态、理由和时间。迁移标识由旧记录 ID 确定，重复执行只补缺失记录。切换新代码后旧 API 停止写入，旧表不删除。
- 受影响符号：`scripts/migrate-fragments-to-thoughts.mjs`、`fragments`、`clarifications`、`connections`、`thoughts`、`entries`、`thought_connections`
- 验证入口：对迁移前快照执行两次脚本；逐项比对用户原文、问题、回答、状态、时间和关系数量；旧 fragment URL 重定向后可读同一内容。
- 边界与不变约束：本次不执行旧表删除，不把旧自动问题误标为用户原文。

### 数据库 DDL

```sql
create table public.thoughts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  last_activity_at timestamptz not null default now(),
  relation_checked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint thoughts_user_id_id_unique unique (user_id, id),
  constraint thoughts_relation_check_order check (
    relation_checked_at is null or relation_checked_at >= created_at
  )
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thought_id uuid not null,
  client_request_id uuid not null,
  entry_type text not null,
  content text not null,
  source_label text,
  ai_action text,
  created_at timestamptz not null default now(),
  constraint entries_thought_owner_fk
    foreign key (user_id, thought_id)
    references public.thoughts (user_id, id)
    on delete cascade,
  constraint entries_user_id_id_unique unique (user_id, id),
  constraint entries_user_thought_id_unique unique (user_id, thought_id, id),
  constraint entries_user_request_unique unique (user_id, client_request_id),
  constraint entries_type_check check (entry_type in ('user', 'import', 'ai')),
  constraint entries_content_length check (
    char_length(btrim(content)) between 1 and 1000000
  ),
  constraint entries_source_label_length check (
    source_label is null or char_length(source_label) between 1 and 255
  ),
  constraint entries_ai_action_check check (
    (entry_type = 'ai' and ai_action in ('advance', 'question', 'organize'))
    or (entry_type <> 'ai' and ai_action is null)
  )
);

create table public.thought_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_thought_id uuid not null,
  target_thought_id uuid not null,
  source_entry_id uuid not null,
  target_entry_id uuid not null,
  rationale text not null,
  status text not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint thought_connections_source_thought_owner_fk
    foreign key (user_id, source_thought_id)
    references public.thoughts (user_id, id)
    on delete cascade,
  constraint thought_connections_target_thought_owner_fk
    foreign key (user_id, target_thought_id)
    references public.thoughts (user_id, id)
    on delete cascade,
  constraint thought_connections_source_entry_owner_fk
    foreign key (user_id, source_thought_id, source_entry_id)
    references public.entries (user_id, thought_id, id)
    on delete cascade,
  constraint thought_connections_target_entry_owner_fk
    foreign key (user_id, target_thought_id, target_entry_id)
    references public.entries (user_id, thought_id, id)
    on delete cascade,
  constraint thought_connections_distinct_thoughts check (
    source_thought_id < target_thought_id
  ),
  constraint thought_connections_rationale_length check (
    char_length(btrim(rationale)) between 1 and 1000
  ),
  constraint thought_connections_status_check check (
    status in ('pending', 'confirmed', 'rejected')
  ),
  constraint thought_connections_decision_state check (
    (status = 'pending' and decided_at is null)
    or (status in ('confirmed', 'rejected') and decided_at is not null)
  ),
  constraint thought_connections_pair_unique unique (
    user_id, source_thought_id, target_thought_id
  )
);

create index thoughts_user_activity_idx
  on public.thoughts (user_id, last_activity_at desc, id desc);

create index entries_user_thought_created_idx
  on public.entries (user_id, thought_id, created_at asc, id asc);

create index thought_connections_user_status_created_idx
  on public.thought_connections (user_id, status, created_at desc);

create index thought_connections_user_target_idx
  on public.thought_connections (user_id, target_thought_id);

alter table public.thoughts enable row level security;
alter table public.entries enable row level security;
alter table public.thought_connections enable row level security;
```

## 契约

### 页面与本地状态

| 契约 | 内容 | 约束 |
| --- | --- | --- |
| `/` | 空白输入、当前过程和最近过程 | 保存后不跳离工作区 |
| `/thoughts/[id]` | 指定思考过程 | 只返回当前用户资源 |
| `/fragments/[id]` | 旧链接兼容 | 重定向到同 ID 的 thought |
| `/offline` | 离线冷启动 | 不缓存个人页面；恢复网络后读取 IndexedDB |
| `thought_outbox` | IndexedDB 待同步 entries | 成功后逐条删除，不冒充服务端已同步 |

### HTTP 接口

所有接口使用 Supabase Cookie 会话；成功为`{ data }`，普通失败为`{ error: { code, message, retryable } }`。SSE接口使用命名事件。非本人资源统一404。

| 接口 | 输入 | 结果 |
| --- | --- | --- |
| `POST /api/thoughts` | `thoughtId`、`entryId`、`clientRequestId`、正文、类型、来源 | 创建过程和首条 entry；重复请求返回既有结果 |
| `GET /api/thoughts` | 可空 cursor | 最近20个过程、首段摘录和下一游标 |
| `GET /api/thoughts/[id]` | thought ID | 完整 entries、关系状态和候选两端原文 |
| `POST /api/thoughts/[id]/entries` | `entryId`、`clientRequestId`、正文、类型、来源 | 追加一条 user 或 import entry |
| `POST /api/thoughts/[id]/ai` | `clientRequestId`、`action` | SSE：`start`、`delta`、`saved`或`error` |
| `POST /api/thoughts/[id]/relations/check` | thought ID | 一个候选或空结果；重复检查幂等 |
| `PATCH /api/thought-connections/[id]` | `decision: confirmed或rejected` | 只允许 pending 决定一次 |
| `GET /api/thoughts/[id]/export.md` | thought ID | 流式 Markdown 附件 |
| `GET /api/export` | 无 | 流式 JSON 附件，导出版本`retniw.export.v1` |

固定错误码为`INVALID_INPUT`、`UNAUTHENTICATED`、`NOT_FOUND`、`STATE_CONFLICT`、`CONTEXT_TOO_LARGE`、`AI_UNAVAILABLE`、`INTERNAL_ERROR`。

### 导出结构

全量 JSON 顶层包含：

- `format: "retniw.export.v1"`
- `exportedAt`
- `thoughts[]`: `id`、`createdAt`、`lastActivityAt`
- `entries[]`: `id`、`thoughtId`、`entryType`、`content`、`sourceLabel`、`aiAction`、`createdAt`
- `connections[]`: 仅 confirmed，包含`id`、两端 thought ID、两端 entry ID、`rationale`、`decidedAt`、`createdAt`

Markdown按 entry 顺序输出正文，并在每段前写入时间、作者类型和可空来源；不加入页面按钮、状态文案或模型提示词。

### DeepSeek 边界

- 只在服务端读取`DEEPSEEK_API_KEY`和模型名，继续使用`deepseek-v4-flash`非思考模式。
- “推进”“追问”“整理”发送当前过程内完成本次操作需要的 entries；上限500,000字符，超限明确失败，不静默丢上下文。
- 关系检查发送当前过程和最近20个候选过程的必要原文；模型只能在服务端给定候选中选择。
- 不发送邮箱、Supabase用户标识、文件本体、导出数据或身份凭据；日志只记请求标识、动作、耗时、状态码和字节数。
- 不自动切换供应商；失败后由用户重试或继续写。

## 风险与交付

- 新旧结构并存期间，先执行新表 DDL，再跑幂等迁移和数据核对，最后切换应用写入口。任一步失败都保持旧应用和旧表可读；本次不删除旧表。
- 首次创建 thought 和 entry 不是单个数据库事务。客户端稳定 ID、唯一约束和“重试补齐”闭合部分失败；只有含 entry 的 thought 对用户可见。
- Supabase服务角色绕过 RLS。所有 repository 方法必须显式接收`userId`并加过滤；禁止暴露不带所有权条件的产品查询。
- 浏览器读取文件后只发送文本和来源名。文件原始二进制不进入 Supabase、Vercel文件系统或对象存储。
- AI SSE 完成前的部分输出不算正式内容。断流时页面标为未保存，不能把半段输出混入导出。
- `last_activity_at`在 entry 写入后更新；若更新失败，接口返回可重试错误，重复请求先找到既有 entry 再补更新时间。
- Service Worker继续只缓存版本化静态资源和`/offline`；`/api`、带 Cookie 页面和导出响应不写 Cache Storage。
- 1,000,000字节单文件限制低于 Vercel 4.5 MB请求体上限并给 JSON 编码留余量；以后支持更大文件时改为分片或专用存储。
- 交付顺序：数据库与迁移 → repository和接口 → IndexedDB与稳定工作区 → AI流式输出 → 关系 → 导入导出 → 响应式和全链路验收。

## 验证映射

| 需求/验收 | 设计落点 | 验证方式 | 证据/环境 |
| --- | --- | --- | --- |
| 一句话保存后留在原处；至少可连续追加三段；AI 输出后仍可继续写；桌面与手机使用同一套功能。 | `retniw-v2`稳定工作区 | 浏览器连续追加三段并刷新回读，AI结束后再追加 | Chrome桌面与移动模拟、真实Supabase |
| 输入下一帧可见；断网和刷新不丢；同步失败可重试；失败状态不能伪装成已同步。 | 本地乐观entry、`thought_outbox`和独立同步状态 | 离线三段、刷新、联网重试并核对状态 | IndexedDB与真实API |
| Enter 保存，Shift+Enter 换行，中文输入法选词不提交；支持粘贴导入和`.md`、`.txt`文件；来源可识别。 | `ThoughtComposer`、`ImportTextDialog` | 中文输入法和键盘测试；导入中文、换行、边界和错误格式 | 浏览器与数据库比对 |
| 普通输入不自动回复；用户主动调用后100毫秒内有状态；逐步显示内容；失败不锁住输入。 | 显式`AiActions`、本地start状态和SSE | 监听普通保存网络；延迟首块、逐块返回、503后继续输入 | Vitest流模拟、浏览器 |
| 切换时先显示内容或骨架，不出现整页空白；返回同一过程后恢复阅读和输入位置。 | 缓存内容、`ThoughtSkeleton`和`useThoughtPosition` | 慢速网络切换，离开后返回 | Chrome网络限速 |
| 复制单段不带界面文字；导出完整过程 Markdown；导出全部内容和已确认关系的结构化数据。 | Clipboard、流式Markdown和`retniw.export.v1` | 逐字比对复制；下载后离线解析两类导出 | Chrome、Node解析脚本 |
| 短内容和连续内容使用同一结构；用户、导入和 AI 内容分别保存；最近记录按过程归组。 | `thoughts + entries`和entry类型 | 单段与多段写入后查询最近列表和详情 | 真实Supabase |
| 个人内容仅本人可访问，服务角色和模型密钥不进入浏览器。 | RLS无客户端策略、服务端userId过滤 | 匿名、普通客户端、第二账号访问并扫描浏览器包 | 自动测试、真实Supabase |
| 主动调用时流式显示；AI输出单独保存；模型失败不影响用户内容。 | `DeepSeekTextProvider.streamText`和AI entry | SSE成功、超时、断流、非法输出 | Vitest、真实DeepSeek |
| 关系检查不阻塞输入；一次最多一个候选；候选未经确认不成为长期关系；否定后不重复提出同一对。 | 独立关系接口、唯一约束和状态分支 | 并发检查、持续输入、rejected后重复检查 | Vitest、真实Supabase |
| 外部文本原样进入；过程和全量数据可离开；导出不经过 AI。 | import entry和服务端流式导出 | 原文比对；超过4.5MB时导出并确认没有模型请求 | Vercel预览、真实Supabase |
| 现有用户内容不清空，旧链接可继续打开，新代码不继续产生旧结构数据。 | 幂等迁移、旧链接重定向和旧写入口停用 | 迁移前后逐项核对，脚本重复执行，保存新内容后查旧表 | Supabase快照、迁移报告 |

实现完成后统一运行`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`，再执行真实Supabase迁移核对、DeepSeek流式调用、桌面与手机浏览器验收。性能记录以用户点击时刻、状态出现时刻和首个可读 SSE 片段时刻计算，不把测试 Mock 当作3秒目标证据。

## 设计假设

- 当前真实旧数据需要保留；选择非破坏迁移，不把“项目仍在早期”解释为可以清空用户内容。
- 首版只有项目所有者使用，不增加多成员、共享和权限角色。
- 直接输入沿用当前10,000字符上限；文件导入放宽到1,000,000字节，以支持普通长文本同时远低于平台请求体限制。
- 最近关系候选沿用当前20个对象的范围；首版不为提高召回率增加向量或图系统。
- 同一设备恢复精确滚动和光标位置；跨设备恢复内容、顺序和可继续输入状态，不同步像素级滚动位置。
- 旧表清理、更多文件格式、语音、第三方平台接入和可视化图谱不在本次交付内。
