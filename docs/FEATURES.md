# AAAchat 功能实现与对应文件（更新版）

本文档汇总当前项目已实现的核心功能，并标注每个功能由哪些文件实现，便于维护与审查。

## 1. 基础服务与项目结构
- 静态资源与 API 路由挂载：`server/index.js`
- 数据库连接池（MySQL）：`server/db.js`
- 前端页面与脚本：`client/` 目录（`index.html`, `dashboard.html`, `profile.html`, `admin.html`, `js/*`）
- 环境变量示例与加载：`server/.env`, `server/.env.example`（通过 `dotenv` 加载）

## 2. 身份认证与会话
- 用户注册与登录（密码散列、JWT 发放）：`server/routes/auth.js`
- 认证中间件（校验 JWT）：`server/middleware/auth.js` 中 `authenticate`
- 管理员权限中间件：`server/middleware/auth.js` 中 `requireAdmin`
- 前端认证辅助：
  - 读取当前用户信息：`client/js/auth.js` 中 `ensureAuth`
  - 管理员访问保护：`client/js/auth.js` 中 `ensureAdmin`
  - 通用请求封装与令牌管理：`client/js/api.js`
  - 登出逻辑：`client/js/common.js`
 - 注册字段与交互：注册采用“账户+密码+昵称”，邮箱为可选；页面 `client/register.html` 已校验账户格式并按 `{account, password, name, [email]}` 提交。

## 3. 管理员账户与前端权限可见性
 - 管理员账户创建脚本：`server/scripts/createAdmin.js`（支持配置账户、密码、邮箱与昵称；默认账户 `Admin0126`、密码 `Gty@0126`、邮箱 `admin@example.com`，可按脚本顶部常量修改）。
  - 前端页面的权限可见性控制：
    - 隐藏非特定管理员的 Admin 链接：`client/dashboard.html` 与 `client/profile.html`
    - 管理面板访问保护：`client/admin.html`（基于 `ensureAdmin`）

## 4. CSRF 防护
- 登录发放 CSRF Token（随机 16 字节十六进制字符串），随 JWT 返回：`server/routes/auth.js`
- CSRF 校验中间件（比较 `X-CSRF-Token` 与 JWT `csrf` 字段）：`server/middleware/auth.js` 中 `requireCsrf`
- 在写操作路由启用 CSRF 校验：
  - 更新个人资料：`server/routes/profiles.js`（`PUT /profiles/me`）
  - 管理用户：`server/routes/users.js`（`PUT/DELETE /users/:id`）
  - 发送聊天消息与上传：`server/routes/chat.js`（`POST /chat/...`）
- 前端携带 CSRF Token：
  - 登录后保存 CSRF：`client/index.html`（脚本内 `setCsrfToken`）
  - 非 GET 请求自动附带 `X-CSRF-Token` 头：`client/js/api.js`
  - 登出时清理 CSRF Token：`client/js/common.js`

## 5. 密码安全
- 注册时密码散列：`server/routes/auth.js`（`bcrypt.hashSync(password, 10)`）
- 登录时密码校验：`server/routes/auth.js`（`bcrypt.compareSync(password, user.password_hash)`）

## 6. SQL 注入防护
- 统一采用参数化查询（`?` 占位符）：
  - 用户路由：`server/routes/users.js`
  - 资料路由：`server/routes/profiles.js`
  - 聊天路由：`server/routes/chat.js`
  - 认证路由：`server/routes/auth.js`

## 7. XSS 风险缓解
- 服务端基础过滤（移除尖括号，避免存储型 XSS）：
  - 个人资料：`server/routes/profiles.js`（过滤 `bio`, `avatar_url`）
  - 用户信息：`server/routes/users.js`（过滤 `name`）
  - 聊天消息：`server/routes/chat.js`（过滤 `content`）
- 前端安全渲染（避免直接 `innerHTML` 插入用户数据）：
  - 管理面板：`client/admin.html`（使用 `textContent` 与安全 DOM API 构建表格）

## 8. 页面与交互
- 登录页：`client/index.html`（提交登录、保存 JWT 与 CSRF、跳转）
- 首页：`client/dashboard.html`（认证后进入，非特定管理员隐藏 Admin）
- 个人资料页：`client/profile.html`（加载与保存资料、头像与简介预览、非特定管理员隐藏 Admin）
- 管理页：`client/admin.html`（列表加载、设置角色、删除用户，写操作携带 CSRF）
- 规划助手页：`client/planner.html`（生成/保存/查看计划的交互）；后端路由：`server/routes/planner.js`（`/api/planner/*`）。

## 8.1 规划助手：目标与能力
- 目标：将用户的模糊目标转化为“按天、可执行”的结构化计划，支持保存、查看、更新与删除，并支持私有/公开可见性。
- 能力：
  - 生成计划（调用上游模型）：`POST /api/planner/generate`，参数支持 `goal`（目标）、`constraints`（约束，可选）、`deadline`（截止日期，可选）、`days` 或 `stepsCount`（粒度建议）。
  - 保存计划：`POST /api/planner/save`，入库到 `plans` 表，包含 `goal`、`constraints`、`steps_count`、`deadline`、`plan_json`（严格 JSON）、`visibility`（`private`/`public`）。
  - 更新计划：`PUT /api/planner/:id`（仅本人或管理员），允许修改概要与 `plan_json` 中的步骤。
  - 我的计划列表：`GET /api/planner/list`（仅返回概要信息）。
  - 查看计划详情：`GET /api/planner/:id`（仅本人或管理员）。
  - 删除计划：`DELETE /api/planner/:id`（仅本人或管理员）。
- 数据模型：`docs/schema.sql` 中表 `plans`，字段包含 `user_id`（外键）、`goal`、`constraints`、`steps_count`、`deadline`、`plan_json`、`visibility`、`created_at`、`updated_at`；索引 `idx_plans_user`、`idx_plans_visibility_updated`。
- 安全与权限：
  - 所有写操作需 `X-CSRF-Token`（后端 `requireCsrf`）；所有请求需登录（`authenticate`）。
  - 访问控制：仅计划所有者或管理员可查看/更新/删除单个计划；列表仅返回当前用户的数据。
- 上游模型与 Key 选择：支持用户密钥或共享池密钥，解析 `config_json` 可覆盖 `base_url`、`model` 等（详见“共享池：API Key 与配置”）。

## 9. 聊天与图像功能（含流式与终止）
- 对话管理：
  - 会话列表加载与切换：`client/dashboard.html`（左侧 `convList` 与 `selectConversation`）
  - 新建会话：前端 `client/dashboard.html`；后端 `server/routes/chat.js`（`POST /chat/conversations`）
- 消息发送与回复：
  - 普通请求：`client/dashboard.html` 中 `send()`；后端 `server/routes/chat.js`（`POST /chat/conversations/:id/send`）
  - 流式回复（SSE 消费）：`client/dashboard.html` 中 `sendStream()` 使用 `fetch + ReadableStream`；后端 `server/routes/chat.js` 按帧推送 `delta`
- 终止回复（Stop Response）：
  - 前端终止：`client/dashboard.html`（`AbortController`，`#stopBtn` 按钮）
  - 后端检测：`server/routes/chat.js`（监听客户端断开并停止推送与保存）
- 图片上传与选择：
  - 上传接口：`server/routes/chat.js`（`POST /chat/uploads` 保存到 `server/uploads/`）
  - 前端上传与历史选择：`client/dashboard.html`（`#uploadBtn`、`#historyBtn`、缩略图渲染 `renderThumbs`）
- 图像解析兼容策略：
  - 多模态开关：环境变量 `DEEPSEEK_ENABLE_VISION` 与前端参数 `send_images`
  - 兼容降级：若上游不支持 `image_url`，后端自动回退为文本消息并附加“附图: <url>”，避免 `unknown variant image_url` 错误（`server/routes/chat.js`）

## 10. UI 风格统一与中文化
- 圆角统一：
  - 聊天页缩略图与按钮：`client/dashboard.html`（`border-radius: 12px`）
  - 资料页头像预览：`client/profile.html`（`#avatarPreview` 圆角 12px）

## 11. 运行与配置
 - 服务启动端口：`PORT`（默认 `3000`，容器内部监听）；Compose 将容器端口 `3000` 映射为宿主机 `3003`。
 - 预览与健康检查：`http://localhost:3003/dashboard.html`、`http://localhost:3003/profile.html`、`http://localhost:3003/register.html`。
- 环境变量：
  - `DEEPSEEK_ENABLE_VISION=1` 启用多模态（需选择具备视觉能力模型并前端勾选“发送图片”）

## 12. 数据库与测试
- 数据库结构与种子数据：`docs/schema.sql`, `docs/seed.sql`
- 示例测试：`tests/auth.test.js`

## 13. 共享池：API Key 与配置
- 目标：允许用户自由选择将自己的 API Key 及其配置共享到全局共享池，其他用户在发送聊天请求时可选择使用共享池密钥。
- 数据库：
  - 表 `api_keys` 新增字段：`is_shared TINYINT(1) DEFAULT 0`，`config_json TEXT NULL`
  - 新增索引：`idx_api_keys_provider_shared (provider, is_shared)`
  - 迁移脚本：`server/scripts/migrate_shared_keys.js`；初始化结构：`docs/schema.sql`
- 后端路由：`server/routes/keys.js`
  - `GET /api/keys`：返回当前用户的密钥列表，包含 `is_shared` 字段（不返回明文 `api_key`）
  - `POST /api/keys`：新增密钥，支持 `is_shared`（布尔/1/0）与 `config`（JSON 或字符串）入库到 `config_json`
  - `GET /api/keys/shared?provider=deepseek`：列出共享池密钥（只读，不暴露明文 `api_key` 与 `config_json`）
  - `PATCH /api/keys/:id/share`：切换共享状态并可更新 `config_json`（仅密钥拥有者可操作）
- 聊天路由：`server/routes/chat.js`
  - 新增辅助：`chooseApiKey(req, provider, { source, key_id, shared_key_id })`，根据来源（用户/共享池）选择密钥并返回其 `api_key` 与 `config_json`
  - `POST /api/chat/deepseek`：请求体支持 `use_shared`（布尔）与 `shared_key_id`（可选），也支持 `key_id` 指定用户密钥；会解析 `config_json` 的 `base_url`、`model` 用于覆盖默认上游配置
  - `POST /api/chat/conversations/:id/send`：在 `params` 中支持 `use_shared`、`shared_key_id`、`key_id`、`provider`（默认 `deepseek`），并应用所选密钥的 `config_json`（如 `base_url`、`model`）；其余参数如 `stream`、`temperature`、`top_p` 等维持不变
- 安全与权限：
  - 仅密钥拥有者可修改其共享状态；共享池读取列表不暴露敏感字段
  - 聊天代理端使用所选密钥执行上游请求，前端不接触 `api_key` 明文
- 对应文件映射：
  - 路由：`server/routes/keys.js`, `server/routes/chat.js`
  - 迁移与结构：`server/scripts/migrate_shared_keys.js`, `docs/schema.sql`

---
如需扩展共享池能力（如针对不同提供商的更多配置项、配额与速率限制、审计日志等），可在本节继续完善设计并标注对应改动文件。
---
如需扩展功能（如更严格的输入校验、使用 `helmet` 增强安全响应头、进一步完善流控与重试），可在此文档继续追加章节并标注对应改动文件。