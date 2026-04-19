# 📚 Reading Helper

> 基于 AI 的多用户英语阅读辅助平台，支持文章精读、词汇高亮、结构化题目、思维导图、流式对话与语音朗读。

## 最近更新

### 2026-04-18
- **管理员面板完整功能上线**：新增完整的用户管理和监控系统
  - **用户管理**：支持在线添加/删除用户，自动清理关联数据（会话、偏好、提示词、聊天记录、指标）
  - **指标追踪**：记录并展示用户登录事件和 AI API 使用情况（请求数、Token 消耗、成本统计）
  - **聊天历史**：查看所有用户的历史对话记录，支持对话折叠和详细内容展示
  - **全量刷新**：管理员工具栏新增「刷新全部数据」按钮，可一键强制刷新所有用户的聊天、登录与 AI 用量缓存数据
  - **后端模块**：
    - `server/admin-metrics-store.js` - 指标数据持久化（SQLite）
    - `server/chat-db.js` - 聊天记录数据库访问
    - `server/users-config-manager.js` - 用户配置文件管理（原子写入）
  - **UI 优化**：改进管理员面板交互体验，包括按钮悬停效果、滚动条样式和响应式布局
- **安全加固更新**：
  - 登录接口 `POST /api/auth/login` 纳入 CSRF 校验链路
  - CSRF 校验收紧为「Cookie Token + Header Token 必须同时存在且一致」，并拒绝来源不匹配请求
  - 移除宽松的 `cors({ origin: true, credentials: true })` 默认放行策略，降低跨站请求风险

## 项目概述

Reading Helper 是一个全栈 Web 应用，面向英语学习场景。用户上传文章后，可围绕选中文本或整篇内容调用提示词能力，并通过流式 AI 对话获得解释、分析、翻译、概括、题目与思维导图等反馈。

## 核心特性

- 🔐 `accessKey` + Cloudflare Turnstile 登录校验
- 👥 多用户目录与数据隔离（上传、提示词、聊天、偏好）
- 👨‍💼 管理面板（用户管理、登录记录、AI 使用统计、聊天历史查看）
- 💬 SQLite 聊天持久化（每篇文章多会话）+ 旧 JSON 自动迁移
- 🤖 支持 OpenAI Chat Completions / OpenAI Responses / Anthropic Messages / 自定义兼容端点
- ⚡ AI SSE 流式输出与错误透传映射
- ⚡ `/api/ai/chat/stream` 与 `/api/tts` 默认跳过 `compression`，优化流式首包延迟
- 🩺 AI 连通性一键检测（`errorCode + message + summary`）
- 📊 管理员指标追踪（登录事件、AI 使用量、Token 统计）
- 📝 用户级提示词模板管理
- 📝 `/api/files` 与 `/api/prompts` 列表接口返回文件名数组，前端本地增量维护列表
- 🎯 CET4/CET6 词汇标注
- 🔊 Edge TTS + 浏览器本地语音回退（非 Safari 下 Edge 不可用时自动回退）
- 🧠 思维导图可视化（D3 + markmap，含渲染缓存与缩放/折叠状态优化）
- 🧩 开放题、选择题、判断题、语法树等结构化输出渲染
- 🚀 前端按需模块化加载（`article-renderer`、`speech`、`mindmap`、`quiz`、`prompt-manager`、`admin-panel`）与交互预热
- 📱 平板端优化（页面滚动锁定、长按删除聊天、布局收紧、选择修复）+ 移动端阻断页
- 🧼 assistant 内容在最终渲染阶段统一清洗，避免后端重复清洗开销
- 💾 偏好设置前端合并写 + 后端去重落盘，减少重复写入
- 🔒 CSRF 保护、登录限流、CSP 与会话隔离

## 技术栈

### 后端
- Node.js >= 18
- Express
- Redis + `connect-redis`（会话）
- SQLite + `better-sqlite3`（聊天 + 管理员指标）
- Multer（上传）
- compression（HTTP 压缩）

### 前端
- 原生 JavaScript（主壳 + 懒加载模块）
- DOMPurify（渲染侧安全清洗）
- D3.js + markmap（思维导图）
- Web Speech API + Edge TTS

## 数据流架构

```text
┌─────────────┐
│   用户登录   │ ──> accessKey 验证 + Cloudflare Turnstile
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│                Express 中间件层                      │
│ Session(Redis) │ CSRF │ Rate Limit │ Compression    │
└───────────────────┬──────────────────────────────────┘
                    │
       ┌────────────┼──────────────┬──────────────┐
       ▼            ▼              ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────┐
│ 文件管理  │ │ 提示词库  │ │ 对话存储      │ │ 偏好设置  │
│ uploads  │ │ .md      │ │ SQLite / WAL │ │ .json    │
└──────────┘ └──────────┘ └──────────────┘ └──────────┘
       │            │              │
       └────────────┼──────────────┘
                    ▼
         ┌───────────────────────────┐
         │      AI 提供商抽象层       │
         │ OpenAI / Anthropic / 兼容端点 │
         └─────────────┬─────────────┘
                       │
                       ▼
                SSE 流式输出到前端

前端朗读链路：
用户操作 → /api/tts → Edge TTS（失败时回退 Web Speech API 本地语音）
```

## 项目结构

```text
reading-helper/
├── server/
│   ├── index.js
│   ├── session-store.js
│   ├── file-store.js
│   ├── prompt-store.js
│   ├── chat-store.js
│   ├── chat-db.js
│   ├── chat-migrate.js
│   ├── preferences-store.js
│   ├── admin-metrics-store.js
│   ├── csrf-protection.js
│   └── ...
├── public/
│   ├── index.html
│   ├── css/main.css
│   └── js/
│       ├── app.js
│       ├── main.js
│       ├── core/
│       ├── utils/
│       └── modules/
│           ├── article-renderer.js
│           ├── speech.js
│           ├── mindmap.js
│           ├── quiz.js
│           ├── prompt-manager.js
│           └── admin-panel.js
├── config/
│   ├── platform.config.json
│   ├── users.config.json
│   ├── admin.config.json
│   ├── cet_word_list.txt
│   └── prompts/*.md
├── data/
│   ├── admin/admin.sqlite
│   └── users/<userId>/
│       ├── uploads/
│       ├── chats/chat.sqlite
│       ├── prompts/
│       └── preferences.json
├── ecosystem.config.js
└── package.json
```

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

```bash
export REDIS_URL="redis://127.0.0.1:6379"
export TURNSTILE_SECRET_KEY="your-cloudflare-turnstile-secret"
```

### 3) 配置用户

编辑 `config/users.config.json`：

```json
{
  "users": [
    {
      "userId": "demo",
      "accessKey": "your-secret-key",
      "provider": {
        "api_url": "https://api.openai.com/v1/chat/completions",
        "api_key": "sk-...",
        "api_model": "gpt-4o"
      }
    }
  ]
}
```

### 4) 配置管理员（可选）

编辑 `config/admin.config.json`：

```json
{
  "accessKey": "your-admin-secret-key"
}
```

### 5) 启动

开发模式：

```bash
npm run dev
```

生产模式：

```bash
npm start
```

自定义路径示例：

```bash
REDIS_URL="redis://127.0.0.1:6379" \
CONFIG_DIR=./config \
USER_DATA_ROOT=./data/users \
npm start
```

访问：`http://localhost:3000`

## 关键环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务端口 |
| `REDIS_URL` | - | 必填，Redis 会话连接 |
| `CONFIG_DIR` | `./config` | 配置目录 |
| `USER_DATA_ROOT` | `./data/users` | 用户数据根目录 |
| `MAX_UPLOAD_BYTES` | `2097152` | 最大上传大小（字节） |
| `TRUST_PROXY` | `1` | 反向代理信任级别 |
| `TURNSTILE_SECRET_KEY` | - | Turnstile Secret |
| `CF_TURNSTILE_SECRET_KEY` | - | Turnstile Secret 备用变量名 |
| `ADMIN_DATA_DIR` | `./data/admin` | 管理员数据目录 |

## 部署说明

### PM2

```bash
pm2 start ecosystem.config.js
pm2 logs reading-helper
pm2 reload reading-helper
```

### Nginx（SSE 关键项）

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 120s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

静态资源缓存策略：
- `public/index.html` 使用 `?v=...` 版本参数引用脚本
- 生产环境对带 `v` 参数的 `.js/.css` 返回 `Cache-Control: immutable`

## API 文档

### 连通性检查

**`POST /api/ai/connectivity-check`**

检查当前登录用户配置的上游 AI 端点可达性。

成功示例：

```json
{
  "ok": true,
  "latencyMs": 328,
  "status": 200
}
```

失败示例：

```json
{
  "ok": false,
  "latencyMs": 412,
  "status": 401,
  "errorCode": "AUTH_FAILED",
  "message": "API Key 无效或无权限",
  "summary": "Incorrect API key provided"
}
```

常见 `errorCode`：
- `AUTH_FAILED`
- `ENDPOINT_NOT_FOUND`
- `RATE_LIMITED`
- `UPSTREAM_UNAVAILABLE`
- `TIMEOUT`
- `NETWORK_ERROR`
- `DNS_ERROR`

### 管理面板 API

**`POST /api/admin/login`**

管理员登录，需提供 `accessKey` 和 Turnstile token。

**`GET /api/admin/users`**

获取所有用户列表及其基本信息。

**`GET /api/admin/metrics/logins`**

获取用户登录记录（支持分页和时间范围过滤）。

**`GET /api/admin/metrics/ai-usage`**

获取 AI 使用统计（Token 消耗、请求次数等）。

**`GET /api/admin/chats/:userId`**

获取指定用户的所有聊天会话列表。

**`GET /api/admin/chats/:userId/:articleId/:conversationId`**

获取指定用户的特定会话详细内容。

## 手动测试清单

### 用户功能
- [ ] 登录/登出（含 Turnstile）
- [ ] 上传/读取/删除文章（含中文文件名）
- [ ] 文件列表增量更新（无多余全量刷新）
- [ ] 提示词列表读取与保存
- [ ] 创建/追加/清空/删除对话
- [ ] SQLite 聊天持久化与旧 JSON 迁移
- [ ] SSE 流式响应（含超时和错误场景）
- [ ] 连通性检查（成功/鉴权失败/限流/超时）
- [ ] TTS 朗读（Edge 正常 + Edge 失败回退本地语音）
- [ ] CET 词汇标注开关
- [ ] 思维导图渲染、折叠、缩放、全屏
- [ ] 偏好设置去重保存（无重复落盘）

### 管理面板功能
- [ ] 管理员登录（独立于用户登录）
- [ ] 用户列表展示（userId、最后登录时间、AI 使用量）
- [ ] 登录记录查看（时间、用户、分页）
- [ ] AI 使用统计（Token 消耗、请求次数、成功率）
- [ ] 用户聊天历史查看（文章列表、会话列表）
- [ ] 会话详情展示（折叠/展开、滚动行为）
- [ ] 历史数据加载（跨天统计）

## 维护提示

- 修改前端静态资源后，请同步更新：
  - `public/index.html` 中脚本 `?v=` 参数
  - `public/js/main.js` 中 `MODULE_VERSION`
- 若新增懒加载功能模块，请在 `public/js/main.js` 中同步注册 `registerFeatureLoader`

## 许可证

MIT
