# retniw 第二版上线检查清单

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 上线顺序 | 1. 先在 Supabase 执行幂等迁移<br>2. 在 Vercel 配置环境变量<br>3. 部署单一 Next.js 应用<br>4. 重跑登录、记录、AI、关系、导入导出和离线主链路<br>5. 无 JSF、MQ 或其他应用依赖 | - [x] Supabase 迁移已执行两次并确认幂等<br>- [x] Vercel 生产环境变量已配置<br>- [x] Next.js 应用已部署<br>- [x] 生产主链路已回归<br>- [x] 无严重遗留问题 | Codex |
| 数据库变更 | 执行 `supabase/migrations` 中的 thoughts、entries、thought_connections 建表、索引、约束、RLS 与旧数据非破坏迁移；旧表保留 | - [x] 数据库变更已操作<br>- [x] 数据初始化与旧数据迁移已校验<br>- [x] RLS 和跨账号隔离已验证<br>- [x] 旧表无新写入 | Codex |
| jimDb变更 | 不涉及 | - [x] 已确认不涉及 jimDb | Codex |
| ES变更 | 不涉及 | - [x] 已确认不涉及 ES | Codex |
| MQ | 不涉及 | - [x] 已确认不涉及 MQ | Codex |
| DUCC | 不涉及 | - [x] 已确认不涉及 DUCC | Codex |
| jdos应用配置修改 | 不涉及 JDOS。Vercel 需配置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` | - [x] 生产环境变量已注入<br>- [x] 构建日志不含密钥<br>- [x] 浏览器网络请求不含服务角色或 DeepSeek 密钥 | Codex |
| 上下游通知 | 个人自驱项目，无外部业务方或依赖团队 | - [x] 已确认无需外部通知 | Codex |
| color | 不涉及 | - [x] 已确认不涉及 color 接口 | Codex |
| 登录与数据 | Supabase 关闭公开注册；所有者和受邀体验者使用独立账号，Cookie、RLS、服务端归属过滤同时生效 | - [x] 公开注册已关闭<br>- [ ] 首轮体验者账号已创建<br>- [x] 未登录访问会转到登录页<br>- [x] 不同账号无法互相读写内容<br>- [x] 退出后会话失效 | Codex |
| 回滚 | 应用回滚到上一个 Vercel 部署；新表和旧表暂不删除，避免回滚造成数据丢失 | - [ ] 上一个可用部署可一键恢复<br>- [ ] 回滚时不执行破坏性数据库操作<br>- [ ] 回滚后登录和原有内容可读 | xxx |
