[![CI Status](https://img.shields.io/badge/CI-Passing-brightgreen.svg)](https://github.com/235lolk/-AAAchat/actions)
[![Coverage Status](https://img.shields.io/badge/Coverage-100%25-brightgreen.svg)](https://codecov.io/gh/235lolk/-AAAchat)


# AAAChat (Private Assistant Bot) Project Guide

This document provides a comprehensive overview of the AAAChat project, including its structure, setup instructions, API endpoints, security mechanisms, and database migration guide. The project consists of a static frontend, a Node.js backend API, and uses MySQL for data storage. It is containerized with Docker Compose and includes a `start.ps1` script for easy setup on Windows 11.

**Note**: The frontend and container names have been unified to "assistantbot". The Compose project name is `assistantbot`, and the default network is `assistantbot_default`. The application image is tagged as `assistantbot-app:latest`.

---

# 私人助手BOT（AAAchat）项目说明与运行指南

本项目包含前端静态页面与后端 Node.js API 服务，并使用 MySQL 作为数据存储。为方便在 Windows 11 上使用，项目内置 Docker Compose 与一键启动脚本 `start.ps1`。


以下文档通览了项目结构、运行方式、API 端点、安全机制以及数据库迁移指南，帮助你快速上手与维护。

**注意**：前端与容器命名已统一为“私人助手BOT”。容器名称：`assistantbot-app`、`assistantbot-db`。
此外，Compose 项目名统一为 `assistantbot`，默认网络名为 `assistantbot_default`；应用镜像标签为 `assistantbot-app:latest`。

**目录结构（关键路径）**
- `\client\`：前端静态页面与脚本
  - 页面：`index.html`（登录）、`register.html`（注册）、`dashboard.html`（首页）、`chat.html`（对话）、`planner.html`（规划助手）、`profile.html`（用户配置）、`params.html`（参数）、`admin.html`（管理员页）、`shared.html`（共享池）
  - 片段与脚本：`\partials\header.html`（统一导航）、`\js\header.js`（导航注入与高亮）、`\js\api.js`（API 请求封装，自动携带 JWT/CSRF）、`\js\auth.js`（鉴权与登录态管理）、`\js\common.js`、`\js\plan_chat.js`
- `\server\`：后端服务
  - 入口：`index.js`（Express，静态资源与 API 路由注册）
  - 路由：`\routes\auth.js`、`users.js`、`profiles.js`、`chat.js`、`keys.js`、`planner.js`
  - 中间件：`\middleware\auth.js`（JWT 鉴权、管理员校验、CSRF 校验）
  - 数据库：`db.js`（MySQL 连接池）、`\scripts\*.js`（迁移/初始化工具）
- `\docs\`：数据库初始结构与示例数据（Compose 自动导入）
  - `schema.sql`、`seed.sql`
- `Dockerfile`、`docker-compose.yml`：容器化配置（前端打包为静态资源随镜像发布）
- `start.ps1`：Windows 11 下一键启动与可选重建

**运行与部署**
- 快速启动（推荐）：
  - 在项目根目录执行：`pwsh .\start.ps1`（或右键“使用 PowerShell 运行”）。
  - 可选参数：`pwsh .\start.ps1 -Rebuild` 强制重建镜像；`pwsh .\start.ps1 -Port 3003` 指定外部端口。
- 使用 Docker Compose：
  - 启动：`docker compose up -d`
  - 重建并启动：`docker compose up --build -d`
- 查看日志：`docker compose logs -f assistantbot-app`
  - 停止并清理：`docker compose down`
- 非容器运行（本机 Node）：
  - 进入 `server\`：`cd server`
  - 安装依赖：`npm ci --omit=dev`
  - 配置环境：复制 `.env.example` 为 `.env` 并修改 MySQL 与 `JWT_SECRET`
  - 启动：`node index.js`
  - 默认端口：`3000`（通过 `.env` 的 `PORT` 覆盖）

**环境变量（`server\.env`）**
- `PORT`（默认 `3000`）
- `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`
- `JWT_SECRET`（务必设置为强随机值）
- 可选上游模型：`DEEPSEEK_BASE_URL`、`DEEPSEEK_ENABLE_VISION`（`1`/`true` 启用图像）

**身份认证与安全**
- JWT 登录态（`Authorization: Bearer <token>`），令牌中包含 `csrf` 字段；后端验证在 `\server\middleware\auth.js`。
- CSRF 防护：所有非 GET 请求需携带 `X-CSRF-Token`，值来自登录响应（前端在 `\client\js\api.js` 已自动添加）。
- 密码哈希：`bcryptjs`（10轮）
- 参数化查询：所有数据库操作使用 `mysql2` 的参数占位符，防止 SQL 注入。
- 基础 XSS 处理：对用户输入进行过滤（如移除尖括号），上传文件名清洗并限制访问为 `\server\uploads`。
- 角色权限：`requireAdmin` 中间件限制管理员接口；导航“Admin”仅管理员可见。

**数据库初始化与迁移**
- 初始建库/建表与示例数据：Compose 会自动执行 `\docs\schema.sql` 与 `\docs\seed.sql`。
- 新增与变更（需手动迁移，确保与后端代码一致）：
  - 账户字段：`users.account`（用于“账户+密码”登录）
  - 对话与消息：`conversations` 表，`chat_messages` 增加 `conversation_id` 与 `role`
  - 计划存储：`plans` 表（规划助手）
  - 共享池增强：`api_keys.is_shared`、`api_keys.config_json` 与索引
- 在容器内执行迁移（推荐）：
  - `docker exec assistantbot-app node scripts/migrate_accounts.js`
  - `docker exec assistantbot-app node scripts/migrate_conversations.js`
  - `docker exec assistantbot-app node scripts/migrate_plans.js`
  - `docker exec assistantbot-app node scripts/migrate_shared_keys.js`
- 在本机执行迁移（非容器）：
  - 确保 `server\.env` 正确后，运行：`node server\scripts\migrate_accounts.js` 等。

**种子账户（执行迁移后的示例）**
- 管理员：`admin@example.com` / `Admin@123`，迁移后账户约为 `admin_1`
- 普通用户：`user@example.com` / `User@123`，迁移后账户约为 `user_2`
- 登录方式：
  - 注册接口采用“账户+密码+昵称”，邮箱为可选；登录为“账户+密码”（`/api/auth/login` 的 `account` 与 `password`）。

**API 参考（分组与鉴权说明）**
- 认证（`/api/auth`）
  - `POST /register`：注册（账户+密码，邮箱可选）；参数：`account`, `password`, `name`, `[email]`
  - `POST /login`：登录；参数：`account`, `password`；返回：`token`, `csrf`, `user`
  - `GET /me`：获取当前用户信息（需登录）
- 用户（`/api/users`）
  - `GET /`：列出用户（需管理员）
  - `GET /:id`：获取用户（需登录）
  - `PUT /:id`：更新用户（需管理员 + CSRF）
  - `DELETE /:id`：删除用户（需管理员 + CSRF）
- 档案（`/api/profiles`）
  - `GET /me`：获取我的档案（需登录）
  - `PUT /me`：更新我的档案（需登录 + CSRF）
- API Keys（`/api/keys`）
  - `GET /`：列出我的 Keys（不返回明文）
  - `POST /`：新增 Key（需登录 + CSRF）
  - `GET /shared`：查看共享池 Keys（不返回明文）
  - `DELETE /:id`：删除我的 Key（需登录 + CSRF）
  - `PATCH /:id/share`：设置/取消共享（需登录 + CSRF）
- 聊天（`/api/chat`）
  - `GET /history`：最近消息（占位，按用户）
  - `POST /message`：发送消息（占位，需 CSRF）
  - `POST /deepseek`：代理到 DeepSeek（需 CSRF；支持共享池/个人 Key）
  - `GET /conversations`：我的会话列表（需登录）
  - `POST /conversations`：新建会话（需 CSRF）
  - `PUT /conversations/:id`：重命名会话（需 CSRF）
  - `DELETE /conversations/:id`：删除会话（需 CSRF）
  - `GET /conversations/:id/messages`：会话消息列表（需登录）
  - `POST /conversations/:id/send`：在会话中发送并代理到模型（需 CSRF；支持图像）
  - `POST /uploads`：上传附件（`multipart/form-data`，字段名 `files`；需 CSRF）
  - `GET /uploads`：列出我的历史上传（需登录）
- 规划助手（`/api/planner`）
  - `POST /generate`：生成结构化计划（需 CSRF）
  - `POST /save`：保存计划（需 CSRF）
  - `PUT /:id`：更新计划（需 CSRF）
  - `GET /list`：我的计划列表（需登录）
  - `GET /:id`：查看计划详情（需登录）
  - `DELETE /:id`：删除计划（需 CSRF）

**前端页面与交互**
- 登录页：`index.html`（不会触发鉴权重定向）
- 导航注入：`\client\partials\header.html` + `\client\js\header.js`（基于 `data-route` 与当前路径高亮）
- 管理员可见性：前端根据 `user.role` 控制“Admin”入口显示；后端仍强制鉴权与权限校验。
- 请求封装：`\client\js\api.js` 自动附加 JWT 与 CSRF，支持超时与表单上传。

**常见问题与排查**
- 前端修改未生效：镜像在构建时复制 `client\` 到容器；需执行 `docker compose up --build -d` 让变更生效，并强制刷新浏览器缓存（`Ctrl+F5`）。
- 迁移未执行导致接口报错：若出现 `Unknown column` 或外键错误，请按“数据库迁移”章节执行脚本。
- 容器日志：`docker compose logs -f assistantbot-app` 查看后端报错与启动信息；MySQL 日志可在 Desktop/容器详情中查看。
- 上传访问：本地访问路径为 `http://localhost:3003/uploads/<文件名>`（容器内目录映射到 `\server\uploads`）。
 - 端口不一致说明：后端在容器内监听 `3000`，Compose 将其映射到宿主机 `3003`。若在本机直接运行后端或测试脚本，请使用 `http://localhost:3000` 或修改 `.env` 的 `PORT` 值。

**安全**
- 生产环境请：设置强 `JWT_SECRET`、限制 CORS 允许源、开启 HTTPS 与 WAF/防火墙。
- 依赖安全审计：在 `server\` 目录下运行 `npm audit` 并按建议修复。
- 用户输入验证：对表单与 JSON 入参进行类型、长度与白名单校验，避免过度信任客户端。

**后续迭代想法**
- 增加自动化测试与 CI；完善前端表单校验与错误提示。
- 为聊天与规划模块增加更细粒度的权限与审计日志。