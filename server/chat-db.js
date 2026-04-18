const fs = require('fs/promises');
const path = require('path');
const Database = require('better-sqlite3');
const { getUserChatDir } = require('./user-paths');

const CHAT_DB_FILE_NAME = 'chat.sqlite';
const dbCache = new Map();

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    article_name TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    last_message_preview TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS conversations_user_article_updated_idx
    ON conversations (user_id, article_name, updated_at DESC);

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    UNIQUE (conversation_id, seq)
  );

  CREATE INDEX IF NOT EXISTS messages_conversation_seq_idx
    ON messages (conversation_id, seq ASC);
`;

function getChatDatabasePath(userId) {
  return path.join(getUserChatDir(userId), CHAT_DB_FILE_NAME);
}

function prepare(entry, key, sql) {
  if (!entry.statements.has(key)) {
    entry.statements.set(key, entry.db.prepare(sql));
  }
  return entry.statements.get(key);
}

function createTransaction(entry, key, factory) {
  if (!entry.transactions.has(key)) {
    entry.transactions.set(key, entry.db.transaction(factory));
  }
  return entry.transactions.get(key);
}

async function getDatabaseEntry(userId) {
  if (dbCache.has(userId)) {
    return dbCache.get(userId);
  }

  const chatDir = getUserChatDir(userId);
  await fs.mkdir(chatDir, { recursive: true });

  const db = new Database(getChatDatabasePath(userId));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA_SQL);

  const entry = {
    db,
    statements: new Map(),
    transactions: new Map()
  };
  dbCache.set(userId, entry);
  return entry;
}

function normalizeConversationSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    articleName: row.articleName || '',
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    messageCount: Number(row.messageCount || 0),
    lastMessagePreview: row.lastMessagePreview || ''
  };
}

async function listConversationIds(userId, articleName) {
  const entry = await getDatabaseEntry(userId);
  const rows = prepare(
    entry,
    'listConversationIds',
    `
      SELECT id
      FROM conversations
      WHERE user_id = ? AND article_name = ?
    `
  ).all(userId, articleName);

  return new Set(rows.map((row) => row.id));
}

async function listConversationSummaries(userId, articleName) {
  const entry = await getDatabaseEntry(userId);
  const rows = prepare(
    entry,
    'listConversationSummaries',
    `
      SELECT
        id,
        article_name AS articleName,
        title,
        created_at AS createdAt,
        updated_at AS updatedAt,
        message_count AS messageCount,
        last_message_preview AS lastMessagePreview
      FROM conversations
      WHERE user_id = ? AND article_name = ?
      ORDER BY updated_at DESC
    `
  ).all(userId, articleName);

  return rows.map(normalizeConversationSummary);
}

async function listAllConversationSummaries(userId) {
  const entry = await getDatabaseEntry(userId);
  const rows = prepare(
    entry,
    'listAllConversationSummaries',
    `
      SELECT
        id,
        article_name AS articleName,
        title,
        created_at AS createdAt,
        updated_at AS updatedAt,
        message_count AS messageCount,
        last_message_preview AS lastMessagePreview
      FROM conversations
      WHERE user_id = ?
      ORDER BY article_name COLLATE NOCASE ASC, updated_at DESC
    `
  ).all(userId);

  return rows.map(normalizeConversationSummary);
}

async function createConversationRecord(userId, articleName, conversation) {
  const entry = await getDatabaseEntry(userId);
  prepare(
    entry,
    'createConversationRecord',
    `
      INSERT INTO conversations (
        id,
        user_id,
        article_name,
        title,
        created_at,
        updated_at,
        message_count,
        last_message_preview
      ) VALUES (
        @id,
        @userId,
        @articleName,
        @title,
        @createdAt,
        @updatedAt,
        @messageCount,
        @lastMessagePreview
      )
    `
  ).run({
    id: conversation.id,
    userId,
    articleName,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: Number(conversation.messageCount || 0),
    lastMessagePreview: conversation.lastMessagePreview || ''
  });
}

async function insertConversationIfAbsent(userId, articleName, conversation) {
  const entry = await getDatabaseEntry(userId);
  const transaction = createTransaction(
    entry,
    'insertConversationIfAbsent',
    (payload) => {
      const insertConversation = prepare(
        entry,
        'insertConversationIfAbsent:conversation',
        `
          INSERT OR IGNORE INTO conversations (
            id,
            user_id,
            article_name,
            title,
            created_at,
            updated_at,
            message_count,
            last_message_preview
          ) VALUES (
            @id,
            @userId,
            @articleName,
            @title,
            @createdAt,
            @updatedAt,
            @messageCount,
            @lastMessagePreview
          )
        `
      );
      const insertMessage = prepare(
        entry,
        'insertConversationIfAbsent:message',
        `
          INSERT INTO messages (
            conversation_id,
            seq,
            role,
            content,
            timestamp
          ) VALUES (
            @conversationId,
            @seq,
            @role,
            @content,
            @timestamp
          )
        `
      );

      const inserted = insertConversation.run({
        id: payload.id,
        userId: payload.userId,
        articleName: payload.articleName,
        title: payload.title,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt,
        messageCount: payload.messageCount,
        lastMessagePreview: payload.lastMessagePreview
      });

      if (!inserted.changes) {
        return false;
      }

      payload.interactions.forEach((interaction, index) => {
        insertMessage.run({
          conversationId: payload.id,
          seq: index + 1,
          role: interaction.role,
          content: interaction.content,
          timestamp: interaction.timestamp
        });
      });

      return true;
    }
  );

  return transaction({
    ...conversation,
    userId,
    articleName,
    messageCount: Number(conversation.messageCount || conversation.interactions.length || 0),
    lastMessagePreview: conversation.lastMessagePreview || '',
    interactions: Array.isArray(conversation.interactions) ? conversation.interactions : []
  });
}

async function getConversationSummaryById(userId, articleName, conversationId) {
  const entry = await getDatabaseEntry(userId);
  const row = prepare(
    entry,
    'getConversationSummaryById',
    `
      SELECT
        id,
        article_name AS articleName,
        title,
        created_at AS createdAt,
        updated_at AS updatedAt,
        message_count AS messageCount,
        last_message_preview AS lastMessagePreview
      FROM conversations
      WHERE id = ? AND user_id = ? AND article_name = ?
    `
  ).get(conversationId, userId, articleName);

  return normalizeConversationSummary(row);
}

async function getConversationSummaryByIdForUser(userId, conversationId) {
  const entry = await getDatabaseEntry(userId);
  const row = prepare(
    entry,
    'getConversationSummaryByIdForUser',
    `
      SELECT
        id,
        article_name AS articleName,
        title,
        created_at AS createdAt,
        updated_at AS updatedAt,
        message_count AS messageCount,
        last_message_preview AS lastMessagePreview
      FROM conversations
      WHERE id = ? AND user_id = ?
    `
  ).get(conversationId, userId);

  return normalizeConversationSummary(row);
}

async function getConversationRecord(userId, articleName, conversationId) {
  const entry = await getDatabaseEntry(userId);
  const summary = await getConversationSummaryById(userId, articleName, conversationId);
  if (!summary) {
    return null;
  }

  const interactions = prepare(
    entry,
    'getConversationRecord:messages',
    `
      SELECT role, content, timestamp
      FROM messages
      WHERE conversation_id = ?
      ORDER BY seq ASC
    `
  ).all(conversationId).map((row) => ({
    role: row.role,
    content: row.content,
    timestamp: row.timestamp
  }));

  return {
    ...summary,
    interactions
  };
}

async function getConversationRecordById(userId, conversationId) {
  const entry = await getDatabaseEntry(userId);
  const summary = await getConversationSummaryByIdForUser(userId, conversationId);
  if (!summary) {
    return null;
  }

  const interactions = prepare(
    entry,
    'getConversationRecordById:messages',
    `
      SELECT role, content, timestamp
      FROM messages
      WHERE conversation_id = ?
      ORDER BY seq ASC
    `
  ).all(conversationId).map((row) => ({
    role: row.role,
    content: row.content,
    timestamp: row.timestamp
  }));

  return {
    ...summary,
    interactions
  };
}

async function appendConversationMessageRecord(userId, articleName, conversationId, interaction, options) {
  const entry = await getDatabaseEntry(userId);
  const transaction = createTransaction(
    entry,
    'appendConversationMessageRecord',
    (payload) => {
      const selectConversation = prepare(
        entry,
        'appendConversationMessageRecord:selectConversation',
        `
          SELECT
            id,
            title,
            message_count AS messageCount
          FROM conversations
          WHERE id = @conversationId AND user_id = @userId AND article_name = @articleName
        `
      );
      const insertMessage = prepare(
        entry,
        'appendConversationMessageRecord:insertMessage',
        `
          INSERT INTO messages (
            conversation_id,
            seq,
            role,
            content,
            timestamp
          ) VALUES (
            @conversationId,
            @seq,
            @role,
            @content,
            @timestamp
          )
        `
      );
      const updateConversation = prepare(
        entry,
        'appendConversationMessageRecord:updateConversation',
        `
          UPDATE conversations
          SET
            title = @title,
            updated_at = @updatedAt,
            message_count = @messageCount,
            last_message_preview = @lastMessagePreview
          WHERE id = @conversationId AND user_id = @userId AND article_name = @articleName
        `
      );

      const conversation = selectConversation.get({
        conversationId: payload.conversationId,
        userId: payload.userId,
        articleName: payload.articleName
      });
      if (!conversation) {
        return null;
      }

      const messageCount = Number(conversation.messageCount || 0) + 1;
      const title = payload.role === 'user' && payload.titleCandidate && (!conversation.title || conversation.title === payload.defaultTitle)
        ? payload.titleCandidate
        : conversation.title || payload.defaultTitle;

      insertMessage.run({
        conversationId: payload.conversationId,
        seq: messageCount,
        role: payload.role,
        content: payload.content,
        timestamp: payload.timestamp
      });

      updateConversation.run({
        conversationId: payload.conversationId,
        userId: payload.userId,
        articleName: payload.articleName,
        title,
        updatedAt: payload.updatedAt,
        messageCount,
        lastMessagePreview: payload.lastMessagePreview
      });

      return {
        title,
        messageCount,
        updatedAt: payload.updatedAt,
        lastMessagePreview: payload.lastMessagePreview
      };
    }
  );

  return transaction({
    userId,
    articleName,
    conversationId,
    role: interaction.role,
    content: interaction.content,
    timestamp: interaction.timestamp,
    updatedAt: options.updatedAt,
    titleCandidate: options.titleCandidate || '',
    lastMessagePreview: options.lastMessagePreview || '',
    defaultTitle: options.defaultTitle
  });
}

async function clearConversationRecord(userId, articleName, conversationId, options) {
  const entry = await getDatabaseEntry(userId);
  const transaction = createTransaction(
    entry,
    'clearConversationRecord',
    (payload) => {
      const deleteMessages = prepare(
        entry,
        'clearConversationRecord:deleteMessages',
        'DELETE FROM messages WHERE conversation_id = ?'
      );
      const updateConversation = prepare(
        entry,
        'clearConversationRecord:updateConversation',
        `
          UPDATE conversations
          SET
            title = @title,
            updated_at = @updatedAt,
            message_count = 0,
            last_message_preview = ''
          WHERE id = @conversationId AND user_id = @userId AND article_name = @articleName
        `
      );
      const selectConversation = prepare(
        entry,
        'clearConversationRecord:selectConversation',
        `
          SELECT id
          FROM conversations
          WHERE id = @conversationId AND user_id = @userId AND article_name = @articleName
        `
      );

      const existing = selectConversation.get({
        conversationId: payload.conversationId,
        userId: payload.userId,
        articleName: payload.articleName
      });
      if (!existing) {
        return null;
      }

      deleteMessages.run(payload.conversationId);
      updateConversation.run({
        conversationId: payload.conversationId,
        userId: payload.userId,
        articleName: payload.articleName,
        title: payload.defaultTitle,
        updatedAt: payload.updatedAt
      });

      return {
        id: payload.conversationId,
        updatedAt: payload.updatedAt
      };
    }
  );

  return transaction({
    userId,
    articleName,
    conversationId,
    updatedAt: options.updatedAt,
    defaultTitle: options.defaultTitle
  });
}

async function deleteConversationRecord(userId, articleName, conversationId) {
  const entry = await getDatabaseEntry(userId);
  const result = prepare(
    entry,
    'deleteConversationRecord',
    `
      DELETE FROM conversations
      WHERE id = @conversationId AND user_id = @userId AND article_name = @articleName
    `
  ).run({
    conversationId,
    userId,
    articleName
  });

  return result.changes > 0;
}

async function deleteArticleConversations(userId, articleName) {
  const entry = await getDatabaseEntry(userId);
  prepare(
    entry,
    'deleteArticleConversations',
    `
      DELETE FROM conversations
      WHERE user_id = ? AND article_name = ?
    `
  ).run(userId, articleName);
}

function closeAllChatDatabases() {
  for (const [userId, entry] of dbCache.entries()) {
    try {
      entry.db.close();
    } catch (error) {
      console.warn(`[ChatDB] Failed to close database for user ${userId}: ${error.message}`);
    }
  }
  dbCache.clear();
}

module.exports = {
  listConversationIds,
  listAllConversationSummaries,
  listConversationSummaries,
  createConversationRecord,
  insertConversationIfAbsent,
  getConversationSummaryById,
  getConversationSummaryByIdForUser,
  getConversationRecord,
  getConversationRecordById,
  appendConversationMessageRecord,
  clearConversationRecord,
  deleteConversationRecord,
  deleteArticleConversations,
  closeAllChatDatabases
};
