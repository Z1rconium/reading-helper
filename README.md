# Reading Helper

面向英语阅读教学和自学场景的多用户 AI 阅读辅助平台，支持文章上传、选词精讲、整段分析、结构化出题、思维导图、流式对话和朗读。

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-43853D?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.21-000000?style=flat-square&logo=express&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-Session-DC382D?style=flat-square&logo=redis&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=flat-square&logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/Frontend-Vanilla_JS-F7DF1E?style=flat-square&logo=javascript&logoColor=111111)
![SSE](https://img.shields.io/badge/Streaming-SSE-0A66C2?style=flat-square)
![D3](https://img.shields.io/badge/D3-Mindmap-F68E56?style=flat-square&logo=d3.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

## 项目定位

Reading Helper 不是一个通用聊天壳，而是围绕“英文文章阅读”这个核心任务搭的一套完整工作流：

- 用户上传 `.txt` / `.text` / `.md` 文章后，在阅读区直接选词、选句、选段。
- 前端把当前选择和文章上下文送到对应提示词模板，后端再代理到配置好的 AI 提供商。
- 输出支持流式返回，并按任务类型渲染成解释、翻译、概括、题目、思维导图等结构化结果。
- 每个用户的数据、提示词、聊天记录、偏好设置、用量统计都做了隔离。

## 核心能力

- 多用户登录：`accessKey` 登录，支持 Cloudflare Turnstile 校验。
- 阅读交互：单词解释、句法分析、彩虹拆句、段落翻译、段落概括。
- 全文任务：词汇标注、问答题、选择题、判断题、思维导图。
- 流式 AI：SSE 输出、上游并发控制、超时处理、错误映射。
- 朗读能力：`/api/tts` 接 Edge TTS，失败时前端可回退 Web Speech API。
- 会话持久化：按文章维护多会话聊天，SQLite 持久化，兼容旧 JSON 迁移。
- 提示词管理：用户级 prompt 模板读写和同步。
- 管理后台：用户增删、登录记录、AI 使用统计、聊天记录查看、数据清理。
- 安全控制：CSRF、登录限流、CSP、会话隔离、文件名校验。

## 技术栈

### 后端

- `Node.js >= 18`
- `Express 4`
- `express-session` + `connect-redis` + `redis`
- `better-sqlite3`
- `undici`
- `multer`
- `compression`
- `express-rate-limit`
- `cookie-parser`

### 前端

- 原生 `JavaScript`
- 模块化前端拆分：`core / utils / modules`
- `D3.js` + `markmap` 思维导图渲染
- `DOMPurify` / `sanitize-html` 内容清洗
- `Web Speech API`
- `@cap.js/widget`（Turnstile 相关前端组件）

### 数据与运行时

- `Redis`：Session Store
- `SQLite`：聊天数据、管理员指标
- 文件系统：用户上传、提示词模板、偏好设置
- `PM2`：生产集群部署

## 系统架构

```text
Browser
  │
  ├─ 阅读区 / 快捷操作 / AI 问答区 / 管理后台
  │
  ▼
Express App
  ├─ Session + Redis
  ├─ CSRF / Rate Limit / CSP / Compression
  ├─ File Store
  ├─ Prompt Store
  ├─ Chat Store + SQLite
  ├─ Preferences Store
  ├─ Admin Metrics + SQLite
  └─ AI Proxy / TTS Proxy
        ├─ OpenAI Chat Completions
        ├─ OpenAI Responses
        ├─ Anthropic Messages
        ├─ Custom Compatible Endpoint
        └─ Edge TTS Endpoint
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 准备运行依赖

你至少需要这三样：

- `Node.js >= 18`
- 一个可用的 `Redis`
- 一个可访问的 `EDGE_TTS_ENDPOINT`

注意：当前服务启动时会强校验 `REDIS_URL` 和 `EDGE_TTS_ENDPOINT`。少任何一个，服务都会直接报错退出。

### 3. 准备配置文件

#### `config/platform.config.json`

```json
{
  "session_secret": "replace-with-a-long-random-secret"
}
```

#### `config/users.config.json`

```json
{
  "users": [
    {
      "userId": "demo",
      "accessKey": "replace-with-user-access-key",
      "provider": {
        "api_url": "https://api.openai.com/v1/chat/completions",
        "api_key": "sk-...",
        "api_model": "gpt-4o"
      }
    }
  ]
}
```

#### `config/admin.config.json`

```json
{
  "accessKey": "replace-with-admin-access-key"
}
```

### 4. 配置环境变量

```bash
export REDIS_URL="redis://127.0.0.1:6379"
export EDGE_TTS_ENDPOINT="http://127.0.0.1:3311"
export CONFIG_DIR="./config"
export USER_DATA_ROOT="./data/users"
```

### 5. 启动服务

开发模式：

```bash
npm run dev
```

生产模式：

```bash
npm start
```

完整示例：

```bash
REDIS_URL="redis://127.0.0.1:6379" \
EDGE_TTS_ENDPOINT="http://127.0.0.1:3311" \
CONFIG_DIR=./config \
USER_DATA_ROOT=./data/users \
npm start
```

默认访问地址：

```text
http://localhost:3000
```

## 配置说明

### 关键环境变量

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---:|---|
| `PORT` | 否 | `3000` | 服务端口 |
| `REDIS_URL` | 是 | - | Redis Session Store 连接串 |
| `EDGE_TTS_ENDPOINT` | 是 | - | Edge TTS 代理服务地址 |
| `CONFIG_DIR` | 否 | `./config` | 配置目录 |
| `USER_DATA_ROOT` | 否 | `./data/users` | 用户数据根目录 |
| `ADMIN_DATA_DIR` | 否 | `./data/admin` | 管理员 SQLite 数据目录 |
| `MAX_UPLOAD_BYTES` | 否 | `2097152` | 上传文件大小上限 |
| `TRUST_PROXY` | 否 | 未设置 | 反向代理信任级别 |
| `TURNSTILE_SECRET_KEY` | 否 | - | Cloudflare Turnstile secret |
| `CF_TURNSTILE_SECRET_KEY` | 否 | - | Turnstile 备用环境变量名 |
| `REDIS_SESSION_PREFIX` | 否 | `reading-helper:sess:` | Redis Session key 前缀 |

### 上传限制

- 仅支持 `.txt`、`.text`、`.md`
- 默认最大上传大小 `2MB`
- 文件名会做合法性校验，禁止路径穿越和控制字符

### 设备策略

- `desktop` / `tablet` 正常可用
- `phone` 端默认阻断登录入口，避免交互体验失控

## 项目结构

```text
reading-helper/
├── server/
│   ├── index.js
│   ├── config-loader.js
│   ├── session-store.js
│   ├── file-store.js
│   ├── prompt-store.js
│   ├── chat-store.js
│   ├── chat-db.js
│   ├── chat-migrate.js
│   ├── preferences-store.js
│   ├── admin-metrics-store.js
│   ├── users-config-manager.js
│   ├── csrf-protection.js
│   ├── cleanup-orphaned-users.js
│   └── user-paths.js
├── public/
│   ├── index.html
│   ├── css/main.css
│   └── js/
│       ├── main.js
│       ├── app.js
│       ├── core/
│       ├── utils/
│       └── modules/
├── config/
│   ├── platform.config.json
│   ├── admin.config.json
│   ├── cet_word_list.txt
│   └── prompts/*.md
├── data/
├── scripts/
├── ecosystem.config.js
├── PM2_DEPLOYMENT.md
└── package.json
```

## 主要数据落盘位置

```text
data/
├── admin/
│   └── admin.sqlite
└── users/<userId>/
    ├── uploads/
    ├── chats/
    │   └── chat.sqlite
    ├── prompts/
    └── preferences.json
```

## 开发说明

### 可用脚本

```bash
npm install
npm run dev
npm start
pm2 start ecosystem.config.js
```

### 代码风格

- 后端使用 CommonJS
- 统一 2 空格缩进
- 模块命名沿用仓库现有风格：`xxx-store.js`、`xxx-loader.js`
- 前端资源有版本号缓存策略；如果你改了前端静态资源，记得同步更新：
  - `public/index.html` 里的 `?v=...`
  - `public/js/main.js` 里的 `MODULE_VERSION`

### 测试现状

仓库当前没有自动化测试，也没有单独测试目录。现阶段更适合做：

- 核心 API 手动回归
- 登录 / 会话 / CSRF 校验
- 文件上传与提示词读写
- SSE 流式输出和 TTS 回退链路验证

## 部署

项目内置 PM2 配置，可直接启动：

```bash
pm2 start ecosystem.config.js
pm2 logs reading-helper
pm2 reload reading-helper
```

如果你前面放了 Nginx，SSE 相关配置至少要保证：

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

更细的 PM2 部署说明见：[PM2_DEPLOYMENT.md](/Users/wangchengan/Documents/Coding/reading-helper/PM2_DEPLOYMENT.md)

## 安全与运维提示

- 不要提交真实的 `config/*.json` 密钥。
- 生产环境建议把 `CONFIG_DIR` 和 `USER_DATA_ROOT` 指到仓库外目录。
- 如果走 HTTPS，建议把 Session Cookie 的 `secure` 打开。
- `userId` 只允许字母、数字、下划线和中划线。
- 管理员 `accessKey` 不能和普通用户重复。

## License

项目使用 MIT License，见：[LICENSE](/Users/wangchengan/Documents/Coding/reading-helper/LICENSE)
