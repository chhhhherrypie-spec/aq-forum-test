# Cloudflare 部署检查清单（给项目 owner）

这个文档是给项目拥有者看的，目的是让他知道：这个项目在本地已经能跑了，下一步要怎么上 Cloudflare，并且什么必须自己在账户里配置。

## 1）先确认目标

这份项目是按 Cloudflare 架构来写的，所以最稳的方案是继续用 Cloudflare。

需要确认：

- 你有自己的 Cloudflare 账号
- 你愿意继续使用 D1 + R2
- 你愿意自己管理项目环境变量和数据库

如果你不想维护 Cloudflare，那么就需要重新设计后端和数据库方案；这不是小改动。

## 2）你需要在 Cloudflare 里创建什么

至少需要这些东西：

- 一个 Cloudflare Worker 项目
- 一个 D1 数据库
- 一个 R2 bucket
- 生产环境变量

### 必填环境变量

至少要设置：

```env
ADMIN_SETUP_TOKEN=你的生产 token
ADMIN_EMAIL=你的管理员邮箱
```

另外，系统里也依赖 D1/R2 的绑定名称：

- `DB`
- `FILES`

如果绑定名不对，项目会读不到数据库或文件存储。

## 3）本地代码里对应的配置

你本地项目当前用的是：

- [wrangler.local.json](../wrangler.local.json)
- [.env](../.env)
- [.dev.vars](../.dev.vars)

这个项目的后端读取了：

- `ADMIN_SETUP_TOKEN`
- `ADMIN_EMAIL`
- `DB`
- `FILES`

所以正式部署时，必须在 Cloudflare 里建立对应的真实资源，并绑定相同的名字。

## 4）数据库初始化

本地已经验证过可以用 SQL migration 建表，正式部署前也需要在真实 D1 中执行同样的迁移。

顺序大致是：

```bash
wrangler d1 execute DB --file drizzle/0000_watery_blockbuster.sql
wrangler d1 execute DB --file drizzle/0001_business_guards.sql
wrangler d1 execute DB --local --config wrangler.local.json --file drizzle/0000_watery_blockbuster.sql
```

注意：

- 本地和生产要分开，不要混在同一个 DB 里
- 不要在正式数据库里直接跑不熟悉的测试数据
- 先跑结构初始化，再做产品验证

## 5）部署步骤

在项目根目录里：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm exec wrangler deploy
```

如果项目是按 Cloudflare Worker 配置来运行，部署要在你自己的 Cloudflare 账户下完成。

## 6）第一次进入后台

部署成功后，不能直接登录。要先创建第一个管理员：

```text
https://你的域名/setup#key=ADMIN_SETUP_TOKEN
```

在页面中填写：

- 用户名
- 电子邮箱
- 密码
- 确认密码
- 生成的 setup token

这里的邮箱必须和生产环境里的 `ADMIN_EMAIL` 匹配。

创建成功后，再登录：

```text
https://你的域名/login
```

然后管理员入口在：

```text
https://你的域名/admin
```

## 7）上生产时要检查什么

部署后至少检查下面这些：

- 主页能否打开
- 登录页能否打开
- `/setup` 能否创建管理员
- `/login` 能否正常登录
- `/admin` 是否能访问
- 发帖、评论、积分是否工作
- 图片/视频上传是否能写入 R2
- 数据库是否能读写

## 8）注意事项

- 不要把 `.env`、`.dev.vars` 提交到 GitHub
- 不要把生产 token 或管理员邮箱放进仓库
- 不要混用本地数据库和生产数据库
- 不要在没有确定目标的情况下切换到其他技术栈

## 9）最终结论

这个项目已经完成了本地可运行验证，下一步最重要的不是重写代码，而是：

- 由项目 owner 自己在 Cloudflare 创建真实资源
- 配置最终环境变量
- 运行正式部署
- 通过 `/setup` 创建管理员

这是现在最合理、最稳妥的下一步。

## 10）给项目 owner 的一句话总结

“本地环境已经能跑了，接下来需要你自己在 Cloudflare 创建真实 D1 和 R2，并把生产环境变量配置好，然后用 setup 流程创建管理员，最后上线验证。”
