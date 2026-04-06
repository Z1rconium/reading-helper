const { RedisStore } = require('connect-redis');
const { createClient } = require('redis');

async function createSessionStore() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('缺少 REDIS_URL 环境变量，无法初始化 Redis Session Store');
  }

  const redisClient = createClient({ url: redisUrl });

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
    prefix: process.env.REDIS_SESSION_PREFIX || 'reading-helper:sess:'
  });
}

module.exports = {
  createSessionStore
};
