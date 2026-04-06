module.exports = {
  apps: [{
    name: 'reading-helper',
    script: './server/index.js',
    instances: 4,  // 或使用 'max' 自动根据 CPU 核心数
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      CONFIG_DIR: './config',
      USER_DATA_ROOT: './data/users',
      REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M',
    watch: false
  }]
};
