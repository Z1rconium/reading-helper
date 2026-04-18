const fs = require('fs/promises');
const path = require('path');
const Database = require('better-sqlite3');

const { getAdminDataDir } = require('./user-paths');

const ADMIN_DB_FILE_NAME = 'admin.sqlite';
const statements = new Map();

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    logged_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS login_events_user_logged_idx
    ON login_events (user_id, logged_at DESC);

  CREATE TABLE IF NOT EXISTS ai_usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    provider_kind TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER
  );

  CREATE INDEX IF NOT EXISTS ai_usage_events_user_occurred_idx
    ON ai_usage_events (user_id, occurred_at DESC);
`;

let db = null;

function normalizeTimestamp(value, fallback = new Date().toISOString()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toISOString();
}

function normalizeTokenCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed);
}

function prepare(key, sql) {
  if (!db) {
    throw new Error('Admin metrics database not initialized');
  }
  if (!statements.has(key)) {
    statements.set(key, db.prepare(sql));
  }
  return statements.get(key);
}

async function getDatabase() {
  if (db) {
    return db;
  }

  const adminDir = getAdminDataDir();
  await fs.mkdir(adminDir, { recursive: true });

  db = new Database(path.join(adminDir, ADMIN_DB_FILE_NAME));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA_SQL);

  return db;
}

async function recordLoginEvent(userId, loggedAt = new Date().toISOString()) {
  await getDatabase();
  prepare(
    'recordLoginEvent',
    `
      INSERT INTO login_events (user_id, logged_at)
      VALUES (?, ?)
    `
  ).run(userId, normalizeTimestamp(loggedAt));
}

async function recordAiUsageEvent(event) {
  await getDatabase();
  prepare(
    'recordAiUsageEvent',
    `
      INSERT INTO ai_usage_events (
        user_id,
        occurred_at,
        provider_kind,
        model,
        status,
        input_tokens,
        output_tokens,
        total_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    event.userId,
    normalizeTimestamp(event.occurredAt),
    String(event.providerKind || 'custom'),
    String(event.model || ''),
    String(event.status || 'unknown'),
    normalizeTokenCount(event.inputTokens),
    normalizeTokenCount(event.outputTokens),
    normalizeTokenCount(event.totalTokens)
  );
}

async function getLoginCountSince(userId, since) {
  await getDatabase();
  const row = prepare(
    'getLoginCountSince',
    `
      SELECT COUNT(*) AS count
      FROM login_events
      WHERE user_id = ? AND logged_at >= ?
    `
  ).get(userId, normalizeTimestamp(since));

  return Number(row?.count || 0);
}

async function listLoginEventsSince(userId, since) {
  await getDatabase();
  return prepare(
    'listLoginEventsSince',
    `
      SELECT logged_at AS loggedAt
      FROM login_events
      WHERE user_id = ? AND logged_at >= ?
      ORDER BY logged_at DESC
    `
  ).all(userId, normalizeTimestamp(since));
}

function normalizeAiUsageSummaryRow(row) {
  return {
    apiCallCount: Number(row?.apiCallCount || 0),
    inputTokens: Number(row?.inputTokens || 0),
    outputTokens: Number(row?.outputTokens || 0),
    totalTokens: Number(row?.totalTokens || 0)
  };
}

function normalizeAiUsageEventRows(rows) {
  return rows.map((row) => ({
    occurredAt: row.occurredAt,
    providerKind: row.providerKind,
    model: row.model,
    status: row.status,
    inputTokens: row.inputTokens === null ? null : Number(row.inputTokens),
    outputTokens: row.outputTokens === null ? null : Number(row.outputTokens),
    totalTokens: row.totalTokens === null ? null : Number(row.totalTokens)
  }));
}

async function getAiUsageSummarySince(userId, since) {
  await getDatabase();
  const row = prepare(
    'getAiUsageSummarySince',
    `
      SELECT
        COUNT(*) AS apiCallCount,
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(total_tokens), 0) AS totalTokens
      FROM ai_usage_events
      WHERE user_id = ? AND occurred_at >= ?
    `
  ).get(userId, normalizeTimestamp(since));

  return normalizeAiUsageSummaryRow(row);
}

async function getAiUsageSummary(userId) {
  await getDatabase();
  const row = prepare(
    'getAiUsageSummary',
    `
      SELECT
        COUNT(*) AS apiCallCount,
        COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(total_tokens), 0) AS totalTokens
      FROM ai_usage_events
      WHERE user_id = ?
    `
  ).get(userId);

  return normalizeAiUsageSummaryRow(row);
}

async function listAiUsageEventsSince(userId, since) {
  await getDatabase();
  const rows = prepare(
    'listAiUsageEventsSince',
    `
      SELECT
        occurred_at AS occurredAt,
        provider_kind AS providerKind,
        model,
        status,
        input_tokens AS inputTokens,
        output_tokens AS outputTokens,
        total_tokens AS totalTokens
      FROM ai_usage_events
      WHERE user_id = ? AND occurred_at >= ?
      ORDER BY occurred_at DESC, id DESC
    `
  ).all(userId, normalizeTimestamp(since));

  return normalizeAiUsageEventRows(rows);
}

async function listAiUsageEvents(userId) {
  await getDatabase();
  const rows = prepare(
    'listAiUsageEvents',
    `
      SELECT
        occurred_at AS occurredAt,
        provider_kind AS providerKind,
        model,
        status,
        input_tokens AS inputTokens,
        output_tokens AS outputTokens,
        total_tokens AS totalTokens
      FROM ai_usage_events
      WHERE user_id = ?
      ORDER BY occurred_at DESC, id DESC
    `
  ).all(userId);

  return normalizeAiUsageEventRows(rows);
}

async function deleteUserMetrics(userId) {
  await getDatabase();
  const transaction = db.transaction((targetUserId) => {
    prepare(
      'deleteUserMetrics:loginEvents',
      'DELETE FROM login_events WHERE user_id = ?'
    ).run(targetUserId);
    prepare(
      'deleteUserMetrics:aiUsageEvents',
      'DELETE FROM ai_usage_events WHERE user_id = ?'
    ).run(targetUserId);
  });

  transaction(userId);
}

function closeAdminMetricsDatabase() {
  if (!db) {
    return;
  }

  try {
    db.close();
  } catch (error) {
    console.warn(`[AdminMetrics] Failed to close database: ${error.message}`);
  } finally {
    db = null;
    statements.clear();
  }
}

module.exports = {
  closeAdminMetricsDatabase,
  getAiUsageSummary,
  getAiUsageSummarySince,
  getLoginCountSince,
  listAiUsageEvents,
  listAiUsageEventsSince,
  listLoginEventsSince,
  deleteUserMetrics,
  recordAiUsageEvent,
  recordLoginEvent
};
