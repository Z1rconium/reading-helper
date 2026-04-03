# Reading Helper

一个基于 Node.js + Express 的英语阅读助手。项目提供一个静态前端页面和一个轻量后端，用于多用户访问控制、文本上传、文章管理、提示词管理、对话历史存储，以及将 AI 请求以流式方式转发到各用户自己的上游模型服务。

## 功能概览

- 通过用户专属访问 `Key` 登录，使用服务端 Session 保持登录状态
- 上传、列出、读取、删除 `.txt` / `.text` 文件
- 在浏览器中阅读文章，并结合选词、选句、选段进行 AI 交互
- 按文章维度保存多轮对话历史
- 在 `config/prompts/` 中管理系统提示词模板
- 通过 `/api/ai/chat/stream` 将流式响应转发给前端，并按用户使用各自的 provider 配置

## 技术栈

- Node.js 18+
- Express
- express-session
- multer
- 原生 HTML / CSS / JavaScript 前端

## 目录结构

```text
.
├── config/
│   ├── platform.config.json
│   ├── users.config.json
│   └── prompts/
├── data/
│   └── users/
│       └── <userId>/
│           ├── uploads/
│           └── chats/
├── public/
│   └── index.html
├── server/
│   ├── index.js
│   ├── config-loader.js
│   ├── file-store.js
│   ├── prompt-store.js
│   └── chat-store.js
├── package.json
└── README.md
```

## 环境要求

- Node.js >= 18
- 可访问的上游 AI 接口

## 安装

```bash
npm install
```

## 配置

项目默认从 `config/` 目录读取配置。当前仓库中的敏感值已经被替换为占位符，运行前需要填入真实内容。

### `config/platform.config.json`

```json
{
  "session_secret": "REPLACE_WITH_REAL_SESSION_SECRET"
}
```

- `session_secret`: Express Session 签名密钥

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
        "api_model": "gpt-5"
      }
    }
  ]
}
```

- `userId`: 用户唯一标识，只允许字母、数字、下划线和中划线
- `accessKey`: 该用户登录时输入的访问口令
- `provider.api_url`: 该用户自己的上游模型接口地址
- `provider.api_key`: 该用户自己的上游模型服务密钥
- `provider.api_model`: 模型名称

说明:

- 如果 `provider.api_url` 路径以 `/responses` 结尾，服务端会按 Responses API 结构发请求
- 否则按 Chat Completions 风格发送请求

### 提示词模板

系统提示词位于 `config/prompts/`。这些文件会在前端“修改系统提示词”入口中读取和编辑。现有模板包括：

- `analyze-sentence.md`
- `color-sentence.md`
- `explain-word.md`
- `mcq.md`
- `mindmap.md`
- `qa.md`
- `send-button.md`
- `summarize-paragraph.md`
- `summary-evaluation.md`
- `tf.md`
- `translate-paragraph.md`

## 启动方式

开发模式：

```bash
npm run dev
```

生产方式：

```bash
npm start
```

指定配置和数据目录：

```bash
CONFIG_DIR=./config USER_DATA_ROOT=./data/users npm start
```

默认监听地址：

```text
http://localhost:3000
```

## 可用环境变量

- `PORT`: 服务端口，默认 `3000`
- `CONFIG_DIR`: 配置目录，默认 `./config`
- `USER_DATA_ROOT`: 用户数据根目录，默认 `./data/users`
- `DATA_DIR`: 兼容旧参数；如果设置，会用于推导用户数据根目录的父目录
- `MAX_UPLOAD_BYTES`: 上传文件大小限制，默认 `2097152`（2 MB）

## 使用流程

1. 启动服务后，打开浏览器访问 `http://localhost:3000`
2. 输入 `config/users.config.json` 中某个用户配置的 `accessKey`
3. 上传 `.txt` 或 `.text` 文件
4. 在左侧选择文章，在中间阅读内容
5. 使用右侧对话区发起 AI 问答、分析或总结
6. 按文章维度查看、创建、清空或删除历史对话
7. 通过“修改系统提示词”调整不同操作使用的提示模板

## 数据存储说明

- 上传的文章存储在 `data/users/<userId>/uploads/`
- 对话历史存储在 `data/users/<userId>/chats/`
- 提示词模板存储在 `config/prompts/`

文章删除时，服务端会一并删除当前用户下该文章关联的历史对话数据。

## 主要接口

所有接口除登录状态检查外，基本都依赖已登录的 Session。

### 认证

- `POST /api/auth/login`
  - 请求体: `{ "accessKey": "..." }`
- `GET /api/auth/status`
- `POST /api/auth/logout`

### 文件

- `POST /api/files/upload`
  - `multipart/form-data`
  - 字段名: `file`
- `GET /api/files`
- `GET /api/files/:name`
- `DELETE /api/files/:name`

### 提示词

- `GET /api/prompts`
- `GET /api/prompts/:name`
- `PUT /api/prompts/:name`
  - 请求体: `{ "content": "..." }`

### 对话历史

- `GET /api/chats?fileName=<articleName>`
- `POST /api/chats?fileName=<articleName>`
- `GET /api/chats/:conversationId?fileName=<articleName>`
- `DELETE /api/chats/:conversationId?fileName=<articleName>`
- `POST /api/chats/:conversationId/messages?fileName=<articleName>`
  - 请求体: `{ "role": "user|assistant", "content": "...", "timestamp": "optional" }`
- `DELETE /api/chats/:conversationId/messages?fileName=<articleName>`

### AI 流式代理

- `POST /api/ai/chat/stream`
  - 请求体: `{ "systemPrompt": "...", "prompt": "..." }`
  - 返回类型: `text/event-stream`

## 安全注意事项

- 不要把真实 `api_key`、`accessKey`、`session_secret` 提交到仓库
- `config/*.json` 应视为本地运行配置
- 仅允许上传 `.txt` 和 `.text` 文件
- 服务端已对文件名、提示词文件名、对话 ID 做基本校验，但仍建议仅在受控环境中部署
- 当前 Session Cookie 的 `secure` 选项为 `false`，如果通过 HTTPS 部署，建议调整为 `true`

## 开发说明

- 项目使用 CommonJS 模块风格
- 没有单独的前端构建步骤，`public/` 目录由 Express 直接托管
- 后端核心入口是 `server/index.js`
- 配置读取逻辑位于 `server/config-loader.js`
- 上传文件处理位于 `server/file-store.js`
- 提示词读写位于 `server/prompt-store.js`
- 对话持久化位于 `server/chat-store.js`

## 手动验证建议

当前仓库没有自动化测试。修改后建议至少手动验证以下流程：

1. 登录与退出登录
2. 上传文本文件
3. 文件列表展示与文章内容读取
4. 删除文章及关联对话
5. 提示词列表读取与保存
6. 新建对话、追加消息、清空对话、删除对话
7. `/api/ai/chat/stream` 的流式返回是否正常

## 常见问题

### 服务启动失败，提示缺少配置字段

检查 `config/platform.config.json` 和 `config/users.config.json` 是否仍然保留占位符，或者字段为空。

### AI 没有返回内容

重点检查：

- `api_url` 是否正确
- `api_key` 是否有效
- `api_model` 是否存在
- 上游接口是否支持当前请求格式

### 上传文件失败

重点检查：

- 文件扩展名是否为 `.txt` 或 `.text`
- 文件大小是否超过 `MAX_UPLOAD_BYTES`
- 文件名是否包含非法字符

## License

本项目采用 `MIT License`，允许使用、复制、修改、合并、发布和分发，但必须保留原始版权声明和许可声明。
