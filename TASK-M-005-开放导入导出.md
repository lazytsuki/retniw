# Task Module: M-005 开放导入导出

## 模块概览
- 模块目标：让外部文本原样进入，也让单段、完整过程和全部关系数据可靠离开。
- 模块边界：包含粘贴、md/txt、复制、Markdown和结构化导出；不包含第三方平台 API、对象存储和复杂文件解析。
- 模块依赖：M-002、M-004

## 任务卡
### M-005-T-001 交付可迁移的内容入口与出口
- 任务目标：用户能把常用文本加入当前或新过程，也能复制单段、导出一个过程和导出全部已确认关系，所有操作均不依赖 AI。
- 设计依据：[TECH-DESIGN.md](TECH-DESIGN.md)验证映射「Enter 保存，Shift+Enter 换行，中文输入法选词不提交；支持粘贴导入和.md、.txt文件；来源可识别。」及设计落点「ThoughtComposer、ImportTextDialog」；「复制单段不带界面文字；导出完整过程 Markdown；导出全部内容和已确认关系的结构化数据。」及设计落点「Clipboard、流式Markdown和retniw.export.v1」；「外部文本原样进入；过程和全量数据可离开；导出不经过 AI。」及设计落点「import entry和服务端流式导出」；Brownfield 符号：[CaptureComposer](src/components/capture/capture-composer.tsx#CaptureComposer)、[FragmentDetailRepository.get](src/server/repositories/fragment-detail-repository.ts#get)。受影响符号：ThoughtComposer、ImportTextDialog、parseImportedText、POST /api/thoughts、POST /api/thoughts/[id]/entries。
- 目标代码/产出物：
  - [ ] 新增文件并创建符号：在 `retniw-v2` 新增 [ImportTextDialog](src/components/thoughts/import-text-dialog.tsx#ImportTextDialog)和 [parseImportedText](src/lib/import/parse-imported-text.ts#parseImportedText)；在现有解析模块新增 [parseEntryInput](src/server/fragments/parse-fragment-input.ts#parseEntryInput)。
  - [ ] 新增文件并创建符号：在 `retniw-v2` 新增 [EntryActions](src/components/thoughts/entry-actions.tsx#EntryActions)、[ExportMenu](src/components/thoughts/export-menu.tsx#ExportMenu)和 [ThoughtExportRepository](src/server/repositories/thought-export-repository.ts#ThoughtExportRepository)。
  - [ ] 新增文件并创建路由：在 `retniw-v2` 新增 [GET thought Markdown](app/api/thoughts/%5Bid%5D/export.md/route.ts#GET)与 [GET full export](app/api/export/route.ts#GET)。
- 实现步骤：
  1. 从 `import` 选择进入 [ImportTextDialog](src/components/thoughts/import-text-dialog.tsx#ImportTextDialog)让用户选择加入当前过程或新过程；粘贴来源名可空，文件来源固定为文件名。
  2. [parseImportedText](src/lib/import/parse-imported-text.ts#parseImportedText)仅接受非空 md/txt，浏览器读取并检查1,000,000字节；服务端复验后创建 import entry。
  3. [EntryActions](src/components/thoughts/entry-actions.tsx#EntryActions)只把 entry content 写入剪贴板。
  4. [GET thought Markdown](app/api/thoughts/%5Bid%5D/export.md/route.ts#GET)按 created_at,id 流式写出时间、作者类型、来源和正文。
  5. [GET full export](app/api/export/route.ts#GET)通过 [ThoughtExportRepository](src/server/repositories/thought-export-repository.ts#ThoughtExportRepository)按500行分页，流式输出 retniw.export.v1 的 thoughts、entries和 confirmed connections，不调用模型。
- 边界与不变约束：
  - [ ] 错误格式、空文件或超限文件不创建 entry；原文件二进制不进入服务器和对象存储。
  - [ ] 导出失败不修改内容；pending/rejected关系不进入出口；导入导出不得调用 DeepSeek。
- 前置依赖：M-002-T-001、M-004-T-001
- 完成定义：
  - [ ] 中文、换行和标点逐字导入；复制结果只含正文；Markdown和全量JSON离线可解析并保留稳定标识与已确认关系。
- 验证方式：
  - [ ] 入口：运行 npm test -- import export，并在 Vercel预览下载大于4.5MB的测试导出；被测：[parseImportedText](src/lib/import/parse-imported-text.ts#parseImportedText)、[GET thought Markdown](app/api/thoughts/%5Bid%5D/export.md/route.ts#GET)、[GET full export](app/api/export/route.ts#GET)；Mock：自动测试 Mock分页读取，流式与真实数据验收不 Mock数据库；断言：边界文件不写入、中文逐字一致、导出可解析、只有confirmed关系、零模型调用。
