# 同好交流论坛 · 完整源码交付

整理日期：2026-09-13。

这个文件夹就是网站的完整源码，可以上传到你自己的 GitHub 仓库。页面、后台功能、数据库结构和测试代码均已包含。

## 先了解当前状态

- 这份代码是当前论坛的源码，业务代码未因本次整理而改变。
- 使用 Cloudflare D1 保存账号、帖子、评论和积分，使用私有 R2 保存图片和视频。尚未改成 Supabase。
- 此前本地 107 项功能与安全检查通过，详见 `ACCEPTANCE.md`；这不是线上验收结果。
- 上次上线在云端数据库初始化阶段失败，尚未成功发布。上传 GitHub 是保存和管理代码，上线还需要另外完成部署。

## 包里有什么

| 文件或文件夹 | 用途 |
| --- | --- |
| `app/`、`components/`、`hooks/` | 页面、界面组件、手机适配 |
| `lib/server.ts`、`middleware.ts` | 注册登录、答题、积分、发帖评论、管理员及权限校验 |
| `lib/media-validation.ts` | 图片和视频文件校验 |
| `db/`、`drizzle/` | 数据库结构、全部四次建表与规则迁移及元数据 |
| `public/` | 网站静态资源 |
| `tests/` | 核心业务、安全和媒体验收脚本 |
| `package.json`、`pnpm-lock.yaml` | 依赖版本及运行命令 |
| `.env.example`、`.gitignore` | 配置填写模板、避免误上传本地文件的规则 |
| `.openai/hosting.json`、`vite.config.ts` | 原有托管和本地开发配置 |
| `README.md`、`docs/本地运行与部署.md` | 功能说明、运行与交接步骤 |
| `SOURCE_MANIFEST.json` | 原始源码文件清单和校验值 |
| `SHA256SUMS.txt` | 本交付包内文件的校验值 |

没有打包真实环境密钥、本地数据库、用户上传文件、测试结果、`node_modules`、构建产物或旧 Git 历史。这些不是缺失的源码；依赖和构建文件可以按说明重新生成。

## 上传到 GitHub：推荐用 GitHub Desktop

建议创建 **Private（私有）仓库**：论坛的默认准入题和答案存在服务端源码及测试中，私有仓库可以限制谁能看到这些代码。

1. 下载压缩包并解压，得到 `aq-forum` 文件夹。
2. 打开 GitHub Desktop，登录你自己的 GitHub 账号。
3. 选择 **File → Add Local Repository**，选择解压出来的 `aq-forum` 文件夹。
4. 因为交付包不含旧 Git 历史，可能提示该目录不是 Git 仓库。点击 **create a repository here**，在这个已有文件夹创建仓库。不要额外生成 README、许可证或替换已有 `.gitignore`。
5. 确认仓库根目录直接能看到 `package.json`、`app/` 和 `lib/`，避免把源码又嵌套一层。
6. 如有尚未提交的文件，在左下角填写“上传论坛完整源码”，点击 **Commit**。
7. 点击 **Publish repository**，填写仓库名，例如 `aq-forum`，保留 **Keep this code private**，再点击发布。
8. 打开 GitHub 仓库页面，确认 `package.json`、`pnpm-lock.yaml`、`app/`、`lib/`、`drizzle/` 和 `.openai/hosting.json` 都能看到。

步骤参考：[GitHub 官方上传说明](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop)。

请上传解压后的文件内容。只把 ZIP 文件传到仓库里，会让后续开发和部署不方便。

## 熟悉命令行时也可以这样上传

先在 GitHub 创建一个空的私有仓库，创建时不要自动添加 README、`.gitignore` 或许可证。然后在解压后的 `aq-forum` 文件夹打开终端：

```sh
git init -b main
git add .
git commit -m "Upload complete forum source"
git remote add origin https://github.com/YOUR_GITHUB_USER/YOUR_REPOSITORY.git
git push -u origin main
```

将上面的 GitHub 用户名和仓库名替换为你实际创建的仓库；登录按 GitHub 提示完成。

## 上传后下一步

需要让网站上线时，按照 `docs/本地运行与部署.md` 确定托管和数据库方案。该论坛有真实后台，不能只作为静态网页上传到 GitHub Pages 来运行全部功能。

如果决定换成 Supabase，需要改造数据库相关代码并重新验收；本交付包没有假装已经完成这一步。

## 先让自己能进入后台：最短路径

要进入论坛并看里面的内容，首先得创建第一个管理员账号。代码里要求先设置两个环境变量：

- `ADMIN_SETUP_TOKEN`
- `ADMIN_EMAIL`

参考 [.env.example](.env.example) 里的内容。可以直接在项目根目录生成一个 `.env` 文件，内容示例：

```bash
ADMIN_SETUP_TOKEN=replace-with-random-token
ADMIN_EMAIL=admin@example.invalid
```

生成一个随机 token 的最简单方式：

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

或者：

```bash
openssl rand -hex 32
```

把它填进 `ADMIN_SETUP_TOKEN`。然后启动本地项目：

```bash
pnpm install
pnpm dev
```

访问：

```text
http://localhost:3000/setup#key=YOUR_TOKEN
```

在这里填写用户名、邮箱、密码，即可创建首个管理员账号。后台代码会检查：

- token 是否匹配
- email 是否匹配
- 是否尚未初始化过管理员

如果这些都成立，就会创建管理员账户并允许你进 `/admin` 和论坛内容区。

## 当前离“真正能用的 app”还差什么

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 管理员首次初始化 | 还需要手动设置 | 必须先生成 `ADMIN_SETUP_TOKEN` 和 `ADMIN_EMAIL`，再访问 `/setup#key=...` |
| 本地 D1 表结构 | 还需要初始化 | 需要按顺序执行 Drizzle SQL 迁移，创建 `users`、`quiz_questions` 等表 |
| 本地环境绑定 | 还需要配置 | 需要 `.env`、`.dev.vars` 和 `.openai/hosting.json` 绑定 D1/R2 |
| 路由与别名 | 已修复 | 入口文件和 `@/` 别名已对齐，避免 500 和模块找不到 |
| 业务功能 | 基本已实现 | 论坛、登录、发帖、评论、积分、管理后台等逻辑已写好 |
| 生产部署 | 还未完成 | 还缺真实部署、线上环境变量、域名和云端数据库配置 |

一句话总结：代码层面已经很接近“可运行的论坛”，但还没有完成“在新环境里可直接启动并上线”的最后一层准备。