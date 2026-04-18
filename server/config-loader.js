const fs = require('fs/promises');
const path = require('path');

const DEFAULT_CONFIG_DIR = path.join(process.cwd(), 'config');
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function getConfigDir() {
  return process.env.CONFIG_DIR || DEFAULT_CONFIG_DIR;
}

async function readJsonConfig(fileName) {
  const configDir = getConfigDir();
  const filePath = path.join(configDir, fileName);
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${fileName} 不是有效的 JSON: ${error.message}`);
  }
}

function assertNonEmptyString(value, fieldName, fileName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fileName} 缺少有效字段: ${fieldName}`);
  }
  return value.trim();
}

async function loadPlatformConfig() {
  const fileName = 'platform.config.json';
  const config = await readJsonConfig(fileName);
  return {
    session_secret: assertNonEmptyString(config.session_secret, 'session_secret', fileName)
  };
}

async function loadAdminConfig() {
  const fileName = 'admin.config.json';
  const config = await readJsonConfig(fileName);
  return {
    accessKey: assertNonEmptyString(config.accessKey, 'accessKey', fileName)
  };
}

function assertValidUserId(value, fieldName, fileName) {
  const userId = assertNonEmptyString(value, fieldName, fileName);
  if (!USER_ID_PATTERN.test(userId)) {
    throw new Error(`${fileName} 字段 ${fieldName} 仅支持字母、数字、下划线和中划线`);
  }
  return userId;
}

function normalizeProviderConfig(config, fileName, fieldPrefix) {
  const provider = config && typeof config === 'object' ? config : {};
  return {
    api_url: assertNonEmptyString(provider.api_url, `${fieldPrefix}.api_url`, fileName),
    api_key: assertNonEmptyString(provider.api_key, `${fieldPrefix}.api_key`, fileName),
    api_model: assertNonEmptyString(provider.api_model, `${fieldPrefix}.api_model`, fileName)
  };
}

async function loadUsersConfig() {
  const fileName = 'users.config.json';
  const config = await readJsonConfig(fileName);
  const users = Array.isArray(config?.users) ? config.users : [];

  if (users.length === 0) {
    throw new Error(`${fileName} 至少需要配置一个用户`);
  }

  const seenUserIds = new Set();
  const seenAccessKeys = new Set();

  return users.map((user, index) => {
    const fieldPrefix = `users[${index}]`;
    const userId = assertValidUserId(user?.userId, `${fieldPrefix}.userId`, fileName);
    const accessKey = assertNonEmptyString(user?.accessKey, `${fieldPrefix}.accessKey`, fileName);

    if (seenUserIds.has(userId)) {
      throw new Error(`${fileName} 中存在重复 userId: ${userId}`);
    }
    if (seenAccessKeys.has(accessKey)) {
      throw new Error(`${fileName} 中存在重复 accessKey`);
    }

    seenUserIds.add(userId);
    seenAccessKeys.add(accessKey);

    return {
      userId,
      accessKey,
      provider: normalizeProviderConfig(user?.provider, fileName, `${fieldPrefix}.provider`)
    };
  });
}

module.exports = {
  loadAdminConfig,
  loadPlatformConfig,
  loadUsersConfig,
  getConfigDir
};
