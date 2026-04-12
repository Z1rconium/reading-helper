# PM2 部署教程

本教程介绍如何使用 PM2 部署 Reading Helper 项目。

## 前置要求

- Node.js 14+ 和 npm
- Redis 6+
- PM2 (全局安装)
- Git (可选，用于更新)

## 一、安装 PM2

```bash
npm install -g pm2
```

验证安装：
```bash
pm2 --version
```

## 二、下载项目

### 方式 1：从 GitHub 下载最新版本

```bash
# 下载项目压缩包
wget https://github.com/Z1rconium/reading-helper/archive/refs/heads/main.zip

# 解压
unzip main.zip

# 进入项目目录
cd reading-helper-main
```

### 方式 2：使用 Git 克隆（推荐用于后续更新）

```bash
git clone https://github.com/Z1rconium/reading-helper.git
cd reading-helper
```

## 三、配置项目

### 1. 安装依赖

```bash
npm install
```

### 2. 配置文件

创建必要的配置文件：

```bash
# 创建配置目录（如果不存在）
mkdir -p config

# 复制示例配置（如果项目提供了示例文件）
# cp config/platform.config.example.json config/platform.config.json
# cp config/users.config.example.json config/users.config.json
```

编辑 `v`：
```json
{
  "session_secret": "your-random-secret-key-here"
}
```

编辑 `config/users.config.json`：
```json
{
  "users": [
    {
      "userId": "demo",
      "accessKey": "your-access-key",
      "provider": {
        "api_url": "https://api.openai.com/v1/chat/completions",
        "api_key": "sk-your-api-key",
        "api_model": "gpt-4o"
      }
    }
  ]
}
```

### 3. 创建数据目录

```bash
mkdir -p data/users
```

## 四、PM2 配置

项目已包含 `ecosystem.config.js` 配置文件。查看配置：

```bash
cat ecosystem.config.js
```

默认配置内容：
```javascript
module.exports = {
  apps: [{
    name: 'reading-helper',
    script: './server/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      CONFIG_DIR: './config',
      USER_DATA_ROOT: './data/users',
      REDIS_URL: 'redis://127.0.0.1:6379'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
  }]
}
```

如需自定义配置，可编辑 `ecosystem.config.js` 文件。

启动前请确认 Redis 可连通（示例）：

```bash
redis-cli -u redis://127.0.0.1:6379 ping
```

## 五、启动服务

### 1. 使用 PM2 启动

```bash
# 启动应用
pm2 start ecosystem.config.js

# 或者直接启动（使用默认配置）
pm2 start server/index.js --name reading-helper
```

### 2. 查看运行状态

```bash
# 查看所有应用
pm2 list

# 查看详细信息
pm2 show reading-helper

# 查看日志
pm2 logs reading-helper

# 实时监控
pm2 monit
```

### 3. 设置开机自启

```bash
# 保存当前 PM2 进程列表
pm2 save

# 生成开机启动脚本
pm2 startup

# 按照提示执行命令（通常需要 sudo）
# 例如：sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your-username --hp /home/your-username
```

## 六、常用管理命令

### 应用控制

```bash
# 重启应用
pm2 restart reading-helper

# 停止应用
pm2 stop reading-helper

# 删除应用
pm2 delete reading-helper

# 重载应用（零停机时间）
pm2 reload reading-helper

# 优雅重启（等待请求完成）
pm2 gracefulReload reading-helper
```

### 日志管理

```bash
# 查看实时日志
pm2 logs reading-helper

# 查看错误日志
pm2 logs reading-helper --err

# 清空日志
pm2 flush

# 重载日志（日志轮转后使用）
pm2 reloadLogs
```

### 监控和调试

```bash
# 实时监控
pm2 monit

# 查看详细信息
pm2 describe reading-helper

# 查看环境变量
pm2 env 0
```

## 七、更新部署

### 方式 1：使用 wget 下载新版本

```bash
# 停止服务
pm2 stop reading-helper

# 备份当前版本
cd ..
mv reading-helper-main reading-helper-backup-$(date +%Y%m%d)

# 下载新版本
wget https://github.com/Z1rconium/reading-helper/archive/refs/heads/main.zip
unzip main.zip
cd reading-helper-main

# 恢复配置和数据
cp -r ../reading-helper-backup-*/config ./
cp -r ../reading-helper-backup-*/data ./

# 安装依赖
npm install

# 重启服务
pm2 restart reading-helper
```

### 方式 2：使用 Git 更新（推荐）

```bash
# 停止服务
pm2 stop reading-helper

# 拉取最新代码
git pull origin main

# 安装新依赖
npm install

# 重启服务
pm2 restart reading-helper
```

## 八、反向代理配置（可选）

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE 支持
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

配置 HTTPS 后，记得修改 `server/index.js` 中的 session cookie 设置：
```javascript
secure: true  // 启用 HTTPS 时设置为 true
```

## 九、故障排查

### 应用无法启动

```bash
# 查看错误日志
pm2 logs reading-helper --err

# 检查端口占用
lsof -i :3000

# 检查配置文件
cat config/platform.config.json
cat config/users.config.json
```

### 内存占用过高

```bash
# 查看内存使用
pm2 list

# 设置内存限制（在 ecosystem.config.js 中）
max_memory_restart: '500M'

# 重启应用
pm2 restart reading-helper
```

### 日志文件过大

```bash
# 安装日志轮转模块
pm2 install pm2-logrotate

# 配置日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

## 十、性能优化建议

1. **Cluster 模式**：已在 `ecosystem.config.js` 中配置，充分利用多核 CPU
2. **内存限制**：设置 `max_memory_restart` 防止内存泄漏
3. **日志管理**：使用 `pm2-logrotate` 自动轮转日志
4. **监控告警**：使用 PM2 Plus (keymetrics.io) 进行高级监控
5. **负载均衡**：使用 Nginx 作为反向代理，可配置多个实例

## 相关资源

- PM2 官方文档：https://pm2.keymetrics.io/docs/usage/quick-start/
- Reading Helper 项目：https://github.com/Z1rconium/reading-helper
- Node.js 最佳实践：https://github.com/goldbergyoni/nodebestpractices
