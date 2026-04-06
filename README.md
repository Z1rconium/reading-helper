# Reading Helper

一个基于 Node.js + Express 的英语阅读助手。前端为单页静态页面，后端负责用户鉴权、文件与对话持久化、提示词管理，并以 SSE 方式转发上游 AI 响应。支持多用户隔离，每位用户使用自己的模型配置与提示词。

## 功能与特性（全量清单）

- 基于 `accessKey` 的多用户登录，Session 保持 7 天
- 登录限流：15 分钟窗口最多 5 次失败尝试
- CSRF 防护：Cookie + Header 双重校验
- 支持 `.txt` / `.text` 上传、列表、读取、删除，允许中文文件名
- 文件删除时同步清理该文章下的全部对话记录
- 文章阅读区支持拖拽调节面板宽度、字体大小调整
- 支持选词 / 选句 / 选段并触发 AI 功能
- 朗读功能：基于 Web Speech API，可调语速/音量/音调
- 文章上下文开关：可在问答中附带全文（最长 12000 字符）
- 多轮对话持久化：按“文章 + 会话”维度分文件保存
- 历史对话列表：按更新时间排序，可加载/删除
- SSE 流式响应：逐 token 渲染 AI 输出
- 上游 API 自动识别并适配
- OpenAI Chat Completions
- OpenAI Responses API
- Anthropic Messages API
- 提示词管理：每用户拥有独立提示词副本
- 默认提示词模板从 `config/prompts/` 首次自动拷贝
- 前端支持提示词列表浏览、编辑、保存
- 结构化输出渲染与交互
- 语法分析 JSON → 树形结构渲染（可折叠）
- 多项选择题 JSON → 可选项渲染与正确性提示
- 判断题 JSON → True/False 交互
- 开放题 JSON → 可展开答案
- 思维导图 Markdown → Markmap 可视化
- CET4/CET6 词汇标注：可一键标注/取消
- 输出安全处理
- 后端 `sanitize-html` 清洗 AI 输出
- 前端 `DOMPurify` 二次清洗
- 启动时自动清理不在配置文件中的“孤立用户数据”目录

## 内置 AI 功能（基于提示词模板）

- 单词解释（词性、音标、搭配、例句、同反义词）
- 句子分析（语法结构、要点、改写、翻译）
- 彩虹拆句（JSON 语法树 + 结构标注）
- 段落翻译
- 段落概括 + 概括评价
- 文章思维导图
- 全文开放题（10 题）
- 全文多项选择题（10 题）
- 全文判断题（10 题）
- 通用问答（可选是否带文章上下文）

## 技术架构（基本分析）

整体分为三层：前端单页、后端 API、持久化与上游 AI。

```
Browser (public/index.html)
  |  静态资源 + JS 逻辑
  |  登录 / 上传 / 对话 / SSE
  v
Express API (server/index.js)
  |  Session (Redis)
  |  文件/对话/提示词
  |  AI 代理 (SSE)
  v
Storage & Upstream
  - Redis: Session
  - FS: data/users/<userId>/uploads, prompts, chats
  - Upstream AI: OpenAI / Anthropic / 自建网关
```

关键模块说明：

- `public/index.html`: 单文件前端（UI + 业务逻辑）
- `server/index.js`: 路由、鉴权、上传、对话、AI 代理
- `server/session-store.js`: Redis Session Store 初始化
- `server/file-store.js`: 上传文件读写与校验
- `server/chat-store.js`: 对话持久化、旧格式迁移、输出清洗
- `server/prompt-store.js`: 提示词默认模板同步与读写
- `server/user-paths.js`: 用户数据目录规划
- `server/csrf-protection.js`: CSRF Cookie/Header 校验
- `server/cleanup-orphaned-users.js`: 清理孤立用户目录

## 目录结构

```
.
├── config/
│   ├── platform.config.json
│   ├── users.config.json
│   └── prompts/*.md
├── data/
│   └── users/<userId>/{uploads,prompts,chats}/
├── public/
│   └── index.html
├── server/
│   └── *.js
├── ecosystem.config.js
├── PM2_DEPLOYMENT.md
└── package.json
```

## 运行环境

- Node.js >= 18
- Redis >= 6
- 可访问的上游 AI API

## 安装与启动

```bash
npm install

# 开发模式
npm run dev

# 生产模式
CONFIG_DIR=./config USER_DATA_ROOT=./data/users REDIS_URL=redis://127.0.0.1:6379 npm start
```

默认监听 `http://localhost:3000`。

## 配置文件

### config/platform.config.json

```json
{
  "session_secret": "REPLACE_WITH_REAL_SESSION_SECRET"
}
```

### config/users.config.json

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

规则要点：

- `userId` 仅允许字母、数字、下划线、中划线
- `accessKey` 不可重复
- `provider.api_url` 自动识别 Chat Completions / Responses / Anthropic Messages

## 常用环境变量

- `PORT` 默认 3000
- `CONFIG_DIR` 默认 `./config`
- `USER_DATA_ROOT` 默认 `./data/users`
- `DATA_DIR` 兼容旧参数，会映射为其父目录下的 `users`
- `REDIS_URL` 必填，Redis 连接地址
- `REDIS_SESSION_PREFIX` Session Key 前缀，默认 `reading-helper:sess:`
- `MAX_UPLOAD_BYTES` 单次上传上限，默认 2MB
- `SESSION_STORE_DIR` 预留：Session 文件目录（仅在未来改为文件存储时有用）
- `TRUST_PROXY` Express trust proxy（支持 `true/false/数字`）

## PM2 部署方式

项目已提供 `ecosystem.config.js`，建议直接使用。

```bash
# 安装 PM2
npm install -g pm2

# 安装依赖
npm install

# 启动
pm2 start ecosystem.config.js

# 查看状态/日志
pm2 list
pm2 logs reading-helper
```

常用命令：

```bash
pm2 restart reading-helper
pm2 stop reading-helper
pm2 delete reading-helper
pm2 reload reading-helper
```

开机自启：

```bash
pm2 save
pm2 startup
# 按提示执行命令（可能需要 sudo）
```

建议将 `REDIS_URL` 等敏感配置通过环境变量注入（避免写入仓库）。

## 反向代理建议（SSE 必须）

若使用 Nginx，请确保 SSE 不被缓冲：

```nginx
location / {
  proxy_pass http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
  proxy_read_timeout 86400;
}
```

## 常见问题与解决方案

- 启动时报错 `缺少 REDIS_URL`
解决：设置 `REDIS_URL` 环境变量并确保 Redis 可连接。

- 登录/请求提示 `CSRF token 缺失/验证失败`
解决：确保前端能正常写入 Cookie；反向代理需保留 `Set-Cookie` 与 `Cookie` 头；跨域访问请保持同域或配置正确的 `Origin` 与 `credentials`。

- SSE 无法流式输出或经常中断
解决：关闭代理缓冲（Nginx `proxy_buffering off`），并提高 `proxy_read_timeout`。

- AI 响应为空或解析失败
解决：检查上游 `api_url` 是否为 Chat Completions / Responses / Anthropic Messages 的正确地址；确认 `api_key` 与 `api_model`。

- “思维导图”无法打开
解决：检查 `markmap-view` 与 `d3` CDN 是否可访问；或自行改为本地静态资源。

- 朗读按钮不可用
解决：浏览器需支持 Web Speech API（建议 Chrome / Edge / Safari）。

- 词汇标注无效
解决：确认 `config/cet_word_list.txt` 存在，并且接口 `/api/cet-word-list` 未被代理拦截。

- 提示词保存失败（403）
解决：前端请求中 `userId` 必须与 Session 中一致，检查是否多用户混用或 Cookie 丢失。

## 推荐服务器配置

以下为单实例（PM2 Cluster 可按核数扩展）的建议配置：

- 轻量体验（1-5 用户并发）：2 vCPU / 2 GB RAM / 20 GB SSD
- 小团队（5-20 用户并发）：4 vCPU / 4-8 GB RAM / 40 GB SSD
- 中等规模（20-50 用户并发）：8 vCPU / 16 GB RAM / 80 GB SSD

Redis 建议独立部署或使用托管服务，避免与应用进程争抢内存。

## License

MIT
