# retniw

retniw 用来记录和整理自己的想法。可以先写一句，以后再接着写；想法多了，也能回头看看它们之间有没有联系。

[打开 retniw](https://retniw.cn)

## 怎么用

1. 打开就写，不用先分类，也不用先和 AI 对话。
2. 同一个想法可以接着写。暂时不想写了，可以点“先到这里”，以后再回来。
3. 想法多了以后，可以开启“回看”。retniw 会找出可能相关的旧想法，由你决定是否保留这条联系。

以前的想法可以移入合集，也可以归档或删除。归档后不再出现在常用列表；删除后无法恢复，相关联系也会一起删除。

## AI

平时记录不会自动调用 AI。

- 点“帮我接着想”或“整理”时，AI 只读取当前想法里你写入或导入的内容。
- “回看”默认关闭。开启后，retniw 会在新内容保存后寻找相关的旧想法。
- AI 生成的内容不会算作你的原文，也不会自动改写内容或保留联系。

使用这些功能时，相关文字会发送给 DeepSeek。不要写入工作机密或其他不应交给 Supabase、Vercel、DeepSeek 处理的信息。

## 导入和导出

- 可以粘贴文字，也可以导入 `.md`、`.txt` 文件。
- 可以复制单段、把一个想法导出为 Markdown，或者把全部内容和已确认的关系导出为 JSON。
- 同一账号可以在手机和桌面端使用；每个账号只能看到自己的内容。

## 当前状态

retniw 还在内测，注册已经开放。打开 [retniw.cn](https://retniw.cn) 可以直接创建账号，不需要邀请码。

## 技术栈

- Next.js 16、React 19、TypeScript
- Supabase Auth、Postgres
- DeepSeek
- Vercel

## 本地开发

需要 Node.js 20.9 或更高版本，以及一个已经创建 retniw 所需数据表的 Supabase 项目。

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

> 目前还不能从空的 Supabase 项目直接启动。`supabase/migrations` 只包含增量变更；根目录的 `supabase-schema.sql` 是早期原型，也不能用于初始化当前版本。现有表结构见 [TECH-DESIGN.md](TECH-DESIGN.md) 和 `supabase/migrations`。

## 验证

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## 项目文档

- [REQUIREMENT-ANALYSIS.md](REQUIREMENT-ANALYSIS.md)：为什么做
- [PRD.md](PRD.md)：当前功能和流程
- [TECH-DESIGN.md](TECH-DESIGN.md)：实现和数据结构
- [WORKFLOW-STATE.md](WORKFLOW-STATE.md)：开发与验证记录

## 参与项目

发现问题或有建议，可以提交 [Issue](https://github.com/lazytsuki/retniw/issues)。如果是功能建议，请说一下你当时在做什么、哪里不好用。

## 许可证

本项目使用 MIT 许可证，见 [LICENSE](LICENSE)。可以个人或商业使用、修改和分发；保留版权和许可声明即可。软件按现状提供，不附带担保。
