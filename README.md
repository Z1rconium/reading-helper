# Reading Helper

一个基于 Node.js + Express 的英语阅读助手。提供静态前端页面和轻量后端，支持多用户访问控制、文本上传与管理、提示词管理、多轮对话历史持久化，以及将 AI 请求以流式方式转发到各用户自己的上游模型服务。

## 功能概览

- 通过用户专属 `accessKey` 登录，服务端 Session 保持登录状态（有效期 7 天）
- 上传、列出、读取、删除 `.txt` / `.text` 文件，支持中文文件名
- 在浏览器中阅读文章，结合选词、选句、选段进行 AI 交互
- 支持 Chat Completions 和 OpenAI Responses API 两种上游接口格式，自动判断
- 按文章维度管理多个独立对话，每条对话单独持久化为 JSON 文件
- 在 `data/users/<userId>/prompts/` 中按用户管理系统提示词，并以 `config/prompts/` 作为默认模板源
- 通过 `/api/ai/chat/stream` 以 SSE 流式转发 AI 响应，按用户独立使用各自的 provider 配置
- 提示词接口要求显式传递 `userId`，并且与当前 Session 用户一致

## 技术栈

- **运行时**: Node.js 18+
- **框架**: Express 4
- **会话**: express-session
- **上传**: multer（内存模式）
- **前端**: 原生 HTML / CSS / JavaScript，无构建步骤

## 目录结构

```text
.
├── config/
│   ├── platform.config.json        # 平台配置（session secret）
│   ├── users.config.json           # 用户列表与 AI provider 配置
│   └── prompts/                    # 默认系统提示词模板（.md 文件）
│       ├── analyze-sentence.md
│       ├── color-sentence.md
│       ├── explain-word.md
│       ├── mcq.md
│       ├── mindmap.md
│       ├── qa.md
│       ├── send-button.md
│       ├── summarize-paragraph.md
│       ├── summary-evaluation.md
│       ├── tf.md
│       └── translate-paragraph.md
├── data/
│   └── users/
│       └── <userId>/
│           ├── uploads/            # 用户上传的文本文件
│           ├── prompts/            # 用户自己的提示词副本
│           └── chats/
│               └── <articleBase64>/
│                   └── <uuid>.json # 每个对话独立存储
├── public/
│   └── index.html                  # 单页前端，由 Express 静态托管
├── server/
│   ├── index.js                    # 服务入口，路由注册
│   ├── config-loader.js            # 配置读取与校验
│   ├── file-store.js               # 上传文件的增删查
│   ├── prompt-store.js             # 提示词文件的读写
│   ├── chat-store.js               # 对话历史持久化（含旧格式迁移）
│   └── user-paths.js               # 用户数据目录路径计算
├── reading-helper.service          # systemd 服务单元文件（Linux 部署参考）
├── package.json
└── README.md
```

## 环境要求

- Node.js >= 18
- 可访问的上游 AI 接口（兼容 OpenAI Chat Completions 或 Responses API）

## 安装

```bash
npm install
```

## 配置

项目从 `config/` 目录读取配置（可通过环境变量 `CONFIG_DIR` 覆盖）。仓库中的敏感值已替换为占位符，运行前需填入真实内容。

### `config/platform.config.json`

```json
{
  "session_secret": "REPLACE_WITH_REAL_SESSION_SECRET"
}
```

| 字段 | 说明 |
|------|------|
| `session_secret` | Express Session 签名密钥，建议使用随机长字符串 |

### `config/users.config.json`

```json
{
  "users": [
    {
      "userId": "demo",
      "accessKey": "REPLACE_WITH_REAL_USER_ACCESS_KEY",
      "provider": {
        "api_url": "https://your-provider.example.com/v1/chat/completions",
        "api_key": "REPLACE_WITH_REAL_API_KEY",
        "api_model": "gpt-4o"
      }
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `userId` | 用户唯一标识，仅允许字母、数字、下划线、中划线 |
| `accessKey` | 用户登录口令，不可重复 |
| `provider.api_url` | 上游模型接口地址（见下方 API 格式说明） |
| `provider.api_key` | 上游模型服务密钥 |
| `provider.api_model` | 模型名称 |

**上游 API 格式自动判断：**

- 若 `api_url` 包含 `anthropic` 或路径包含 `/messages` → 按 **Anthropic Messages API** 结构发请求（`system` 字段 + `messages` 数组）
- 若 `api_url` 路径以 `/responses` 结尾 → 按 **OpenAI Responses API** 结构发请求（`instructions` + `input` 字段）
- 否则 → 按 **Chat Completions** 风格发请求（`messages` 数组）

#### Anthropic API 配置示例

```json
{
  "userId": "user_with_claude",
  "accessKey": "your_access_key",
  "provider": {
    "api_url": "https://api.anthropic.com/v1/messages",
    "api_key": "sk-ant-api03-...",
    "api_model": "claude-3-5-sonnet-20241022"
  }
}
```

注意：当前服务端请求头统一使用 `Authorization: Bearer <api_key>`。如果要**直连 Anthropic 官方 API**，还需要 `x-api-key` 与 `anthropic-version` 等请求头（目前未内置），请改造 `server/index.js` 或使用兼容 Bearer 认证的代理网关。

### 提示词模板

`config/prompts/` 保存默认提示词模板。每个用户首次访问提示词接口时，系统会将默认模板复制到 `data/users/<userId>/prompts/`；之后用户在前端"修改系统提示词"中的编辑只会影响自己的副本：

| 文件名 | 用途 |
|--------|------|
| `explain-word.md` | 解释单词 |
| `analyze-sentence.md` | 分析句子 |
| `color-sentence.md` | 句子着色/标注 |
| `translate-paragraph.md` | 翻译段落 |
| `summarize-paragraph.md` | 段落总结 |
| `summary-evaluation.md` | 总结评分 |
| `qa.md` | 问答练习 |
| `mcq.md` | 选择题 |
| `tf.md` | 判断题 |
| `mindmap.md` | 思维导图 |
| `send-button.md` | 发送按钮行为 |

## 启动方式

开发模式（--watch 热重载）：

```bash
npm run dev
```

生产模式：

```bash
npm start
```

自定义配置和数据目录：

```bash
CONFIG_DIR=./config USER_DATA_ROOT=./data/users npm start
```

默认监听地址：

```
http://localhost:3000
```

## 可用环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务监听端口 |
| `CONFIG_DIR` | `./config` | 配置目录路径 |
| `USER_DATA_ROOT` | `./data/users` | 用户数据根目录 |
| `DATA_DIR` | — | 兼容旧参数；设置后将以其父目录 + `/users` 推导用户数据根目录 |
| `MAX_UPLOAD_BYTES` | `2097152`（2 MB） | 单次上传文件大小上限 |

## Linux systemd 部署

仓库提供了 `reading-helper.service` 作为 systemd 单元文件参考模板：

```ini
[Unit]
Description=Reading Helper Server
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/path/to/reading-helper
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=CONFIG_DIR=/path/to/reading-helper/config
Environment=USER_DATA_ROOT=/path/to/reading-helper/data/users
ExecStart=/usr/bin/node /path/to/reading-helper/server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

使用方式：

```bash
sudo cp reading-helper.service /etc/systemd/system/
# 按实际路径修改 WorkingDirectory / ExecStart / Environment
sudo systemctl daemon-reload
sudo systemctl enable --now reading-helper
```

## 通过 GitHub 更新部署

若 `/opt/reading-helper` 是 Git 仓库，直接拉取最新代码：

```bash
cd /opt/reading-helper
sudo git pull --ff-only
sudo npm install
sudo systemctl restart reading-helper
```

若 `/opt/reading-helper` 不是 Git 仓库，可用“重新克隆 + 保留配置和数据”的方式更新：

```bash
sudo systemctl stop reading-helper
sudo mkdir -p /opt/reading-helper-backup
sudo rsync -a /opt/reading-helper/config /opt/reading-helper/data /opt/reading-helper-backup/
sudo rm -rf /opt/reading-helper-tmp
sudo git clone https://github.com/Z1rconium/reading-helper /opt/reading-helper-tmp
sudo rsync -a /opt/reading-helper-backup/config/ /opt/reading-helper-tmp/config/
sudo rsync -a /opt/reading-helper-backup/data/ /opt/reading-helper-tmp/data/
sudo mv /opt/reading-helper /opt/reading-helper.old
sudo mv /opt/reading-helper-tmp /opt/reading-helper
cd /opt/reading-helper
sudo npm install
sudo systemctl start reading-helper
```

## 使用流程

1. 启动服务，打开浏览器访问 `http://localhost:3000`
2. 输入 `config/users.config.json` 中某个用户的 `accessKey` 登录
3. 上传 `.txt` 或 `.text` 文件（支持中文文件名，单文件最大 2 MB）
4. 在左侧选择文章，在中间阅读内容
5. 使用右侧对话区发起 AI 问答、分析或总结
6. 按文章维度查看、新建、清空或删除历史对话
7. 通过"修改系统提示词"调整不同功能使用的提示模板

## 数据存储说明

- 上传的文章存储在 `data/users/<userId>/uploads/`
- 对话历史存储在 `data/users/<userId>/chats/<articleBase64url>/` 目录下，每条对话对应一个 `<uuid>.json` 文件
- 旧版本使用单 JSON 文件存储所有对话，首次访问时会自动迁移到新格式
- 默认提示词模板存储在 `config/prompts/`
- 用户编辑后的提示词存储在 `data/users/<userId>/prompts/`

删除文章时，服务端会一并删除该用户下该文章关联的所有对话数据。

## 主要 API 接口

所有接口除认证检查外均需已登录的 Session。

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/auth/login` | 登录，请求体: `{ "accessKey": "..." }` |
| `GET` | `/api/auth/status` | 获取当前登录状态 |
| `POST` | `/api/auth/logout` | 退出登录 |

### 文件

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/files/upload` | 上传文件，`multipart/form-data`，字段名 `file` |
| `GET` | `/api/files` | 列出当前用户所有文件 |
| `GET` | `/api/files/:name` | 读取文件内容 |
| `DELETE` | `/api/files/:name` | 删除文件及关联对话 |

### 提示词

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/prompts?userId=<userId>` | 列出当前用户可编辑的提示词文件名 |
| `GET` | `/api/prompts/:name?userId=<userId>` | 读取当前用户的提示词内容 |
| `PUT` | `/api/prompts/:name` | 更新当前用户提示词，请求体: `{ "userId": "...", "content": "..." }` |

> 说明：提示词接口会校验 `userId` 与当前登录 Session 的 `userId` 一致，否则返回 `403`。

### 对话历史

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/chats?fileName=<name>` | 列出指定文章的所有对话摘要 |
| `POST` | `/api/chats?fileName=<name>` | 新建对话 |
| `GET` | `/api/chats/:id?fileName=<name>` | 读取完整对话（含所有消息） |
| `DELETE` | `/api/chats/:id?fileName=<name>` | 删除对话 |
| `POST` | `/api/chats/:id/messages?fileName=<name>` | 追加消息，请求体: `{ "role": "user\|assistant", "content": "...", "timestamp": "optional" }` |
| `DELETE` | `/api/chats/:id/messages?fileName=<name>` | 清空对话消息 |

> 消息 `content` 最大长度为 200,000 字符。

### AI 流式代理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/ai/chat/stream` | 流式转发 AI 请求，返回 `text/event-stream` |

请求体：

```json
{
  "systemPrompt": "（可选，留空使用默认提示词）",
  "prompt": "用户消息"
}
```

SSE 事件格式：

```
data: {"delta": "文本片段"}
data: {"error": "错误信息"}
data: [DONE]
```

## 安全注意事项

- 不要将真实 `api_key`、`accessKey`、`session_secret` 提交到代码仓库
- `config/*.json` 应视为本地运行配置，可加入 `.gitignore`
- 仅允许上传 `.txt` 和 `.text` 文件
- 服务端对文件名、提示词文件名、对话 ID 已做基本验证，但建议仅在受控网络环境中部署
- Session Cookie 的 `secure` 选项当前为 `false`；若通过 HTTPS 部署，建议在 `server/index.js` 中改为 `true`

## 开发说明

- 项目使用 CommonJS 模块风格
- 没有单独的前端构建步骤，`public/` 目录由 Express 直接静态托管
- 后端各模块职责：

| 文件 | 职责 |
|------|------|
| `server/index.js` | 服务启动、中间件注册、所有路由定义 |
| `server/config-loader.js` | 读取并校验 `platform.config.json` 和 `users.config.json` |
| `server/file-store.js` | 上传文件的保存、列出、读取、删除，含文件名清洗与去重 |
| `server/prompt-store.js` | 提示词 `.md` 文件的读写 |
| `server/chat-store.js` | 对话持久化，含旧单文件格式到新目录格式的自动迁移 |
| `server/user-paths.js` | 根据环境变量计算各用户数据目录的绝对路径 |

## 手动验证建议

当前仓库没有自动化测试，修改后建议手动验证以下流程：

1. 登录与退出登录
2. 上传文本文件（含中文文件名）
3. 文件列表展示与文章内容读取
4. 删除文章及关联对话
5. 提示词列表读取与保存
6. 新建对话、追加消息、清空对话、删除对话
7. `/api/ai/chat/stream` 的流式返回是否正常（Chat Completions 和 Responses API 各测一次）

## 常见问题

### 服务启动失败，提示缺少配置字段

检查 `config/platform.config.json` 和 `config/users.config.json` 是否仍保留占位符，或字段为空。至少需要配置一个用户。

### AI 没有返回内容

重点检查：

- `api_url` 是否正确，路径末尾是否符合预期（`/chat/completions` vs `/responses`）
- `api_key` 是否有效
- `api_model` 是否存在
- 上游接口是否支持流式响应（`stream: true`）

### 上传文件失败

重点检查：

- 文件扩展名是否为 `.txt` 或 `.text`
- 文件大小是否超过 `MAX_UPLOAD_BYTES`（默认 2 MB）
- 文件名是否只含字母、数字、中文、下划线、中划线、空格、点

### 旧版本对话数据是否兼容

兼容。首次访问某篇文章的对话列表时，若检测到旧单文件格式（`<articleBase64>.json`），会自动迁移到新目录格式，无需手动操作。

## License

本项目采用 MIT License，允许使用、复制、修改、合并、发布和分发，但必须保留原始版权声明和许可声明。
