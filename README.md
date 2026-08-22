# retniw

retniw 是一处写想法的地方。打开就写，之后可以接着写，也可以从以前的想法回来。内容可以从别处进入，也可以完整带走。

## 第二版

- 打开首页直接写；Enter 保存，Shift + Enter 换行。
- “写新想法”和“以前的想法”是两个导航动作；当前想法留在正文里继续，不再伪装成第三个按钮。
- 可以在同一个过程中连续追加，不会被强制拆成独立对话。
- 保存后内容立即留在当前页面，后台同步不会触发整页刷新。
- AI 默认不回应。需要时可点“帮我接着想”；整理收进更多操作，找联系放在以前的想法区域。
- 可以粘贴外部文字，或导入 `.md`、`.txt`；`.md` 按 Markdown 显示，其他原文按纯文本保留。
- 可以复制单段、导出一个想法的 Markdown，或导出全部内容和已确认关系的 JSON。
- 手机和 Mac 使用同一份内容；本机保存未提交草稿和失败重试项。
- 关系发现只在用户主动选择时运行，只连接用户写下或导入的内容，不把 AI 产出当成用户想法。

用户的写作和思考是主体。AI 只在用户主动需要继续、整理或找旧想法的联系时介入，历史 AI 输出不会被当作用户事实继续扩写。

早期 React、Vite、Supabase 匿名直连、Groq 和单碎片流程只作历史参考，不是当前产品约束。语音转写留到后续迭代。

## 本地启动

1. 安装依赖并准备本地配置：

```bash
npm install
cp .env.example .env.local
```

2. 在 `.env.local` 配置以下变量：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
```

业务表使用 [TECH-DESIGN.md](TECH-DESIGN.md) 中的 DDL；Supabase Auth 需允许邮箱密码注册。本地配置关闭邮箱确认，注册成功后直接进入。

3. 启动开发服务器：

```bash
npm run dev
```

在当前 Mac 上，`npm run dev` 和 `npm start` 会自动从钥匙串项目 `retniw-deepseek-api-key` 读取 DeepSeek 密钥；部署环境仍通过 `DEEPSEEK_API_KEY` 注入。无需把密钥写进源码。

浏览器打开 [http://localhost:3000](http://localhost:3000)。本地服务停止后需要重新执行 `npm run dev`；部署到线上后不需要本机保持运行。

不要将 `.env.local` 或任何凭据提交到仓库。

## 咖喱狗

咖喱狗是 retniw 的固定品牌形象。不同动作和场景可以变化，但始终保留贴着头顶横向垂落的整片软耳、扁宽脸、低垂椭圆眼、向中间收的忧虑眉、点鼻子和偏一侧短嘴。它的基本神态是安静地琢磨，不画成普通笑脸萌宠。

## 小范围内测

内测地址：[https://retniw.cn](https://retniw.cn)。旧地址 [https://retniw.vercel.app](https://retniw.vercel.app) 已永久跳转到新域名。线上版本不依赖本机运行，推送当前 GitHub 默认分支后会自动部署。

每位体验者使用独立账号，不共享内容和登录凭据。打开正式地址后，可在登录页选择“创建账号”，使用邮箱和自己设置的密码直接进入，无需邀请码或项目所有者代建账号。公开的是注册入口，不是内容；想法、合集、关系和导出仍仅本人可访问。

生产 Supabase 需要保持`Allow new users`开启、`Confirm email`关闭。当前注册不依赖确认邮件；如果以后需要邮箱验证或密码找回，先配置可靠的生产SMTP，再开启对应链路。

内测内容不得包含工作机密或其他不应交给 Supabase、Vercel、DeepSeek 处理的信息。

当前不增加邀请后台、邀请码或邮件链接登录。只有主动选择“帮我接着想”、整理或找联系时，当前必要内容才会交给 DeepSeek 处理。

## 验证

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```
