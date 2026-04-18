const fs = require('fs/promises');
const path = require('path');

const { getConfigDir, normalizeUsersConfig } = require('./config-loader');

const USERS_CONFIG_FILE = 'users.config.json';

function createUsersConfigError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function buildSnapshot(users, mtimeMs) {
  const normalizedUsers = users.map((user) => ({
    userId: user.userId,
    accessKey: user.accessKey,
    provider: {
      api_url: user.provider.api_url,
      api_key: user.provider.api_key,
      api_model: user.provider.api_model
    }
  }));

  const usersById = new Map();
  const usersByAccessKey = new Map();

  normalizedUsers.forEach((user) => {
    usersById.set(user.userId, user);
    usersByAccessKey.set(user.accessKey, user);
  });

  return {
    users: normalizedUsers,
    usersById,
    usersByAccessKey,
    mtimeMs
  };
}

function validateReservedAccessKeys(users, reservedAccessKeys) {
  for (const user of users) {
    if (reservedAccessKeys.has(user.accessKey)) {
      throw createUsersConfigError('admin.config.json 中的 accessKey 不能与普通用户重复', 'RESERVED_ACCESS_KEY');
    }
  }
}

function serializeUsersConfig(users) {
  return `${JSON.stringify({ users }, null, 2)}\n`;
}

function createUsersConfigManager(options = {}) {
  const reservedAccessKeys = new Set(
    Array.isArray(options.reservedAccessKeys) ? options.reservedAccessKeys.filter(Boolean) : []
  );
  const filePath = path.join(getConfigDir(), USERS_CONFIG_FILE);
  let snapshot = null;
  let pendingLoad = null;

  async function readUsersFromDisk() {
    const raw = await fs.readFile(filePath, 'utf8');
    let parsed = null;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw createUsersConfigError(`${USERS_CONFIG_FILE} 不是有效的 JSON: ${error.message}`, 'INVALID_JSON');
    }

    const users = normalizeUsersConfig(parsed, USERS_CONFIG_FILE);
    validateReservedAccessKeys(users, reservedAccessKeys);
    const stat = await fs.stat(filePath);

    return buildSnapshot(users, stat.mtimeMs);
  }

  async function getSnapshot(options = {}) {
    const forceReload = !!options.forceReload;

    if (pendingLoad) {
      return pendingLoad;
    }

    if (!forceReload && snapshot) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs === snapshot.mtimeMs) {
          return snapshot;
        }
      } catch (error) {
        if (!snapshot) {
          throw error;
        }
      }
    }

    pendingLoad = readUsersFromDisk()
      .then((nextSnapshot) => {
        snapshot = nextSnapshot;
        return snapshot;
      })
      .catch((error) => {
        if (!snapshot) {
          throw error;
        }

        console.error(`[UsersConfig] Reload failed, keeping previous snapshot: ${error.message}`);
        return snapshot;
      })
      .finally(() => {
        pendingLoad = null;
      });

    return pendingLoad;
  }

  async function writeUsers(users) {
    const normalizedUsers = normalizeUsersConfig({ users }, USERS_CONFIG_FILE);
    validateReservedAccessKeys(normalizedUsers, reservedAccessKeys);

    const tempFilePath = path.join(
      getConfigDir(),
      `${USERS_CONFIG_FILE}.${process.pid}.${Date.now()}.tmp`
    );

    await fs.writeFile(tempFilePath, serializeUsersConfig(normalizedUsers), 'utf8');
    await fs.rename(tempFilePath, filePath);

    const stat = await fs.stat(filePath);
    snapshot = buildSnapshot(normalizedUsers, stat.mtimeMs);
    return snapshot;
  }

  async function listUsers() {
    const currentSnapshot = await getSnapshot();
    return currentSnapshot.users;
  }

  async function getUserById(userId) {
    const currentSnapshot = await getSnapshot();
    return currentSnapshot.usersById.get(userId) || null;
  }

  async function getUserByAccessKey(accessKey) {
    const currentSnapshot = await getSnapshot();
    return currentSnapshot.usersByAccessKey.get(accessKey) || null;
  }

  async function addUser(user) {
    const currentSnapshot = await getSnapshot();
    const [normalizedUser] = normalizeUsersConfig({ users: [user] }, USERS_CONFIG_FILE);

    if (currentSnapshot.usersById.has(normalizedUser.userId)) {
      throw createUsersConfigError(`用户已存在: ${normalizedUser.userId}`, 'USER_ID_EXISTS');
    }

    if (currentSnapshot.usersByAccessKey.has(normalizedUser.accessKey)) {
      throw createUsersConfigError('accessKey 已存在', 'ACCESS_KEY_EXISTS');
    }

    const nextSnapshot = await writeUsers([...currentSnapshot.users, normalizedUser]);
    return nextSnapshot.usersById.get(normalizedUser.userId) || normalizedUser;
  }

  async function deleteUser(userId) {
    const currentSnapshot = await getSnapshot();
    const targetUser = currentSnapshot.usersById.get(userId) || null;

    if (!targetUser) {
      return null;
    }

    await writeUsers(currentSnapshot.users.filter((user) => user.userId !== userId));
    return targetUser;
  }

  return {
    getConfigPath: () => filePath,
    getSnapshot,
    listUsers,
    getUserById,
    getUserByAccessKey,
    addUser,
    deleteUser
  };
}

module.exports = {
  createUsersConfigError,
  createUsersConfigManager
};
