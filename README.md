# retniw

先记下来，慢慢表达，之后回来时看见联系。

[在线体验](https://retniw.cn)

retniw 是一处写想法的地方。一个念头可以只留一句，也可以在同一个想法里继续长出来。内容可以从别处进入，也可以完整带走。

这是 retniw 当前线上版本的源码和产品文档。

## 从记录到回看

1. **记下来**：打开就写，不需要先选分类，也不需要先和 AI 对话。
2. **慢慢表达**：在同一个想法里继续写；想告一段落时可以“先到这里”，以后再回来。
3. **看见联系**：想法积累后，可以开启“回看”。retniw 会找出有原文依据的联系候选，是否保留由用户决定。

以前的想法可以移入单层合集、归档或删除。归档只把内容移出常用列表；删除会永久移除想法及相关联系。

## AI 如何参与

用户的写作和思考始终是主体，AI 默认不回应。

- 只有主动选择“帮我接着想”或“整理”时，AI 才读取当前想法中的用户原文和导入内容。
- 跨想法“回看”默认关闭。明确开启后，新内容保存完成才会在后台寻找候选联系，不阻塞记录。
- AI 输出不会被当成用户原文，也不会自动改写内容或替用户保留联系。

只有使用当前想法 AI，或开启跨想法回看后，必要内容才会交给 DeepSeek 处理。不要写入工作机密或其他不应交给 Supabase、Vercel、DeepSeek 处理的信息。

## 内容可以进，也可以走

- 支持直接粘贴文字，或导入 `.md`、`.txt` 文件。
- 支持复制单段、导出一个想法的 Markdown，以及导出全部内容和已确认关系的 JSON。
- 手机和桌面端使用同一份内容；账号之间的想法、合集、关系和导出互不公开。

## 当前状态

retniw 正在持续内测，注册入口已开放。体验者可以在 [retniw.cn](https://retniw.cn) 自行创建账号，不需要邀请码或项目所有者代建账号。

## 技术栈

- Next.js 16、React 19、TypeScript
- Supabase Auth、Postgres
- DeepSeek
- Vercel

## 本地开发

需要 Node.js 20.9 或更高版本，以及一个已经具备当前业务表结构的 Supabase 项目。

```bash
npm install
cp .env.example .env.local
```

在 `.env.local` 配置：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
```

`SUPABASE_SERVICE_ROLE_KEY` 和 `DEEPSEEK_API_KEY` 只能留在服务端环境，不能提交到仓库，也不能暴露给浏览器。

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

> 当前仓库还不是一键自托管发行包：现有 `supabase/migrations` 只包含增量变更，缺少从空项目重建基础业务表的完整迁移。根目录的 `supabase-schema.sql` 属于早期原型，不能用于初始化当前版本。数据库契约以 [TECH-DESIGN.md](TECH-DESIGN.md) 和现有迁移为准。

## 验证

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## 项目文档

- [REQUIREMENT-ANALYSIS.md](REQUIREMENT-ANALYSIS.md)：问题背景与产品判断
- [PRD.md](PRD.md)：当前产品契约与核心流程
- [TECH-DESIGN.md](TECH-DESIGN.md)：实现、数据与安全边界
- [WORKFLOW-STATE.md](WORKFLOW-STATE.md)：当前交付状态与验证记录

## 参与项目

发现问题或有新的使用反馈，可以提交 [Issue](https://github.com/lazytsuki/retniw/issues)。涉及产品路径的建议，请同时说明真实使用场景和遇到的断点，方便判断它是否符合 retniw 的核心链路。

## 许可证

仓库尚未添加 `LICENSE`，开源授权范围仍待明确。
