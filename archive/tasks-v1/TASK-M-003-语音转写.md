# Task Module: M-003 语音转写（后续迭代）

## 模块概览

- 模块目标：用户可把一次短录音转成可编辑文字，再自行决定是否保存。
- 模块边界：不属于首版，不影响澄清、重连和首版交付。
- 模块依赖：M-002
- 前置条件：重新确认转写供应商、音频隐私边界和移动端浏览器体验。

## 任务卡

### M-003-T-001 交付安全可退回文字的语音输入

- 任务目标：把短录音转成可编辑文字，不自动创建碎片。
- 设计依据：[PRD.md](PRD.md#语音输入)将语音列为后续迭代。
- 目标代码/产出物：
  - [ ] 修改：在 `/Users/liyingliang.7/retniw` 的 [CaptureComposer](src/components/capture/capture-composer.tsx#CaptureComposer)增加语音回填入口。
  - [ ] 新增文件：在 `/Users/liyingliang.7/retniw` 新增 `app/api/transcriptions/route.ts` 和 `src/components/capture/voice-input-button.tsx`。
- 实现步骤：
  1. 重新确认转写供应商、音频限制和浏览器范围，在 `app/api/transcriptions/route.ts` 建立独立服务端转写入口。
  2. 由 `src/components/capture/voice-input-button.tsx` 调用转写入口，并在 [CaptureComposer](src/components/capture/capture-composer.tsx#CaptureComposer)只回填现有文字编辑区。
- 边界与不变约束：
  - [ ] 失败不清空已有文字；音频不写入应用数据库；不沿用首版 DeepSeek 文字接口承担转写。
- 前置依赖：M-002-T-001
- 完成定义：
  - [ ] 供应商、隐私边界和移动端体验通过后续迭代验收。
- 验证方式：
  - [ ] 入口：运行后续新增的转写接口测试和移动端浏览器验收；断言成功结果只回填文字，失败保留原文字段且音频不落库。
