# Reading Helper

[English](README.md) | 简体中文

一个基于 Node.js 的英语阅读助手，集成 AI 功能，专为多用户环境设计，具备数据隔离存储和流式 AI 响应能力。

## 📋 项目概述

Reading Helper 是一个全栈 Web 应用程序，结合了文本文件管理、AI 驱动的语言学习功能和多用户身份验证。系统提供单页前端界面，配备强大的 Express 后端，处理用户认证、文件持久化、对话历史记录，并通过服务器发送事件（SSE）实现 AI 提供商抽象。

**核心特点：**
- 基于会话的多用户隔离认证
- 支持多种 AI 提供商（OpenAI、Anthropic）
- 通过 SSE 实现实时流式 AI 响应
- 按文章持久化对话历史
- 每用户可自定义系统提示词
- 支持中文文件名的文件上传

## 🏗️ 技术架构

### 系统分层

```
┌─────────────────────────────────────────────────────────┐
│  前端（单页应用）                                        │
│  • 静态 HTML/CSS/JS（约 5300 行）                       │
│  • D3.js 和 Markmap 用于可视化                          │
│  • EventSource 用于 SSE 流式传输                        │
└─────────────────────────────────────────────────────────┘
                          ↓ HTTP/SSE
┌─────────────────────────────────────────────────────────┐
│  Express 后端（Node.js）                                │
│  ├─ 认证层                                              │
│  │  • express-session + Redis                           │
│  │  • Cloudflare Turnstile 人机验证                     │
│  │  • CSRF 防护（cookie + header）                      │
│  │  • 速率限制（15分钟/5次尝试）                        │
│  ├─ 数据隔离层                                          │
│  │  • 按用户文件存储                                    │
│  │  • 按文章对话历史                                    │
│  │  • 用户专属提示词模板                                │
│  └─ AI 提供商抽象                                       │
│     • 自动检测（OpenAI/Anthropic）                      │
│     • SSE 流式代理                                      │
│     • 请求/响应格式适配                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  存储与外部服务                                          │
│  • Redis：会话持久化                                    │
│  • 文件系统：用户数据（上传/对话/提示词）               │
│  • 上游 AI API：OpenAI/Anthropic                        │
└─────────────────────────────────────────────────────────┘
```

### 技术栈

**后端：**
- 运行时：Node.js ≥18
- 框架：Express 4.x
- 会话：express-session + connect-redis
- 存储：Redis（会话）、文件系统（用户数据）
- 安全：bcrypt、sanitize-html、express-rate-limit、CSRF 防护
- 文件上传：multer
- 压缩：compression 中间件

**前端：**
- 原生 JavaScript（ES6+）
- D3.js（数据可视化）
- Markmap（思维导图渲染）
- DOMPurify（客户端 HTML 清洗）
- Web Speech API（文本转语音）

**AI 集成：**
- OpenAI Chat Completions API
- OpenAI Responses API
- Anthropic Messages API

## 📁 项目结构

```
reading-helper/
├── config/                          # 配置文件
│   ├── platform.config.json         # 会话密钥
│   ├── users.config.json            # 用户凭证和 AI 提供商配置
│   └── prompts/                     # 默认系统提示词模板
│       ├── explain-word.md
│       ├── analyze-sentence.md
│       ├── color-sentence.md
│       ├── summarize-paragraph.md
│       ├── translate-paragraph.md
│       ├── summary-evaluation.md
│       ├── mcq.md
│       ├── qa.md
│       ├── tf.md
│       ├── mindmap.md
│       └── send-button.md
├── data/
│   └── users/                       # 用户隔离数据存储
│       └── <userId>/
│           ├── uploads/             # 上传的文本文件
│           ├── chats/               # 对话历史
│           │   └── <articleBase64>/
│           │       └── <uuid>.json
│           └── prompts/             # 用户编辑的提示词
├── server/                          # 后端模块
│   ├── index.js                     # 主 Express 应用和路由
│   ├── config-loader.js             # 配置验证和加载
│   ├── session-store.js             # Redis 会话存储设置
│   ├── file-store.js                # 文件上传/读取/删除
│   ├── chat-store.js                # 对话持久化
│   ├── prompt-store.js              # 提示词模板管理
│   ├── user-paths.js                # 用户目录路径解析
│   ├── csrf-protection.js           # CSRF 令牌验证
│   └── cleanup-orphaned-users.js    # 启动清理工具
├── public/
│   └── index.html                   # 单页前端（约 5300 行）
├── logs/                            # PM2 日志输出（运行时创建）
├── ecosystem.config.js              # PM2 集群配置
├── package.json
└── README.md
```

## ✨ 核心功能

### 🔐 认证与安全
- 基于会话的认证，30 分钟持久化
- 从 `users.config.json` 验证访问密钥
- **登录页面集成 Cloudflare Turnstile 人机验证**
- 登录速率限制（15 分钟内最多 5 次尝试）
- 通过 cookie + header 验证实现 CSRF 防护
- HTML 清洗（服务端：sanitize-html，客户端：DOMPurify）
- 启动时自动清理孤立的用户目录

### 📄 文件管理
- 上传 `.txt` 和 `.text` 文件（最大 2MB）
- 支持中文文件名，编码正确
- 列表、读取和删除操作
- 删除文件时自动清理关联的对话历史

### 💬 对话系统
- 按文章持久化多轮对话
- 对话历史存储为独立的 JSON 文件
- 列表、创建、追加、清空和删除操作
- 自动从旧版单文件格式迁移
- 文章名称使用 Base64url 编码以确保目录安全

### 🤖 AI 集成
- 基于 API URL 模式自动检测提供商
- 支持 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages API
- SSE 流式传输实现逐 token 实时渲染
- 120 秒请求超时
- 按用户配置 API（URL、密钥、模型）

### 📝 提示词管理
- 默认模板位于 `config/prompts/`
- 首次访问时自动为每个用户复制
- 用户可编辑的提示词存储在 `data/users/<userId>/prompts/`
- 内置模板：
  - 单词解释（定义、音标、搭配）
  - 句子分析（语法、结构、翻译）
  - 彩虹拆句（JSON 语法树）
  - 段落翻译和概括
  - 概括评估
  - 思维导图生成
  - 多项选择题、判断题和开放题
  - 发送按钮（通用问答）

### 🎨 前端功能
- 可调整大小的阅读面板，带拖动手柄
- 可调节字体大小
- 文本选择触发器（单词/句子/段落）
- 文本转语音，可调节语速/音量/音调
- 文章上下文开关（最多 12,000 字符）
- 结构化输出渲染：
  - 语法树可视化（可折叠）
  - 交互式测验组件
  - 通过 Markmap 渲染思维导图
- CET4/CET6 词汇高亮

## 🚀 PM2 部署

### 前置要求

- Node.js ≥18
- Redis ≥6
- PM2（全局安装：`npm install -g pm2`）

### 安装

```bash
# 克隆仓库
git clone <repository-url>
cd reading-helper

# 安装依赖
npm install
```

### 配置

**1. 平台配置（`config/platform.config.json`）：**

```json
{
  "session_secret": "REPLACE_WITH_STRONG_RANDOM_SECRET"
}
```

**2. 用户配置（`config/users.config.json`）：**

```json
{
  "users": [
    {
      "userId": "demo",
      "accessKey": "REPLACE_WITH_SECURE_ACCESS_KEY",
      "provider": {
        "api_url": "https://api.openai.com/v1/chat/completions",
        "api_key": "sk-...",
        "api_model": "gpt-4o"
      }
    }
  ]
}
```

**验证规则：**
- `userId`：仅允许字母数字、下划线和连字符
- `accessKey`：所有用户中必须唯一
- `api_url`：自动检测提供商类型（OpenAI/Anthropic）

**3. Cloudflare Turnstile 配置：**

应用程序在登录页面使用 Cloudflare Turnstile 进行人机验证。站点密钥和密钥配置在：
- **前端**（`public/index.html`）：站点密钥在 `data-sitekey` 属性中
- **后端**（`server/index.js`）：密钥在登录路由处理器中

使用您自己的 Turnstile 密钥：
1. 在 [Cloudflare 控制台](https://dash.cloudflare.com/?to=/:account/turnstile) 创建 Turnstile 站点
2. 替换 `public/index.html` 中的站点密钥（第 152 行）
3. 替换 `server/index.js` 中的密钥（第 467 行）

**4. 环境变量：**

```bash
export REDIS_URL="redis://127.0.0.1:6379"
export PORT=3000
export CONFIG_DIR="./config"
export USER_DATA_ROOT="./data/users"
```

### PM2 启动

```bash
# 以集群模式启动（4 个实例）
pm2 start ecosystem.config.js

# 查看状态
pm2 list

# 查看日志
pm2 logs reading-helper

# 监控资源
pm2 monit
```

### PM2 管理命令

```bash
# 重启应用
pm2 restart reading-helper

# 零停机重载
pm2 reload reading-helper

# 停止应用
pm2 stop reading-helper

# 从 PM2 中删除
pm2 delete reading-helper

# 保存当前进程列表
pm2 save

# 设置开机启动脚本
pm2 startup
# 按照显示的命令执行（可能需要 sudo）
```

### 集群配置

默认的 `ecosystem.config.js` 运行 4 个实例。根据 CPU 核心数调整：

```javascript
module.exports = {
  apps: [{
    name: 'reading-helper',
    script: './server/index.js',
    instances: 'max',  // 使用所有可用的 CPU 核心
    exec_mode: 'cluster',
    max_memory_restart: '500M',
    // ...
  }]
};
```

### 反向代理（Nginx）

为了使 SSE 流式传输正常工作，需要禁用缓冲：

```nginx
location / {
  proxy_pass http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  
  # SSE 关键配置
  proxy_buffering off;
  proxy_read_timeout 86400;
}
```

## 🔧 常见问题

### Redis 连接错误

**症状：** `缺少 REDIS_URL 环境变量` 或连接超时

**解决方案：**
- 确保设置了 `REDIS_URL` 环境变量
- 验证 Redis 正在运行：`redis-cli ping`（应返回 `PONG`）
- 检查 Redis 连接字符串格式：`redis://host:port` 或 `redis://user:pass@host:port`

### CSRF 令牌验证失败

**症状：** 登录或 API 请求时出现 `CSRF token 缺失/验证失败`

**解决方案：**
- 确保浏览器中启用了 cookie
- 检查反向代理是否保留了 `Set-Cookie` 和 `Cookie` 头
- 对于跨域请求，正确配置 CORS 并使用 `credentials: 'include'`
- 清除浏览器 cookie 并重试

### SSE 流式传输问题

**症状：** AI 响应不流式传输或频繁断开连接

**解决方案：**
- 在 Nginx/Apache 中禁用代理缓冲（参见上面的反向代理配置）
- 将 `proxy_read_timeout` 增加到至少 120 秒
- 检查浏览器控制台中的 EventSource 错误
- 验证上游 AI API 可访问

### AI 响应错误

**症状：** 空响应或解析失败

**解决方案：**
- 验证 `api_url` 指向正确的端点：
  - OpenAI：`https://api.openai.com/v1/chat/completions`
  - Anthropic：`https://api.anthropic.com/v1/messages`
- 确认 `api_key` 有效且有足够的配额
- 检查 `api_model` 是否受提供商支持
- 查看服务器日志以获取详细错误消息

### 文件上传失败

**症状：** 上传被拒绝或文件未出现在列表中

**解决方案：**
- 验证文件扩展名为 `.txt` 或 `.text`
- 检查文件大小是否小于 2MB（可通过 `MAX_UPLOAD_BYTES` 配置）
- 确保 `data/users/<userId>/uploads/` 目录存在且可写
- 检查文件名中的无效字符（应自动清理）

### 思维导图无法渲染

**症状：** 思维导图按钮无响应或显示空白模态框

**解决方案：**
- 检查浏览器控制台中的 CDN 加载错误
- 验证 `markmap-view` 和 `d3` CDN URL 可访问
- 如果 CDN 被阻止，考虑在本地托管这些库
- 确保 AI 响应包含有效的 Markdown 格式

### 文本转语音不可用

**症状：** 朗读按钮被禁用或不工作

**解决方案：**
- 使用支持 Web Speech API 的浏览器（推荐 Chrome、Edge、Safari）
- 检查浏览器的语音合成权限
- 验证页面是否通过 HTTPS 提供（某些浏览器要求）

### 提示词保存失败（403）

**症状：** `userId 参数不一致` 或权限被拒绝

**解决方案：**
- 确保请求中的 `userId` 与会话用户匹配
- 检查会话是否未过期（7 天限制）
- 验证用户存在于 `users.config.json` 中
- 如果会话损坏，清除 cookie 并重新登录

## 📊 推荐服务器规格

| 场景 | vCPU | 内存 | 存储 | 并发用户数 |
|------|------|------|------|-----------|
| 开发/测试 | 2 | 2 GB | 20 GB | 1-5 |
| 小型团队 | 4 | 4-8 GB | 40 GB | 5-20 |
| 中型组织 | 8 | 16 GB | 80 GB | 20-50 |

**注意事项：**
- 生产环境中 Redis 应单独部署或使用托管服务
- 存储需求随上传文件和对话历史而增长
- PM2 集群模式可随 CPU 核心数水平扩展
- 超过 50 个并发用户时考虑使用负载均衡器

## 📜 许可证

MIT
