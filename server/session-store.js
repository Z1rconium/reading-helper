const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');

async function createSessionStore() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('缺少 REDIS_URL 环境变量，无法初始化 Redis Session Store');
  }

  const redisClient = createClient({
    url: redisUrl,
    socket: {
      keepAlive: 30000,       // 每 30s 发送 TCP keepalive，防止连接被防火墙/NAT 静默断开
      connectTimeout: 5000,   // 连接超时 5s
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000)  // 指数退避重连，最长 3s
    }
  });

  redisClient.on('connect', () => {
    console.log('[session] Redis connected');
  });

  redisClient.on('reconnecting', () => {
    console.log('[session] Redis reconnecting');
  });

  redisClient.on('error', (error) => {
    console.error('[session] Redis error:', error.message);
  });

  await redisClient.connect();

  return new RedisStore({
    client: redisClient,
    prefix: process.env.REDIS_SESSION_PREFIX || 'reading-helper:sess:',
    disableTouch: true
  });
}

async function destroyUserSessions(sessionStore, userId) {
  if (!sessionStore || !userId) {
    return 0;
  }

  const sessions = await sessionStore.all();
  const matchingSessions = sessions.filter((session) => (
    session?.authenticated === true
    && session?.role === 'user'
    && session?.userId === userId
    && session?.id
  ));

  await Promise.all(matchingSessions.map((session) => sessionStore.destroy(session.id)));
  return matchingSessions.length;
}

module.exports = {
  createSessionStore,
  destroyUserSessions
};
