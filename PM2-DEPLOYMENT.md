# PM2 Cluster 模式部署指南（Debian 13）

## 1. 安装 PM2

```bash
# 全局安装 PM2
sudo npm install -g pm2

# 验证安装
pm2 --version
```

## 2. 停止现有 systemd 服务（如果正在运行）

```bash
# 停止服务
sudo systemctl stop reading-helper

# 禁用开机自启
sudo systemctl disable reading-helper

# 删除 systemd 服务文件（可选）
sudo rm /etc/systemd/system/reading-helper.service
sudo systemctl daemon-reload
```

## 3. 配置 PM2

项目已包含 `ecosystem.config.js` 配置文件，根据实际情况修改：

```javascript
// ecosystem.config.js
env: {
  NODE_ENV: 'production',
  PORT: 3000,
  CONFIG_DIR: '/path/to/your/config',      // 修改为实际路径
  USER_DATA_ROOT: '/path/to/your/data/users'  // 修改为实际路径
}
```

## 4. 启动 PM2 Cluster

```bash
# 进入项目目录
cd /path/to/reading-helper-main

# 创建日志目录
mkdir -p logs

# 启动 cluster（使用配置文件）
pm2 start ecosystem.config.js

# 或手动指定参数
pm2 start server/index.js -i 4 --name reading-helper

# 查看运行状态
pm2 status
pm2 logs reading-helper
```

## 5. 配置 PM2 开机自启

```bash
# 生成 systemd 启动脚本
pm2 startup systemd

# 执行上一步输出的命令（类似）：
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your-user --hp /home/your-user

# 保存当前 PM2 进程列表
pm2 save

# 验证自启动配置
sudo systemctl status pm2-your-user
```

## 6. PM2 常用命令

```bash
# 查看状态
pm2 status
pm2 list

# 查看日志
pm2 logs reading-helper
pm2 logs reading-helper --lines 100

# 重启
pm2 restart reading-helper

# 重载（零停机）
pm2 reload reading-helper

# 停止
pm2 stop reading-helper

# 删除
pm2 delete reading-helper

# 监控
pm2 monit

# 查看详细信息
pm2 show reading-helper
```

## 7. 调整 cluster 实例数

```bash
# 动态调整为 8 个实例
pm2 scale reading-helper 8

# 或修改 ecosystem.config.js 后重启
pm2 reload ecosystem.config.js
```

## 8. 系统优化（可选）

```bash
# 增加文件描述符限制
sudo vim /etc/security/limits.conf
# 添加：
# * soft nofile 65535
# * hard nofile 65535

# 重新登录后验证
ulimit -n
```

## 9. 回滚到 systemd（如需要）

```bash
# 停止 PM2
pm2 stop all
pm2 delete all

# 取消 PM2 自启动
pm2 unstartup systemd

# 恢复 systemd 服务
sudo cp reading-helper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable reading-helper
sudo systemctl start reading-helper
```

## 对比：PM2 vs systemd

| 特性 | PM2 Cluster | systemd |
|------|-------------|---------|
| 多进程负载均衡 | ✅ 内置 | ❌ 需手动配置多实例 |
| 零停机重启 | ✅ `pm2 reload` | ❌ 会短暂中断 |
| 实时监控 | ✅ `pm2 monit` | ⚠️ 需额外工具 |
| 日志管理 | ✅ 自动轮转 | ⚠️ 需配合 journald |
| 内存限制 | ✅ `max_memory_restart` | ✅ `MemoryLimit` |
| 开机自启 | ✅ 通过 systemd | ✅ 原生支持 |

## 推荐配置

对于 50 并发用户：
- 4 核服务器：`instances: 4`
- 8 核服务器：`instances: 6-8`
- 或使用 `instances: 'max'` 自动匹配 CPU 核心数
