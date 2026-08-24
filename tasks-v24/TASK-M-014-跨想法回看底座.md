# Task Module: M-014 跨想法回看底座

## 模块概览
- 模块目标：用户明确开启回看后，新原文保存成功即在后台发现有依据的跨想法候选，保存响应不等待模型。
- 模块边界：包含用户偏好表、`after()` 调度、entry级原子认领、有界候选读取、DeepSeek 结构化结果、关系幂等与全局读取；不实现回看页面布局或自动总结。
- 模块依赖：无

## 任务卡
### M-014-T-001 交付保存后的跨想法候选
- 任务目标：默认关闭时不发生跨想法模型调用；开启后每次 user/import 内容完整保存都先响应，再由一次原子认领的后台回调产生最多三条带两端原文锚点且由用户决定的候选。
- 设计依据：[TECH-DESIGN.md](../TECH-DESIGN.md#验证映射)验证映射需求原文「新旧账号默认关闭；明确开启和关闭随账号跨设备同步。」与设计落点原文「`retniw-web`偏好控制；`retniw-api`偏好表」；需求原文「开启后保存仍立即完成；最多生成三条有两端原文依据的候选，失败不影响保存和继续输入。」与设计落点原文「`retniw-api`after回调和ReviewService」；需求原文「同一对想法忽略后不再出现，保留后可持续查看；并发保存不产生重复边。」与设计落点原文「`retniw-api`entry认领与关系幂等；`retniw-web`回看」；需求原文「回看列表、计数和候选召回先过滤再分页，不因无效关系或已有pair出现空页、漏项或重复重查。」与设计落点原文「`retniw-api`四FK内连接、exact head计数、候选排除下推」。Brownfield受影响符号原文：`ReviewPreferenceRepository`、`GET /api/review`、`PATCH /api/review/preference`；`POST /api/thoughts`、`POST /api/thoughts/:id/entries`、`ReviewService.processSavedEntry`、`DeepSeekTextProvider.findConnections`、`ThoughtRepository.listReviewCandidates`、`EntryRepository.claimForReview`、`EntryRepository.firstUserEntry`；`ThoughtConnectionRepository.listExistingTargets`、`createCandidate`、`listForReview`、`PATCH /api/thought-connections/:id`。数据库结构引用 [TECH-DESIGN.md H3「数据库 DDL」](../TECH-DESIGN.md#数据库-DDL) 中 `user_review_preferences` 与可空`entries.review_checked_at`增量。
- 目标代码/产出物：
  - [ ] 应用与新增文件：在 `retniw-api` 应用 [TECH-DESIGN.md H3「数据库 DDL」](../TECH-DESIGN.md#数据库-DDL)，新增 [ReviewPreferenceRepository](src/server/repositories/review-preference-repository.ts#ReviewPreferenceRepository)、[GET /api/review](app/api/review/route.ts#GET) 与 [PATCH /api/review/preference](app/api/review/preference/route.ts#PATCH)，以用户级偏好作为跨设备唯一开关。
  - [ ] 修改并新增文件：在 `retniw-api` 更新 [POST /api/thoughts](app/api/thoughts/route.ts#POST) 与追加内容 POST 路由使用的 [EntryRepository.createIdempotent](src/server/repositories/entry-repository.ts#createIdempotent)，新增 [ReviewService.processSavedEntry](src/server/review/review-service.ts#processSavedEntry)，在 user/import entry、touch 与摘要完整成功后每次都使用 Next `after()` 调度。
  - [ ] 新增方法：在 `retniw-api` 扩展 [DeepSeekTextProvider.findConnections](src/server/ai/deepseek-text-provider.ts#findConnections)、[ThoughtRepository.listReviewCandidates](src/server/repositories/thought-repository.ts#listReviewCandidates) 与 [EntryRepository.firstUserEntry](src/server/repositories/entry-repository.ts#firstUserEntry)，实现有界输入、结构化输出和两端原文锚点；候选排除集合只接收合法UUID，并在数据库limit20前下推。
  - [ ] 新增方法并复用：在 `retniw-api` 扩展 [EntryRepository.claimForReview](src/server/repositories/entry-repository.ts#claimForReview) 与 [ThoughtConnectionRepository：listExistingTargets / listForReview / countForReview](src/server/repositories/thought-connection-repository.ts#ThoughtConnectionRepository)，复用 [createCandidate](src/server/repositories/thought-connection-repository.ts#createCandidate) 与 [decide](src/server/repositories/thought-connection-repository.ts#decide) 供 `PATCH /api/thought-connections/:id` 调用，维持entry级原子认领、规范化pair、可见性先过滤后分页和`pending / confirmed / rejected`三态。
- 实现步骤：
  1. 从 [PATCH /api/review/preference](app/api/review/preference/route.ts#PATCH) 接收认证用户和 `enabled` 输入，在 [ReviewPreferenceRepository](src/server/repositories/review-preference-repository.ts#ReviewPreferenceRepository) 校验布尔值并按 `user_id` 幂等 upsert；[GET /api/review](app/api/review/route.ts#GET) 在没有偏好行时返回 `enabled=false`。
  2. 在 [POST /api/thoughts](app/api/thoughts/route.ts#POST) 与 [POST /api/thoughts/:id/entries](app/api/thoughts/[id]/entries/route.ts#POST) 判断 entry、touch 和摘要步骤全部成功且类型为 `user | import` 后，无论 entry 为新建还是幂等重放，都把 `userId`、`thoughtId`、`entryId`与保存时间信息提交给`after()`；保存响应先返回200/201，回调输出不得改变该响应，保存时间不得参与认领判断。
  3. 在 [ReviewService.processSavedEntry](src/server/review/review-service.ts#processSavedEntry) 先读取偏好；关闭时直接返回且不认领、不读取旧内容，开启时调用 [EntryRepository.claimForReview](src/server/repositories/entry-repository.ts#claimForReview)，以`user_id + thought_id + entry_id + entry_type in (user, import) + review_checked_at is null`原子更新并返回当前entry。只有认领成功的回调才调用 [ThoughtRepository.listReviewCandidates](src/server/repositories/thought-repository.ts#listReviewCandidates) 比较返回entry前2000字与最多20条未删除历史摘要；同entry重放或重复回调未命中时直接跳过，不同entry各自认领且不受回调顺序影响，AI entry不可认领。已有关系ID只接受合法UUID并在数据库查询中先排除，再limit20。
  4. 在 [DeepSeekTextProvider.findConnections](src/server/ai/deepseek-text-provider.ts#findConnections) 将输入限制为每条摘要 500 字、最多 20 条和 45 秒超时，解析并验证只返回输入集合内 0 至 3 个目标 ID及每条不超过 300 字的依据；非法 ID、越界数量、超时或供应商错误均输出本次无候选。
  5. 在 [ThoughtConnectionRepository.createCandidate](src/server/repositories/thought-connection-repository.ts#createCandidate) 按规范化pair写入`pending`，23505竞态读取既有边；[EntryRepository.claimForReview](src/server/repositories/entry-repository.ts#claimForReview) 只更新指定且未认领的user/import entry。[listForReview](src/server/repositories/thought-connection-repository.ts#listForReview) 通过两端thought与两端entry共四个精确FK做`!inner`嵌入，在limit21前过滤未删除thought和user/import锚点并直接序列化20条；[countForReview](src/server/repositories/thought-connection-repository.ts#countForReview) 复用相同过滤并执行`exact + head`，只由pending首屏请求；rejected不进入页面。
- 边界与不变约束：
  - [ ] 开关关闭、偏好读取失败或账号越权时不得读取旧原文或调用 DeepSeek，保存结果必须保持不变。
  - [ ] 不得发送 AI entry、checkpoint、合集名、账号标识、删除内容或其他账号内容；日志不得记录正文。
  - [ ] 超时、供应商异常和 `after()` 丢失不得阻塞保存，也不得生成 AI 正文、自动分类、自动归档或最终观点。
  - [ ] 同一entry重放与重复回调必须因`review_checked_at is null`未命中而跳过历史读取与模型调用；不同entry即使after回调乱序也必须各处理一次；AI entry不可认领；认领后的供应商失败不得重试同一entry。
  - [ ] 回看列表和计数必须在limit前过滤两端未删除thought及user/import锚点；pending精确计数只在首屏执行；候选排除下推仅使用合法UUID，不得拼入未校验输入。
  - [ ] 并发候选写入必须保持同一 pair 最多一行且决定状态不可逆；不得新增队列、定时任务、向量库、图数据库或回看快照表。
- 前置依赖：无
- 完成定义：
  - [ ] 新旧账号无偏好行时均关闭，开启与关闭跨设备一致，账号删除后偏好行级联清理。
  - [ ] user/import每次完整成功保存均先响应再安排回调，entry级原子认领保证同一entry最多读取历史和调用模型一次，两个不同entry无论回调顺序都各处理一次；0/1/3候选、失败、非法结果与重复pair均产生规定状态且不改写原文。
- 验证方式：
  - [x] 入口：运行 `npm test -- tests/api/thought-connections.test.ts tests/api/thought-routes.test.ts tests/unit/review-service.test.ts tests/unit/thought-lifecycle-repositories.test.ts tests/unit/review-query-repositories.test.ts`，并用延迟45秒与错误provider桩执行新建、幂等重放、重复回调和乱序回调；被测：[ReviewService.processSavedEntry](src/server/review/review-service.ts#processSavedEntry)、[EntryRepository.claimForReview](src/server/repositories/entry-repository.ts#claimForReview)、[ThoughtConnectionRepository.createCandidate](src/server/repositories/thought-connection-repository.ts#createCandidate)、[ThoughtConnectionRepository.listForReview](src/server/repositories/thought-connection-repository.ts#listForReview)与[ThoughtConnectionRepository.countForReview](src/server/repositories/thought-connection-repository.ts#countForReview)；Mock：单元与路由测试Mock DeepSeek、`after()`和Supabase。断言覆盖：关闭时认领、历史读取和provider调用均为0次；开启时同一entry重放只认领和调用模型1次，两个不同entry按新后旧或旧后新顺序均各认领1次，AI entry认领0次，认领后失败的同entry不重试，响应不等待模型且最多写3条pending，同pair并发最多1行，迁移中的`review_checked_at`保持可空；四FK内连接先过滤后limit、exact head计数及合法UUID排除下推。2026-08-24主控全量门禁24个测试文件共143项测试、typecheck、lint、build、high级别audit和diff-check全部通过；两项生产迁移读回及生产PostgREST嵌入列表/exact计数冒烟通过。
