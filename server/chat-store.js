const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getUserChatDir } = require('./user-paths');

const ALLOWED_EXTENSIONS = new Set(['.txt', '.text']);
const CHAT_STORE_VERSION = 1;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_CONVERSATION_ID_LENGTH = 128;
const MAX_MESSAGE_LENGTH = 200000;

function hasAllowedTextExtension(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

function isValidArticleName(fileName) {
  if (typeof fileName !== 'string') return false;
  if (!fileName || fileName.length > MAX_FILE_NAME_LENGTH) return false;
  if (fileName.includes('/') || fileName.includes('\\')) return false;
  if (!hasAllowedTextExtension(fileName)) return false;
  return /^[\w\-. \u4e00-\u9fa5]+$/.test(fileName);
}

function assertValidArticleName(fileName) {
  if (!isValidArticleName(fileName)) {
    const error = new Error('非法文件名');
    error.code = 'INVALID_NAME';
    throw error;
  }
}

function isValidConversationId(conversationId) {
  if (typeof conversationId !== 'string') return false;
  if (!conversationId || conversationId.length > MAX_CONVERSATION_ID_LENGTH) return false;
  return /^[a-zA-Z0-9-]+$/.test(conversationId);
}

function assertValidConversationId(conversationId) {
  if (!isValidConversationId(conversationId)) {
    const error = new Error('非法对话 ID');
    error.code = 'INVALID_CONVERSATION_ID';
    throw error;
  }
}

function normalizeTimestamp(value, fallback) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toISOString();
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

function getConversationPath(userId, articleName, conversationId) {
  return path.join(getArticleDir(userId, articleName), `${conversationId}.json`);
}

async function ensureChatDir(userId) {
  await fs.mkdir(getUserChatDir(userId), { recursive: true });
}

async function ensureArticleDir(userId, articleName) {
  const articleDir = getArticleDir(userId, articleName);
  await fs.mkdir(articleDir, { recursive: true });
  return articleDir;
}

function normalizeInteraction(interaction) {
  if (!interaction || typeof interaction !== 'object') return null;
  const role = interaction.role === 'assistant' ? 'assistant' : interaction.role === 'user' ? 'user' : '';
  const content = typeof interaction.content === 'string' ? interaction.content : '';

  if (!role) return null;
  if (!content.trim()) return null;

  return {
    role,
    content,
    timestamp: normalizeTimestamp(interaction.timestamp, new Date().toISOString())
  };
}

function normalizeConversation(conversation) {
  if (!conversation || typeof conversation !== 'object') return null;
  if (!isValidConversationId(conversation.id)) return null;

  const createdAt = normalizeTimestamp(conversation.createdAt, new Date().toISOString());
  const updatedAt = normalizeTimestamp(conversation.updatedAt, createdAt);
  const interactions = Array.isArray(conversation.interactions)
    ? conversation.interactions.map(normalizeInteraction).filter(Boolean)
    : [];

  return {
    id: conversation.id,
    createdAt,
    updatedAt,
    interactions
  };
}

function normalizeLegacyStore(payload) {
  const conversations = Array.isArray(payload?.conversations)
    ? payload.conversations.map(normalizeConversation).filter(Boolean)
    : [];
  return {
    version: CHAT_STORE_VERSION,
    conversations
  };
}

async function writeConversation(userId, articleName, conversation) {
  const normalized = normalizeConversation(conversation);
  if (!normalized) {
    const error = new Error('无效对话数据');
    error.code = 'INVALID_CONVERSATION';
    throw error;
  }

  await ensureChatDir(userId);
  await ensureArticleDir(userId, articleName);
  const targetPath = getConversationPath(userId, articleName, normalized.id);
  const payload = {
    version: CHAT_STORE_VERSION,
    articleName,
    conversation: normalized
  };
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf8');
  return normalized;
}

async function readConversation(userId, articleName, conversationId) {
  assertValidArticleName(articleName);
  assertValidConversationId(conversationId);
  await ensureChatDir(userId);
  const targetPath = getConversationPath(userId, articleName, conversationId);

  let raw;
  try {
    raw = await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const notFound = new Error('对话不存在');
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const malformed = new Error('对话记录文件损坏，无法解析');
    malformed.code = 'MALFORMED_CHAT_STORE';
    throw malformed;
  }

  const candidate = parsed?.conversation && typeof parsed.conversation === 'object'
    ? parsed.conversation
    : parsed;
  const normalized = normalizeConversation(candidate);
  if (!normalized || normalized.id !== conversationId) {
    const malformed = new Error('对话记录文件内容非法');
    malformed.code = 'MALFORMED_CHAT_STORE';
    throw malformed;
  }
  return normalized;
}

async function listConversationFiles(userId, articleName) {
  assertValidArticleName(articleName);
  await ensureChatDir(userId);
  const articleDir = getArticleDir(userId, articleName);

  try {
    const entries = await fs.readdir(articleDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
      .map((entry) => path.basename(entry.name, '.json'))
      .filter((conversationId) => isValidConversationId(conversationId));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function removeArticleDirIfEmpty(userId, articleName) {
  const articleDir = getArticleDir(userId, articleName);
  try {
    const entries = await fs.readdir(articleDir);
    if (entries.length === 0) {
      await fs.rmdir(articleDir);
    }
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTEMPTY')) {
      return;
    }
    throw error;
  }
}

async function migrateLegacyStoreIfNeeded(userId, articleName) {
  assertValidArticleName(articleName);
  await ensureChatDir(userId);
  const legacyPath = getLegacyStorePath(userId, articleName);

  let raw;
  try {
    raw = await fs.readFile(legacyPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const malformed = new Error('历史记录迁移失败：旧文件无法解析');
    malformed.code = 'MALFORMED_CHAT_STORE';
    throw malformed;
  }

  const legacyStore = normalizeLegacyStore(parsed);
  for (const conversation of legacyStore.conversations) {
    await writeConversation(userId, articleName, conversation);
  }

  await fs.unlink(legacyPath);
}

function stripHtml(content) {
  return String(content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getConversationTitle(conversation) {
  const firstUserInteraction = conversation.interactions.find((item) => item.role === 'user');
  if (!firstUserInteraction) {
    return '新对话';
  }

  const plain = stripHtml(firstUserInteraction.content);
  if (!plain) {
    return '新对话';
  }

  return plain.length > 24 ? `${plain.slice(0, 24)}...` : plain;
}

function toConversationSummary(conversation) {
  return {
    id: conversation.id,
    title: getConversationTitle(conversation),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.interactions.length
  };
}

function sortConversationsByUpdatedAt(conversations) {
  conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function listConversations(userId, articleName) {
  assertValidArticleName(articleName);
  await migrateLegacyStoreIfNeeded(userId, articleName);
  const ids = await listConversationFiles(userId, articleName);
  const conversations = [];

  for (const id of ids) {
    const conversation = await readConversation(userId, articleName, id);
    conversations.push(conversation);
  }

  sortConversationsByUpdatedAt(conversations);
  return conversations.map(toConversationSummary);
}

async function createConversation(userId, articleName) {
  assertValidArticleName(articleName);
  await migrateLegacyStoreIfNeeded(userId, articleName);
  const now = new Date().toISOString();
  const conversation = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    interactions: []
  };

  await writeConversation(userId, articleName, conversation);
  return toConversationSummary(conversation);
}

async function getConversation(userId, articleName, conversationId) {
  await migrateLegacyStoreIfNeeded(userId, articleName);
  const conversation = await readConversation(userId, articleName, conversationId);
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    interactions: [...conversation.interactions]
  };
}

async function appendConversationMessage(userId, articleName, conversationId, role, content, timestamp) {
  assertValidConversationId(conversationId);
  const normalizedRole = role === 'assistant' ? 'assistant' : role === 'user' ? 'user' : '';
  if (!normalizedRole) {
    const error = new Error('role 仅支持 user 或 assistant');
    error.code = 'INVALID_ROLE';
    throw error;
  }

  const normalizedContent = typeof content === 'string' ? content : '';
  if (!normalizedContent.trim()) {
    const error = new Error('content 不能为空');
    error.code = 'INVALID_CONTENT';
    throw error;
  }
  if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
    const error = new Error('content 过长');
    error.code = 'INVALID_CONTENT';
    throw error;
  }

  await migrateLegacyStoreIfNeeded(userId, articleName);
  const conversation = await readConversation(userId, articleName, conversationId);
  const interaction = {
    role: normalizedRole,
    content: normalizedContent,
    timestamp: normalizeTimestamp(timestamp, new Date().toISOString())
  };

  conversation.interactions.push(interaction);
  conversation.updatedAt = new Date().toISOString();
  await writeConversation(userId, articleName, conversation);
  return interaction;
}

async function clearConversation(userId, articleName, conversationId) {
  await migrateLegacyStoreIfNeeded(userId, articleName);
  const conversation = await readConversation(userId, articleName, conversationId);
  conversation.interactions = [];
  conversation.updatedAt = new Date().toISOString();
  await writeConversation(userId, articleName, conversation);

  return {
    id: conversation.id,
    updatedAt: conversation.updatedAt
  };
}

async function deleteConversation(userId, articleName, conversationId) {
  assertValidArticleName(articleName);
  assertValidConversationId(conversationId);
  await migrateLegacyStoreIfNeeded(userId, articleName);
  const targetPath = getConversationPath(userId, articleName, conversationId);

  try {
    await fs.unlink(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const notFound = new Error('对话不存在');
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }
    throw error;
  }

  await removeArticleDirIfEmpty(userId, articleName);
  return { id: conversationId, deleted: true };
}

async function deleteArticleChatStore(userId, articleName) {
  assertValidArticleName(articleName);
  await ensureChatDir(userId);

  const legacyPath = getLegacyStorePath(userId, articleName);
  try {
    await fs.unlink(legacyPath);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  await fs.rm(getArticleDir(userId, articleName), { recursive: true, force: true });
}

module.exports = {
  listConversations,
  createConversation,
  getConversation,
  appendConversationMessage,
  clearConversation,
  deleteConversation,
  deleteArticleChatStore
};
