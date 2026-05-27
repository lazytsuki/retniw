# 语音笔记 (Voice Notes)

浏览器录音 → Groq Whisper 转文字 → Supabase 存储 → 浏览管理

## 本地运行

### 1. 克隆项目

```bash
git clone https://github.com/lazytsuki/cc_lazytsuki.git
cd cc_lazytsuki
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 key：

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://你的项目ID.supabase.co
VITE_SUPABASE_ANON_KEY=你的Supabase Publishable Key
GROQ_API_KEY=你的Groq API Key
```

### 3. 创建数据库表

在 Supabase 控制台 → SQL Editor 中运行 `supabase-schema.sql` 的内容。

### 4. 启动

```bash
npm run dev
```

打开 http://localhost:5173 即可使用。

## 使用方法

1. 点击红色录音按钮开始录音
2. 再次点击停止录音
3. 自动转录并保存
4. 在下方列表查看历史笔记

## 技术栈

React + Vite + TypeScript + Tailwind CSS + Supabase + Groq Whisper API
