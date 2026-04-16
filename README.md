# 📚 Reading Helper

> 基于 AI 的多用户英语阅读辅助平台，支持词汇解释、句子分析、段落总结、思维导图生成、题目生成、API 连通性检查等功能

## 项目概述

Reading Helper 是一个全栈 Web 应用，为英语学习者提供智能阅读辅助。用户可以上传英文文章，通过 AI 对话获得词汇解释、语法分析、内容总结、思维导图和全文题目等帮助。系统支持多用户隔离、会话持久化、CET 词汇高亮、语音朗读等功能。

**核心特性：**
- 🔐 基于 Redis 的会话认证系统
- 👥 多用户数据完全隔离
- 🤖 支持多种 AI 提供商（OpenAI、Anthropic、自定义 API）
- 🩺 一键检查 AI API 连通性（错误码 + 安全文案 + 摘要）
- 💬 对话历史 SQLite 持久化（每篇文章支持多个独立会话，自动迁移旧数据）
- 📝 可自定义系统提示词模板
- 🎯 CET4/CET6 词汇智能高亮
- 🔊 Edge TTS 语音朗读
- 🧠 思维导图可视化（基于 D3.js + markmap）
- 🧩 全文问答题、选择题、判断题生成与容错解析
- 🔒 CSRF 保护 + 验证码防护（Cloudflare Turnstile）
- ⚡ PM2 集群模式部署
- 🚀 首页按需加载，降低首屏脚本执行开销

## 技术架构

### 后端技术栈
- **运行时**: Node.js ≥18
- **框架**: Express.js
- **会话存储**: Redis + connect-redis
- **对话存储**: SQLite + better-sqlite3
- **文件上传**: Multer
- **HTML 清理**: sanitize-html
- **压缩**: compression (Gzip/Brotli)
- **安全**: express-rate-limit, CSRF token, Cloudflare Turnstile

### 前端技术栈
- **原生 JavaScript**（核心壳子 + 按需模块）
- **CSS** (~2300 行，语义化设计)
- **可视化**: D3.js + markmap
- **语音**: Web Speech API + Edge TTS

### 数据流架构

```
┌─────────────┐
│   用户登录   │ ──> accessKey 验证 + Cloudflare Turnstile
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│              Express 中间件层                    │
│  Session │ CSRF │ Rate Limit │ Compression      │
└──────────────────┬──────────────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐
│ 文件管理  │ │ 提示词库  │ │ 对话存储      │
│  .txt    │ │  .md     │ │ SQLite / WAL │
└──────────┘ └──────────┘ └──────────────┘
       │           │           │
       └───────────┼───────────┘
                   ▼
        ┌─────────────────────┐
        │   AI 提供商抽象层    │
        │ OpenAI / Anthropic  │
        │   自定义 API 端点    │
        └──────────┬──────────┘
                   │
                   ▼
            SSE 流式响应
```

## 项目结构

```
reading-helper/
├── server/                          # 后端服务
│   ├── index.js                     # 主服务器
│   ├── config-loader.js             # 配置加载器
│   ├── session-store.js             # Redis 会话存储
│   ├── csrf-protection.js           # CSRF 防护
│   ├── file-store.js                # 文件上传/管理
│   ├── prompt-store.js              # 提示词模板管理
│   ├── chat-store.js                # 对话历史业务逻辑
│   ├── chat-db.js                   # SQLite 对话存储
│   ├── chat-migrate.js              # 旧版对话数据迁移
│   ├── preferences-store.js         # 用户偏好设置
│   ├── user-paths.js                # 用户路径计算
│   └── cleanup-orphaned-users.js    # 孤立数据清理
│
├── public/                          # 前端资源
│   ├── index.html                   # 主页面
│   ├── css/
│   │   └── main.css                 # 应用样式 (~2300 行)
│   └── js/
│       ├── main.js                  # 懒加载注册入口
│       ├── app.js                   # 首屏核心壳子（认证/文件列表/基础聊天）
│       ├── core/
│       │   ├── state.js             # 状态管理
│       │   └── dom.js               # DOM 操作
│       ├── utils/
│       │   ├── api.js               # API 客户端
│       │   └── helpers.js           # 工具函数
│       ├── modules/
│       │   ├── article-renderer.js  # 文章渲染 + CET 词汇高亮
│       │   ├── prompt-manager.js    # 提示词编辑器
│       │   ├── speech.js            # 语音朗读
│       │   ├── mindmap.js           # 思维导图
│       │   ├── quiz.js              # 题目/语法树结构化渲染
│       │   └── vocab.js             # 旧模块占位（保留）
│
├── config/                          # 配置文件
│   ├── platform.config.json         # 平台配置（会话密钥）
│   ├── users.config.json            # 用户配置（API 密钥）
│   └── prompts/                     # 默认提示词模板
│       ├── explain-word.md
│       ├── analyze-sentence.md
│       ├── summarize-paragraph.md
│       ├── mindmap.md
│       └── ...
│
├── data/users/                      # 用户数据目录
│   └── <userId>/
│       ├── uploads/                 # 上传的文章
│       ├── chats/chat.sqlite        # 对话历史 SQLite 数据库
│       ├── chats/chat.sqlite-wal    # SQLite WAL 日志（运行时）
│       ├── chats/chat.sqlite-shm    # SQLite 共享内存文件（运行时）
│       ├── prompts/                 # 用户自定义提示词
│       └── preferences.json         # 用户偏好设置
│
├── ecosystem.config.js              # PM2 配置
├── scripts/update-project.sh        # 拉取上游并保留本地配置
└── package.json
```

## 核心功能

### 1. 用户认证与会话管理
- **登录验证**: 基于 `accessKey` 的无密码认证
- **验证码保护**: Cloudflare Turnstile（无需用户交互的智能验证）
- **会话持久化**: Redis 存储，30 分钟无活动超时
- **登录限流**: 15 分钟内最多 5 次尝试
- **CSRF 防护**: Cookie + Header 双重验证

### 2. 文件管理
- **支持格式**: `.txt`, `.text`, `.md`
- **文件大小**: 默认 2MB 上限（可配置）
- **中文文件名**: 完整支持
- **路径安全**: 防止路径遍历攻击
- **关联清理**: 删除文章时自动清理对话历史
- **轻量列表接口**: 文件列表仅返回文件名数组，上传/删除后前端本地增删

### 3. AI 对话系统
- **多提供商支持**:
  - OpenAI Chat Completions API
  - Anthropic Messages API
  - OpenAI Responses API
  - 自定义兼容端点
- **自动检测**: 根据 `api_url` 自动选择请求格式
- **流式响应**: SSE (Server-Sent Events) 实时输出
- **SSE 压缩绕过**: `/api/ai/chat/stream` 与 `/api/tts` 默认跳过 `compression`，降低首 token 延迟
- **连接复用**: HTTP Keep-Alive 连接池（最多 10 个连接）
- **超时控制**: 120 秒请求超时
- **连通性检测**: 聊天区「检查连通性」按钮触发最小探测请求（`max_tokens=1, stream=false`）
- **安全错误映射**: 返回 `errorCode + message + summary`，避免透传上游完整报错

### 4. 提示词模板系统
- **预置模板**: 11 种场景（词汇解释、句子分析、段落总结等）
- **用户隔离**: 每个用户独立编辑，互不影响
- **首次复制**: 从 `config/prompts/` 自动复制到用户目录
- **实时保存**: 编辑后立即持久化
- **轻量列表接口**: 提示词列表仅返回文件名数组

### 5. 对话历史管理
- **多会话支持**: 每篇文章可创建多个独立对话
- **SQLite 持久化**: 每个用户的聊天记录集中保存在 `data/users/<userId>/chats/chat.sqlite`
- **自动迁移**: 旧版 JSON 对话数据按文章自动迁移到 SQLite
- **UUID 标识**: 每个会话使用唯一 ID
- **WAL 模式**: 启用 SQLite WAL，降低并发读写冲突
- **HTML 清理**: 响应内容自动清理 XSS 风险标签

### 6. 前端增强功能
- **CET 词汇高亮**: 服务端缓存词表，前端实时标注
- **语音朗读**: Edge TTS 流式代理（零内存缓冲）
- **思维导图**: D3.js + markmap 可视化
- **题目渲染**: 支持开放题、选择题、判断题和语法树展示
- **容错恢复**: 结构化 JSON 输出不完整时尝试恢复题目数据
- **真实懒加载**: `tts`、`mindmap`、`quiz/json-recovery`、`prompt-manager`、`article-renderer` 首次触发时才加载
- **响应式设计**: 适配桌面和移动端

## 快速开始

### 环境要求
- Node.js ≥ 18
- Redis ≥ 6（必须运行）
- SQLite 无需额外安装服务（通过 `better-sqlite3` 内嵌使用）

### 安装依赖
```bash
npm install
```

### 配置环境变量
```bash
export REDIS_URL="redis://127.0.0.1:6379"
export TURNSTILE_SECRET_KEY="your-cloudflare-turnstile-secret"
```

### 配置用户
编辑 `config/users.config.json`:
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

### 启动服务

**开发模式（热重载）:**
```bash
npm run dev
```

**生产模式:**
```bash
npm start
```

**自定义路径:**
```bash
REDIS_URL="redis://127.0.0.1:6379" \
CONFIG_DIR=./config \
USER_DATA_ROOT=./data/users \
npm start
```

访问 `http://localhost:3000`

说明:
- `REDIS_URL` 为必填；未设置时服务会在启动阶段直接失败。
- 当前 `npm start` 只启动 Node 服务，不会自动注入 Redis 或 Turnstile 环境变量。

## PM2 部署

### 启动集群
```bash
pm2 start ecosystem.config.js
```

### 管理命令
```bash
pm2 list                    # 查看状态
pm2 logs reading-helper     # 查看日志
pm2 restart reading-helper  # 重启服务
pm2 reload reading-helper   # 零停机重载
pm2 stop reading-helper     # 停止服务
pm2 delete reading-helper   # 删除进程
```

### Nginx 反向代理配置
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # SSE 关键配置
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
        
        # 请求头转发
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支持（可选）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Systemd 服务配置
```ini
[Unit]
Description=Reading Helper Service
After=network.target redis.service

[Service]
Type=forking
User=your-user
WorkingDirectory=/path/to/reading-helper
Environment="REDIS_URL=redis://127.0.0.1:6379"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/pm2 start ecosystem.config.js
ExecReload=/usr/bin/pm2 reload reading-helper
ExecStop=/usr/bin/pm2 stop reading-helper
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `REDIS_URL` | — | **必需**: Redis 连接字符串 |
| `CONFIG_DIR` | `./config` | 配置文件目录 |
| `USER_DATA_ROOT` | `./data/users` | 用户数据根目录 |
| `MAX_UPLOAD_BYTES` | `2097152` | 最大上传文件大小（2MB） |
| `NODE_ENV` | — | 设为 `production` 启用生产优化 |
| `TRUST_PROXY` | `1` | 信任代理头（Nginx 后需设置） |
| `TURNSTILE_SECRET_KEY` | — | **必需**: Cloudflare Turnstile 密钥 |
| `CF_TURNSTILE_SECRET_KEY` | — | Turnstile 密钥（备用环境变量名） |

## API 接口（连通性检查）

### `POST /api/ai/connectivity-check`
- **用途**: 检查当前登录用户配置的上游 AI API 是否可达
- **鉴权**: 需要已登录会话（`reading_helper_sid`）+ `X-CSRF-Token`
- **请求体**: 无
- **成功响应示例**:
```json
{
  "ok": true,
  "latencyMs": 328,
  "status": 200
}
```
- **失败响应示例**:
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

常见 `errorCode`:
- `AUTH_FAILED`: API Key 无效或无权限
- `ENDPOINT_NOT_FOUND`: `api_url` 路径不存在
- `RATE_LIMITED`: 触发上游限流
- `UPSTREAM_UNAVAILABLE`: 上游 5xx
- `TIMEOUT`: 10 秒探测超时
- `NETWORK_ERROR`: 网络连接失败（如连接被拒绝/重置）
- `DNS_ERROR`: 域名解析失败

## 常见问题

### 1. Redis 连接失败
**问题**: `Error: connect ECONNREFUSED 127.0.0.1:6379`

**解决**:
```bash
# 检查 Redis 是否运行
redis-cli ping

# 启动 Redis
redis-server

# 或使用系统服务
sudo systemctl start redis
```

### 2. SSE 流式响应中断
**问题**: AI 响应在 Nginx 后被缓冲

**解决**: 确保 Nginx 配置包含:
```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 120s;
```

补充:
- 服务端已对 `/api/ai/chat/stream` 和 `/api/tts` 跳过 `compression`，避免流式内容被压缩延迟。

### 3. 会话频繁过期
**问题**: 用户需要频繁重新登录

**解决**: 检查 Redis 持久化配置，确保数据不会丢失:
```bash
# redis.conf
save 900 1
save 300 10
save 60 10000
```

### 4. 文件上传失败
**问题**: 上传大文件时返回 413 错误

**解决**:
- 调整环境变量: `MAX_UPLOAD_BYTES=5242880` (5MB)
- Nginx 配置: `client_max_body_size 5M;`

### 5. PM2 内存占用过高
**问题**: 进程内存超过限制自动重启

**解决**: 调整 `ecosystem.config.js`:
```javascript
max_memory_restart: '1G',  // 增加内存限制
instances: 2,              // 减少实例数
```

### 6. Turnstile 验证码加载失败
**问题**: 验证码组件无法显示

**解决**:
- 检查 `TURNSTILE_SECRET_KEY` 环境变量是否设置
- 确认网络可访问 `challenges.cloudflare.com`
- 验证 Turnstile Site Key 是否正确配置在前端
- 查看浏览器控制台错误信息

### 7. AI 请求超时
**问题**: 长文本处理时返回 504 错误

**解决**:
- 增加 Nginx 超时: `proxy_read_timeout 180s;`
- 代码中已设置 120 秒超时，可在 `server/index.js:48` 调整

### 8. 孤立用户数据未清理
**问题**: 删除用户后数据目录仍存在

**解决**: 重启服务，系统会在启动时自动清理（仅 PM2 实例 0 执行）

### 9. 聊天记录未恢复或迁移后找不到
**问题**: 升级后历史对话没有出现在页面中

**解决**:
- 确认用户目录下存在 `data/users/<userId>/chats/chat.sqlite`
- 若目录下仍有旧版 JSON 对话文件，访问对应文章一次以触发自动迁移
- 检查服务日志中是否有 SQLite 打开失败或迁移异常信息

### 10. 连通性检查失败（AUTH_FAILED / ENDPOINT_NOT_FOUND）
**问题**: 点击“检查连通性”后返回鉴权失败或端点不存在

**解决**:
- 检查 `config/users.config.json` 中 `provider.api_key` 是否有效
- 检查 `provider.api_url` 是否为正确的 API 端点（含完整路径）
- 检查 `provider.api_model` 是否被当前端点支持

## 推荐服务器规格

### 小型部署（1-10 用户）
- **CPU**: 2 核
- **内存**: 2GB
- **存储**: 20GB SSD
- **带宽**: 5Mbps
- **PM2 实例数**: 2

**推荐配置**:
```javascript
// ecosystem.config.js
instances: 2,
max_memory_restart: '500M'
```

### 中型部署（10-50 用户）
- **CPU**: 4 核
- **内存**: 4GB
- **存储**: 50GB SSD
- **带宽**: 10Mbps
- **PM2 实例数**: 4

**推荐配置**:
```javascript
instances: 4,
max_memory_restart: '800M'
```

### 大型部署（50+ 用户）
- **CPU**: 8 核
- **内存**: 8GB+
- **存储**: 100GB SSD
- **带宽**: 20Mbps+
- **PM2 实例数**: 根据 CPU 核心数

**推荐配置**:
```javascript
instances: 'max',  // 自动匹配 CPU 核心数
max_memory_restart: '1G'
```

### Redis 配置建议
- **小型**: 512MB 内存，单实例
- **中型**: 1GB 内存，启用持久化
- **大型**: 2GB+ 内存，主从复制 + 持久化

### 性能优化建议
1. **启用 Redis 持久化**: 防止会话丢失
2. **配置 Nginx 缓存**: 静态资源缓存 7 天
3. **启用 Gzip/Brotli**: 已内置，确保 Nginx 不重复压缩
4. **监控内存使用**: 系统每 5 分钟自动记录
5. **日志轮转**: 使用 PM2 日志管理或 logrotate

## 安全建议

1. **生产环境必须**:
   - 使用 HTTPS（Let's Encrypt 免费证书）
   - 设置强 `sessionSecret`（`config/platform.config.json`）
   - 定期更新依赖: `npm audit fix`
   - 限制 Redis 访问（绑定 127.0.0.1 或使用密码）

2. **用户管理**:
   - 使用强 `accessKey`（至少 32 字符随机字符串）
   - 定期轮换 API 密钥
   - 不要在日志中记录敏感信息

3. **防火墙规则**:
   ```bash
   # 仅开放必要端口
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw allow 22/tcp
   ufw enable
   ```

## 开发指南

### 配置 Cloudflare Turnstile
1. 在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 创建 Turnstile 站点
2. 获取 Site Key 和 Secret Key
3. 在 `public/index.html` 中配置 Site Key（`data-sitekey` 属性）
4. 设置环境变量 `TURNSTILE_SECRET_KEY`

### 手动测试清单
- [ ] 登录/登出流程（含验证码）
- [ ] 文件上传（中文文件名 + .md 文件）
- [ ] 文件列表和内容读取
- [ ] 文件删除（及关联对话清理）
- [ ] 提示词列表和保存
- [ ] 创建/追加/清空/删除对话
- [ ] SQLite 聊天记录持久化（服务重启后仍可读取）
- [ ] 旧版 JSON 对话迁移到 SQLite
- [ ] SSE 流式响应（Chat Completions + Responses API）
- [ ] 「检查连通性」按钮（成功/超时/401/429 场景）
- [ ] TTS 语音朗读（不同声音和参数）
- [ ] Redis 会话持久化（服务重启后）
- [ ] 会话 30 分钟超时
- [ ] 内存监控日志（每 5 分钟）
- [ ] 慢请求日志（>1 秒）

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

**Powered by Shayne Wong** | [报告问题](https://github.com/Z1rconium/reading-helper/issues)
