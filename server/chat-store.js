const crypto = require('crypto');
const path = require('path');
const sanitizeHtml = require('sanitize-html');
const {
  listConversationIds,
  listConversationSummaries,
  createConversationRecord,
  insertConversationIfAbsent,
  getConversationRecord,
  appendConversationMessageRecord,
  clearConversationRecord,
  deleteConversationRecord,
  deleteArticleConversations
} = require('./chat-db');
const {
  migrateLegacyStoreIfNeeded,
  deleteLegacyChatArtifacts
} = require('./chat-migrate');

const ALLOWED_EXTENSIONS = new Set(['.txt', '.text']);
const DEFAULT_CONVERSATION_TITLE = '新对话';
const MAX_FILE_NAME_LENGTH = 255;
const MAX_CONVERSATION_ID_LENGTH = 128;
const MAX_MESSAGE_LENGTH = 200000;
const MAX_TITLE_LENGTH = 24;
const MAX_PREVIEW_LENGTH = 120;
const SANITIZE_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
  'div', 'span', 'button', 'a'
];
const SANITIZE_ALLOWED_ATTRIBUTES = {
  '*': ['class'],
  div: ['data-markdown', 'data-type', 'data-correct-answer'],
  span: ['data-type'],
  button: ['type', 'data-option'],
  a: ['href', 'target', 'rel']
};

function createChatStoreError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

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
    throw createChatStoreError('非法文件名', 'INVALID_NAME');
  }
}

function isValidConversationId(conversationId) {
  if (typeof conversationId !== 'string') return false;
  if (!conversationId || conversationId.length > MAX_CONVERSATION_ID_LENGTH) return false;
  return /^[a-zA-Z0-9-]+$/.test(conversationId);
}

function assertValidConversationId(conversationId) {
  if (!isValidConversationId(conversationId)) {
    throw createChatStoreError('非法对话 ID', 'INVALID_CONVERSATION_ID');
  }
}

function normalizeTimestamp(value, fallback) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toISOString();
}

function sanitizeAssistantHtml(content) {
  return sanitizeHtml(String(content || ''), {
    allowedTags: SANITIZE_ALLOWED_TAGS,
    allowedAttributes: SANITIZE_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard'
  });
}

function sanitizeInteraction(interaction) {
  if (!interaction || typeof interaction !== 'object') return interaction;
  if (interaction.role !== 'assistant') return interaction;

  return {
    ...interaction,
    content: sanitizeAssistantHtml(interaction.content)
  };
}

function stripHtml(content) {
  return String(content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(content, maxLength) {
  const plain = stripHtml(content);
  if (!plain) {
    return '';
  }

  return plain.length > maxLength ? `${plain.slice(0, maxLength)}...` : plain;
}

function buildConversationTitleFromContent(content) {
  return truncateText(content, MAX_TITLE_LENGTH) || DEFAULT_CONVERSATION_TITLE;
}

function buildLastMessagePreview(content) {
  return truncateText(content, MAX_PREVIEW_LENGTH);
}

function deriveConversationTitle(interactions) {
  const firstUserInteraction = interactions.find((item) => item.role === 'user');
  if (!firstUserInteraction) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  return buildConversationTitleFromContent(firstUserInteraction.content);
}

function normalizeInteraction(interaction) {
  if (!interaction || typeof interaction !== 'object') return null;
  const role = interaction.role === 'assistant' ? 'assistant' : interaction.role === 'user' ? 'user' : '';
  const content = typeof interaction.content === 'string' ? interaction.content : '';

  if (!role) return null;
  if (!content.trim()) return null;

  return {
    role,
    content: role === 'assistant' ? sanitizeAssistantHtml(content) : content,
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
  const title = deriveConversationTitle(interactions);
  const lastInteraction = interactions[interactions.length - 1];

  return {
    id: conversation.id,
    title,
    createdAt,
    updatedAt,
    messageCount: interactions.length,
    lastMessagePreview: lastInteraction ? buildLastMessagePreview(lastInteraction.content) : '',
    interactions
  };
}

async function migrateIfNeeded(userId, articleName) {
  await migrateLegacyStoreIfNeeded(userId, articleName, {
    normalizeConversation,
    listConversationIds,
    insertConversationIfAbsent
  });
}

function normalizeConversationSummary(summary) {
  return {
    id: summary.id,
    title: summary.title || DEFAULT_CONVERSATION_TITLE,
    createdAt: normalizeTimestamp(summary.createdAt, new Date().toISOString()),
    updatedAt: normalizeTimestamp(summary.updatedAt, summary.createdAt || new Date().toISOString()),
    messageCount: Number(summary.messageCount || 0),
    lastMessagePreview: summary.lastMessagePreview || ''
  };
}

async function listConversations(userId, articleName) {
  assertValidArticleName(articleName);
  await migrateIfNeeded(userId, articleName);
  const conversations = await listConversationSummaries(userId, articleName);
  return conversations.map(normalizeConversationSummary);
}

async function createConversation(userId, articleName) {
  assertValidArticleName(articleName);
  await migrateIfNeeded(userId, articleName);

  const now = new Date().toISOString();
  const conversation = {
    id: crypto.randomUUID(),
    title: DEFAULT_CONVERSATION_TITLE,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    lastMessagePreview: '',
    interactions: []
  };

  await createConversationRecord(userId, articleName, conversation);
  return normalizeConversationSummary(conversation);
}

async function getConversation(userId, articleName, conversationId) {
  assertValidArticleName(articleName);
  assertValidConversationId(conversationId);
  await migrateIfNeeded(userId, articleName);

  const conversation = await getConversationRecord(userId, articleName, conversationId);
  if (!conversation) {
    throw createChatStoreError('对话不存在', 'NOT_FOUND');
  }

  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    interactions: conversation.interactions.map(sanitizeInteraction)
  };
}

async function appendConversationMessage(userId, articleName, conversationId, role, content, timestamp) {
  assertValidArticleName(articleName);
  assertValidConversationId(conversationId);

  const normalizedRole = role === 'assistant' ? 'assistant' : role === 'user' ? 'user' : '';
  if (!normalizedRole) {
    throw createChatStoreError('role 仅支持 user 或 assistant', 'INVALID_ROLE');
  }

  const normalizedContent = typeof content === 'string' ? content : '';
  if (!normalizedContent.trim()) {
    throw createChatStoreError('content 不能为空', 'INVALID_CONTENT');
  }
  if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
    throw createChatStoreError('content 过长', 'INVALID_CONTENT');
  }

  await migrateIfNeeded(userId, articleName);

  const interaction = {
    role: normalizedRole,
    content: normalizedRole === 'assistant'
      ? sanitizeAssistantHtml(normalizedContent)
      : normalizedContent,
    timestamp: normalizeTimestamp(timestamp, new Date().toISOString())
  };

  const updatedAt = new Date().toISOString();
  const appended = await appendConversationMessageRecord(
    userId,
    articleName,
    conversationId,
    interaction,
    {
      updatedAt,
      titleCandidate: normalizedRole === 'user' ? buildConversationTitleFromContent(normalizedContent) : '',
      lastMessagePreview: buildLastMessagePreview(interaction.content),
      defaultTitle: DEFAULT_CONVERSATION_TITLE
    }
  );

  if (!appended) {
    throw createChatStoreError('对话不存在', 'NOT_FOUND');
  }

  return interaction;
}

async function clearConversation(userId, articleName, conversationId) {
  assertValidArticleName(articleName);
  assertValidConversationId(conversationId);
  await migrateIfNeeded(userId, articleName);

  const cleared = await clearConversationRecord(userId, articleName, conversationId, {
    updatedAt: new Date().toISOString(),
    defaultTitle: DEFAULT_CONVERSATION_TITLE
  });

  if (!cleared) {
    throw createChatStoreError('对话不存在', 'NOT_FOUND');
  }

  return cleared;
}

async function deleteConversation(userId, articleName, conversationId) {
  assertValidArticleName(articleName);
  assertValidConversationId(conversationId);
  await migrateIfNeeded(userId, articleName);

  const deleted = await deleteConversationRecord(userId, articleName, conversationId);
  if (!deleted) {
    throw createChatStoreError('对话不存在', 'NOT_FOUND');
  }

  return { id: conversationId, deleted: true };
}

async function deleteArticleChatStore(userId, articleName) {
  assertValidArticleName(articleName);
  await deleteArticleConversations(userId, articleName);
  await deleteLegacyChatArtifacts(userId, articleName);
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
