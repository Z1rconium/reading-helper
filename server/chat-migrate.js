const fs = require('fs/promises');
const path = require('path');
const { getUserChatDir } = require('./user-paths');

const MAX_CONVERSATION_ID_LENGTH = 128;
const migratedArticles = new Set();
const migrationLocks = new Map();

function createChatStoreError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getArticleSafeName(articleName) {
  return Buffer.from(articleName, 'utf8').toString('base64url');
}

function getLegacyStorePath(userId, articleName) {
  return path.join(getUserChatDir(userId), `${getArticleSafeName(articleName)}.json`);
}

function getArticleDir(userId, articleName) {
  return path.join(getUserChatDir(userId), getArticleSafeName(articleName));
}

function isValidConversationId(conversationId) {
  if (typeof conversationId !== 'string') return false;
  if (!conversationId || conversationId.length > MAX_CONVERSATION_ID_LENGTH) return false;
  return /^[a-zA-Z0-9-]+$/.test(conversationId);
}

async function readJsonFile(filePath, malformedMessage) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw createChatStoreError(malformedMessage, 'MALFORMED_CHAT_STORE');
  }
}

async function removeDirIfEmpty(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    if (entries.length === 0) {
      await fs.rmdir(dirPath);
    }
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTEMPTY')) {
      return;
    }
    throw error;
  }
}

async function migrateLegacyFile(userId, articleName, options, existingIds) {
  const legacyPath = getLegacyStorePath(userId, articleName);
  const parsed = await readJsonFile(legacyPath, '历史记录迁移失败：旧文件无法解析');
  if (!parsed) {
    return;
  }

  const conversations = Array.isArray(parsed?.conversations) ? parsed.conversations : [];
  for (const item of conversations) {
    const normalized = options.normalizeConversation(item);
    if (!normalized) {
      continue;
    }

    if (!existingIds.has(normalized.id)) {
      await options.insertConversationIfAbsent(userId, articleName, normalized);
      existingIds.add(normalized.id);
    }
  }

  await fs.unlink(legacyPath).catch((error) => {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  });
}

async function migrateConversationFiles(userId, articleName, options, existingIds) {
  const articleDir = getArticleDir(userId, articleName);

  let entries;
  try {
    entries = await fs.readdir(articleDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
      continue;
    }

    const conversationId = path.basename(entry.name, '.json');
    if (!isValidConversationId(conversationId)) {
      continue;
    }

    const filePath = path.join(articleDir, entry.name);
    const parsed = await readJsonFile(filePath, '对话记录文件损坏，无法解析');
    if (!parsed) {
      continue;
    }

    const candidate = parsed?.conversation && typeof parsed.conversation === 'object'
      ? parsed.conversation
      : parsed;
    const normalized = options.normalizeConversation(candidate);

    if (!normalized || normalized.id !== conversationId) {
      throw createChatStoreError('对话记录文件内容非法', 'MALFORMED_CHAT_STORE');
    }

    if (!existingIds.has(normalized.id)) {
      await options.insertConversationIfAbsent(userId, articleName, normalized);
      existingIds.add(normalized.id);
    }

    await fs.unlink(filePath).catch((error) => {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    });
  }

  await removeDirIfEmpty(articleDir);
}

async function migrateLegacyStoreIfNeeded(userId, articleName, options) {
  const migrationKey = `${userId}:${articleName}`;
  if (migratedArticles.has(migrationKey)) {
    return;
  }

  if (migrationLocks.has(migrationKey)) {
    return migrationLocks.get(migrationKey);
  }

  const task = (async () => {
    const existingIds = await options.listConversationIds(userId, articleName);
    await migrateLegacyFile(userId, articleName, options, existingIds);
    await migrateConversationFiles(userId, articleName, options, existingIds);
    migratedArticles.add(migrationKey);
  })().finally(() => {
    migrationLocks.delete(migrationKey);
  });

  migrationLocks.set(migrationKey, task);
  return task;
}

async function deleteLegacyChatArtifacts(userId, articleName) {
  const migrationKey = `${userId}:${articleName}`;

  const legacyPath = getLegacyStorePath(userId, articleName);
  await fs.unlink(legacyPath).catch((error) => {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  });

  const articleDir = getArticleDir(userId, articleName);
  await fs.rm(articleDir, { recursive: true, force: true });
  migratedArticles.add(migrationKey);
}

module.exports = {
  migrateLegacyStoreIfNeeded,
  deleteLegacyChatArtifacts
};
