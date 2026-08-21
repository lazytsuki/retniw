# retniw M-007上线checkList

| 检查项 | checkList | 检查结果（默认未选中，可勾选） | 检查人 |
|---|---|---|---|
| 上线顺序 | 1. 单一Next.js应用，前端页面、Route Handler和文档同一次发布<br>2. Vercel Production Branch与GitHub默认分支均为`claude/kind-sagan-fKUhX`<br>3. 提交并推送后等待Vercel构建完成，再验证正式域名<br>4. 本轮无JSF或MQ消费 | - [ ] 本地74个测试、类型检查、Lint和生产构建已重新通过<br>- [ ] 代码审查无阻塞问题<br>- [ ] 变更已提交到`claude/kind-sagan-fKUhX`<br>- [ ] GitHub提交SHA与Vercel生产部署SHA一致 | xxx |
| 数据库变更 | 本轮不涉及DDL、数据迁移、索引或初始化；存量AI正文不改写，只在显示与后续保存时清理旧前缀 | - [ ] 已确认本轮无数据库变更<br>- [ ] 已确认无需数据初始化 | xxx |
| jimDb变更 | 不涉及jimDb | - [ ] 已确认不涉及jimDb配置 | xxx |
| ES变更 | 不涉及ES | - [ ] 已确认不涉及ES索引或配置 | xxx |
| MQ | 不涉及MQ | - [ ] 已确认不涉及MQ配置或Topic | xxx |
| DUCC | 不涉及DUCC | - [ ] 已确认不涉及DUCC配置 | xxx |
| jdos应用配置修改 | 不涉及jdos；继续使用现有Vercel生产环境变量，不新增密钥或配置项 | - [ ] 已确认现有Vercel环境变量未被变更<br>- [ ] 已确认无新增生产配置 | xxx |
| 上下游通知 | 无外部上下游系统；发布对象为retniw内测用户 | - [ ] 已记录本轮交互变化与真实用户验证项<br>- [ ] 如需通知内测用户，使用正式域名`https://retniw.cn` | xxx |
| color | 不涉及color接口 | - [ ] 已确认不涉及接口创建或授权 | xxx |
| 生产域名验证 | 验证`retniw.cn`登录后主链路，以及`retniw.vercel.app`到新域名的永久跳转 | - [ ] `https://retniw.cn`可直接打开并登录<br>- [ ] 完成“写下→接着想→另起→从以前的想法回来”<br>- [ ] 空白页无AI入口，已有内容后只有一个“帮我接着想”主入口<br>- [ ] 手机与桌面无横向溢出，移动导航不遮住输入<br>- [ ] `retniw.vercel.app`返回永久跳转且落到`retniw.cn` | xxx |
| 回滚 | 代码与文档为单一Git提交；若生产主链路失败，回滚至上一生产提交`7535c5c` | - [ ] 已记录发布前SHA与发布后SHA<br>- [ ] 已确认Vercel可回滚到`7535c5c`<br>- [ ] 回滚后重新验证登录、保存和旧域名跳转 | xxx |
