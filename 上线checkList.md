# retniw 第二版上线检查清单

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 上线顺序 | 1. 先在 Supabase 执行幂等迁移<br>2. 在 Vercel 配置环境变量<br>3. 部署单一 Next.js 应用<br>4. 重跑登录、记录、AI、关系、导入导出和离线主链路<br>5. 无 JSF、MQ 或其他应用依赖 | - [ ] Supabase 迁移已执行两次并确认幂等<br>- [ ] Vercel 生产环境变量已配置<br>- [ ] Next.js 应用已部署<br>- [ ] 生产主链路已回归<br>- [ ] 无严重遗留问题 | xxx |
| 数据库变更 | 执行 `supabase/migrations` 中的 thoughts、entries、thought_connections 建表、索引、约束、RLS 与旧数据非破坏迁移；旧表保留 | - [ ] 数据库变更已操作<br>- [ ] 数初始化与旧数据迁移已校验<br>- [ ] RLS 和跨账号隔离已验证<br>- [ ] 旧表无新写入 | xxx |
| jimDb变更 | 不涉及 | - [ ] 已确认不涉及 jimDb | xxx |
| ES变更 | 不涉及 | - [ ] 已确认不涉及 ES | xxx |
| MQ | 不涉及 | - [ ] 已确认不涉及 MQ | xxx |
| DUCC | 不涉及 | - [ ] 已确认不涉及 DUCC | xxx |
| jdos应用配置修改 | 不涉及 JDOS。Vercel 需配置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` | - [ ] 生产环境变量已注入<br>- [ ] 构建日志不含密钥<br>- [ ] 浏览器网络请求不含服务角色或 DeepSeek 密钥 | xxx |
| 上下游通知 | 个人自驱项目，无外部业务方或依赖团队 | - [ ] 已确认无需外部通知 | xxx |
| color | 不涉及 | - [ ] 已确认不涉及 color 接口 | xxx |
| 登录与数据 | Supabase 关闭公开注册；所有者和受邀体验者使用独立账号，Cookie、RLS、服务端归属过滤同时生效 | - [ ] 公开注册已关闭<br>- [ ] 每位体验者使用独立账号，不共享密码或内容<br>- [ ] 未登录访问会转到登录页<br>- [ ] 不同账号无法互相读写内容<br>- [ ] 退出后会话失效 | xxx |
| 回滚 | 应用回滚到上一个 Vercel 部署；新表和旧表暂不删除，避免回滚造成数据丢失 | - [ ] 上一个可用部署可一键恢复<br>- [ ] 回滚时不执行破坏性数据库操作<br>- [ ] 回滚后登录和原有内容可读 | xxx |
