const https = require('https');
const http = require('http');
const fs = require('fs/promises');
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const {
  loadAdminConfig,
  loadPlatformConfig,
  getConfigDir
} = require('./config-loader');
const {
  MAX_UPLOAD_BYTES,
  hasAllowedTextExtension,
  saveUploadedText,
  listUploadedTexts,
  readUploadedText,
  deleteUploadedText
} = require('./file-store');
const {
  listPromptFiles,
  readPromptFile,
  writePromptFile,
  clearUserPromptSyncState
} = require('./prompt-store');
const {
  listConversations,
  createConversation,
  getConversation,
  appendConversationMessage,
  clearConversation,
  deleteConversation,
  deleteArticleChatStore
} = require('./chat-store');
const {
  getPreferences,
  savePreferences,
  clearUserPreferencesCache
} = require('./preferences-store');
const { assertValidUserId } = require('./user-paths');
const {
  createSessionStore,
  destroyUserSessions
} = require('./session-store');
const {
  cleanupOrphanedUsers,
  deleteUserData
} = require('./cleanup-orphaned-users');
const { csrfProtection, ensureCsrfToken, generateCsrfToken, setCsrfCookie } = require('./csrf-protection');
const {
  closeAllChatDatabases,
  closeUserChatDatabase,
  getConversationRecordById,
  listAllConversationSummaries
} = require('./chat-db');
const {
  closeAdminMetricsDatabase,
  deleteUserMetrics,
  getAiUsageSummary,
  getLoginCountSince,
  listAiUsageEvents,
  listLoginEventsSince,
  recordAiUsageEvent,
  recordLoginEvent
} = require('./admin-metrics-store');
const { createUsersConfigManager } = require('./users-config-manager');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_SYSTEM_PROMPT = '你是一位专业的英语老师，擅长用中文解释英语知识。';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const TRUST_PROXY_ENV = process.env.TRUST_PROXY;
const AI_REQUEST_TIMEOUT_MS = 120000; // 120 秒超时
const CONNECTIVITY_TIMEOUT_MS = 10000;
const TTS_REQUEST_TIMEOUT_MS = 30000;
const MAX_SSE_BUFFER_SIZE = 10 * 1024; // 10KB
const MAX_CONNECTIVITY_SUMMARY_LENGTH = 120;
const EDGE_TTS_ENDPOINT = (() => {
  const value = typeof process.env.EDGE_TTS_ENDPOINT === 'string' ? process.env.EDGE_TTS_ENDPOINT.trim() : '';
  if (!value) {
    throw new Error('缺少必填环境变量 EDGE_TTS_ENDPOINT');
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('EDGE_TTS_ENDPOINT 必须使用 http 或 https 协议');
    }
    return value;
  } catch (error) {
    if (error.message === 'EDGE_TTS_ENDPOINT 必须使用 http 或 https 协议') {
      throw error;
    }
    throw new Error(`EDGE_TTS_ENDPOINT 不是有效 URL: ${error.message}`);
  }
})();

// #11 AI 请求连接复用 - 创建全局 agent
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000
});

// CET词表缓存
let cetWordListCache = null;

function parseTrustProxy(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') {
    return null;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return value;
}

function getUrlOrigin(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return '';
  }
  try {
    const parsed = new URL(url.trim());
    return parsed.origin && parsed.origin !== 'null' ? parsed.origin : '';
  } catch (_) {
    return '';
  }
}

function buildConnectSrcDirective() {
  const sources = [
    "'self'",
    'https://cdn.jsdelivr.net',
    'https://challenges.cloudflare.com'
  ];
  const ttsOrigin = getUrlOrigin(EDGE_TTS_ENDPOINT);
  if (ttsOrigin) {
    sources.push(ttsOrigin);
  }
  return Array.from(new Set(sources)).join(' ');
}

function getSessionUserId(req) {
  return typeof req.session?.userId === 'string' ? req.session.userId.trim() : '';
}

function getSessionRole(req) {
  return req.session?.role === 'admin' ? 'admin' : req.session?.role === 'user' ? 'user' : '';
}

function isAuthenticatedSession(req) {
  const role = getSessionRole(req);
  if (!req.session?.authenticated || !role) {
    return false;
  }
  if (role === 'admin') {
    return true;
  }
  return !!getSessionUserId(req);
}

function requireAdminAuth(req, res, next) {
  if (isAuthenticatedSession(req) && getSessionRole(req) === 'admin') {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

function getRequestedUserId(req) {
  const bodyUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  const queryUserId = typeof req.query?.userId === 'string' ? req.query.userId.trim() : '';
  return {
    bodyUserId,
    queryUserId,
    requestedUserId: bodyUserId || queryUserId
  };
}

function validateRequestedUserId(req, res) {
  const sessionUserId = getSessionUserId(req);
  const { bodyUserId, queryUserId, requestedUserId } = getRequestedUserId(req);

  if (bodyUserId && queryUserId && bodyUserId !== queryUserId) {
    res.status(400).json({ error: 'userId 参数不一致' });
    return '';
  }

  if (!requestedUserId) {
    res.status(400).json({ error: 'userId 不能为空' });
    return '';
  }

  try {
    assertValidUserId(requestedUserId);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return '';
  }

  if (requestedUserId !== sessionUserId) {
    res.status(403).json({ error: '无权访问其他用户的数据' });
    return '';
  }

  return requestedUserId;
}

function sendSseChunk(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildLoggedOutAuthResponse() {
  return {
    authenticated: false,
    role: null,
    userId: null,
    apiModel: null
  };
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) {
      resolve();
      return;
    }

    req.session.destroy(() => {
      resolve();
    });
  });
}

async function invalidateSession(req, res) {
  await destroySession(req);
  res.clearCookie('reading_helper_sid');
  res.clearCookie('csrf_token');
}

function createRequireUserAuth(userConfigManager) {
  return function requireUserAuth(req, res, next) {
    void (async () => {
      if (!isAuthenticatedSession(req) || getSessionRole(req) !== 'user') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const userId = getSessionUserId(req);
      const user = await userConfigManager.getUserById(userId);

      if (!user) {
        await invalidateSession(req, res);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      req.currentUser = user;
      next();
    })().catch((error) => {
      console.error('[Auth] Failed to load current user:', error.message);
      res.status(500).json({ error: '用户配置加载失败' });
    });
  };
}

async function buildAuthResponse(req, res, userConfigManager) {
  if (!isAuthenticatedSession(req)) {
    return buildLoggedOutAuthResponse();
  }

  const role = getSessionRole(req);
  if (role === 'admin') {
    return {
      authenticated: true,
      role: 'admin',
      userId: null,
      apiModel: null
    };
  }

  const userId = getSessionUserId(req);
  const user = await userConfigManager.getUserById(userId);

  if (!user) {
    await invalidateSession(req, res);
    return buildLoggedOutAuthResponse();
  }

  return {
    authenticated: true,
    role: 'user',
    userId,
    apiModel: user.provider?.api_model || null
  };
}

function isResponsesApi(apiUrl) {
  try {
    return new URL(apiUrl).pathname.endsWith('/responses');
  } catch {
    return apiUrl.includes('/responses');
  }
}

function isAnthropicApi(apiUrl) {
  try {
    const url = new URL(apiUrl);
    return url.hostname.includes('anthropic') || url.pathname.includes('/messages');
  } catch {
    return apiUrl.includes('anthropic') || apiUrl.includes('/messages');
  }
}

function isChatCompletionsApi(apiUrl) {
  try {
    return new URL(apiUrl).pathname.includes('/chat/completions');
  } catch {
    return apiUrl.includes('/chat/completions');
  }
}

function getProviderDescriptor(providerConfig) {
  const apiUrl = String(providerConfig?.api_url || '').trim();
  let host = '';

  try {
    host = new URL(apiUrl).hostname.toLowerCase();
  } catch (_) {
    host = '';
  }

  const providerKind = isAnthropicApi(apiUrl)
    ? 'anthropic'
    : isResponsesApi(apiUrl)
      ? 'responses'
      : isChatCompletionsApi(apiUrl)
        ? 'chat-completions'
        : 'custom';

  const isOfficialOpenAI = host === 'api.openai.com' || host.endsWith('.openai.com');
  const isOfficialAnthropic = host === 'api.anthropic.com' || host.endsWith('.anthropic.com');
  const tokenTrackingSupported = (
    (providerKind === 'responses' || providerKind === 'chat-completions') && isOfficialOpenAI
  ) || (
    providerKind === 'anthropic' && isOfficialAnthropic
  );

  return {
    host,
    providerKind,
    tokenTrackingSupported
  };
}

function buildUpstreamHeaders(providerConfig) {
  const headers = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
    'User-Agent': 'ReadingHelper/v2.3'
  };

  if (isAnthropicApi(providerConfig.api_url)) {
    headers.Authorization = `Bearer ${providerConfig.api_key}`;
    headers['x-api-key'] = providerConfig.api_key;
    headers['anthropic-version'] = '2023-06-01';
    return headers;
  }

  headers.Authorization = `Bearer ${providerConfig.api_key}`;
  return headers;
}

function buildUpstreamRequestBody(providerConfig, systemPrompt, userPrompt, providerDescriptor) {
  const effectiveSystemPrompt = typeof systemPrompt === 'string' && systemPrompt.trim()
    ? systemPrompt.trim()
    : DEFAULT_SYSTEM_PROMPT;

  if (providerDescriptor.providerKind === 'anthropic') {
    return {
      model: providerConfig.api_model,
      max_tokens: 2000,
      system: effectiveSystemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature: 0.3,
      stream: true
    };
  }

  if (providerDescriptor.providerKind === 'responses') {
    return {
      model: providerConfig.api_model,
      instructions: effectiveSystemPrompt,
      input: userPrompt,
      temperature: 0.3,
      max_output_tokens: 2000,
      stream: true
    };
  }

  return {
    model: providerConfig.api_model,
    messages: [
      {
        role: 'system',
        content: effectiveSystemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: 0.3,
    max_tokens: 2000,
    stream: true,
    ...(providerDescriptor.tokenTrackingSupported ? {
      stream_options: {
        include_usage: true
      }
    } : {})
  };
}

function getUpstreamError(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return '';
  }

  if (parsed.type === 'error' && parsed.error) {
    return parsed.error.message || JSON.stringify(parsed.error);
  }

  if (typeof parsed.error === 'string') {
    return parsed.error;
  }

  if (parsed.error && typeof parsed.error === 'object') {
    return parsed.error.message || JSON.stringify(parsed.error);
  }

  if (parsed.type === 'response.failed') {
    return parsed.response?.error?.message || '上游响应失败';
  }

  return '';
}

function toSafeSummary(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const normalized = text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }
  return normalized.slice(0, MAX_CONNECTIVITY_SUMMARY_LENGTH);
}

function resolveConnectivityHttpFailure(status) {
  if (status === 400) {
    return { errorCode: 'BAD_REQUEST', message: '上游拒绝了探测请求' };
  }
  if (status === 401 || status === 403) {
    return { errorCode: 'AUTH_FAILED', message: 'API Key 无效或无权限' };
  }
  if (status === 404) {
    return { errorCode: 'ENDPOINT_NOT_FOUND', message: 'API 地址无效或路径不存在' };
  }
  if (status === 408) {
    return { errorCode: 'UPSTREAM_TIMEOUT', message: '上游服务响应超时' };
  }
  if (status === 429) {
    return { errorCode: 'RATE_LIMITED', message: '请求过于频繁，触发上游限流' };
  }
  if (status >= 500) {
    return { errorCode: 'UPSTREAM_UNAVAILABLE', message: '上游服务暂时不可用' };
  }
  return { errorCode: 'UPSTREAM_HTTP_ERROR', message: '上游请求失败' };
}

function resolveConnectivityNetworkFailure(error) {
  const safeMessage = toSafeSummary(error?.message || '');
  if (/ENOTFOUND|EAI_AGAIN/i.test(safeMessage)) {
    return { errorCode: 'DNS_ERROR', message: '域名解析失败', summary: safeMessage };
  }
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket|fetch failed/i.test(safeMessage)) {
    return { errorCode: 'NETWORK_ERROR', message: '网络连接失败', summary: safeMessage };
  }
  return { errorCode: 'REQUEST_FAILED', message: '连接失败', summary: safeMessage };
}

function getUpstreamDelta(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return '';
  }

  // Anthropic format: content_block_delta
  if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
    return parsed.delta.text || '';
  }

  // OpenAI Responses API format
  const responseApiDelta = parsed.type === 'response.output_text.delta' ? parsed.delta : '';
  if (typeof responseApiDelta === 'string' && responseApiDelta) {
    return responseApiDelta;
  }

  // OpenAI Chat Completions format
  const chatDelta = parsed?.choices?.[0]?.delta?.content;
  if (typeof chatDelta === 'string') {
    return chatDelta;
  }

  if (Array.isArray(chatDelta)) {
    return chatDelta
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('');
  }

  return '';
}

function normalizeUsageToken(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed);
}

function normalizeUsagePayload(inputTokens, outputTokens, totalTokens) {
  const normalizedInput = normalizeUsageToken(inputTokens);
  const normalizedOutput = normalizeUsageToken(outputTokens);
  let normalizedTotal = normalizeUsageToken(totalTokens);

  if (normalizedTotal === null && normalizedInput !== null && normalizedOutput !== null) {
    normalizedTotal = normalizedInput + normalizedOutput;
  }

  if (normalizedInput === null && normalizedOutput === null && normalizedTotal === null) {
    return null;
  }

  return {
    inputTokens: normalizedInput,
    outputTokens: normalizedOutput,
    totalTokens: normalizedTotal
  };
}

function mergeUsagePayload(currentUsage, nextUsage) {
  if (!nextUsage) {
    return currentUsage || null;
  }

  return normalizeUsagePayload(
    nextUsage.inputTokens ?? currentUsage?.inputTokens,
    nextUsage.outputTokens ?? currentUsage?.outputTokens,
    nextUsage.totalTokens ?? currentUsage?.totalTokens
  );
}

function getUpstreamUsage(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (parsed.type === 'message_start' && parsed.message?.usage) {
    return normalizeUsagePayload(
      parsed.message.usage.input_tokens,
      parsed.message.usage.output_tokens,
      parsed.message.usage.total_tokens
    );
  }

  if (parsed.type === 'message_delta' && parsed.usage) {
    return normalizeUsagePayload(
      parsed.usage.input_tokens,
      parsed.usage.output_tokens,
      parsed.usage.total_tokens
    );
  }

  if (parsed.type === 'response.completed' && parsed.response?.usage) {
    return normalizeUsagePayload(
      parsed.response.usage.input_tokens,
      parsed.response.usage.output_tokens,
      parsed.response.usage.total_tokens
    );
  }

  if (parsed.usage && typeof parsed.usage === 'object') {
    return normalizeUsagePayload(
      parsed.usage.prompt_tokens ?? parsed.usage.input_tokens,
      parsed.usage.completion_tokens ?? parsed.usage.output_tokens,
      parsed.usage.total_tokens
    );
  }

  return null;
}

async function loadCetWordList() {
  if (cetWordListCache !== null) {
    return cetWordListCache;
  }
  const filePath = path.join(getConfigDir(), 'cet_word_list.txt');
  cetWordListCache = await fs.readFile(filePath, 'utf8');
  return cetWordListCache;
}

function relayUpstreamChunk(chunk, res, collector) {
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (!line.startsWith('data:')) continue;

    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;

    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch (parseError) {
      continue;
    }

    const errorMessage = getUpstreamError(parsed);
    if (errorMessage) {
      if (collector && !collector.status) {
        collector.status = 'stream_error';
      }
      sendSseChunk(res, { error: errorMessage });
      continue;
    }

    const usage = getUpstreamUsage(parsed);
    if (collector && usage) {
      collector.usage = mergeUsagePayload(collector.usage, usage);
    }

    const delta = getUpstreamDelta(parsed);
    if (delta) {
      sendSseChunk(res, { delta });
    }
  }
}

function getArticleNameFromQuery(req) {
  return typeof req.query?.fileName === 'string' ? req.query.fileName.trim() : '';
}

function respondChatStoreError(res, error) {
  if (error.code === 'INVALID_NAME' || error.code === 'INVALID_CONVERSATION_ID' || error.code === 'INVALID_ROLE' || error.code === 'INVALID_CONTENT') {
    return res.status(400).json({ error: error.message });
  }
  if (error.code === 'NOT_FOUND') {
    return res.status(404).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message });
}

function respondPromptStoreError(res, error) {
  if (error.code === 'INVALID_NAME' || error.code === 'INVALID_CONTENT') {
    return res.status(400).json({ error: error.message });
  }
  if (error.code === 'NOT_FOUND') {
    return res.status(404).json({ error: error.message });
  }
  return res.status(500).json({ error: error.message });
}

function get24HoursAgoIso() {
  return new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
}

function groupConversationSummariesByArticle(conversations) {
  const grouped = new Map();

  for (const conversation of conversations) {
    const articleName = conversation.articleName || '未分类文章';
    if (!grouped.has(articleName)) {
      grouped.set(articleName, []);
    }
    grouped.get(articleName).push({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messageCount,
      lastMessagePreview: conversation.lastMessagePreview || ''
    });
  }

  return Array.from(grouped.entries()).map(([articleName, articleConversations]) => ({
    articleName,
    conversations: articleConversations
  }));
}

async function getAdminTargetUser(req, res, userConfigManager) {
  const userId = typeof req.params?.userId === 'string' ? req.params.userId.trim() : '';

  try {
    assertValidUserId(userId);
  } catch (error) {
    res.status(400).json({ error: error.message });
    return null;
  }

  let user = null;
  try {
    user = await userConfigManager.getUserById(userId);
  } catch (error) {
    res.status(500).json({ error: '用户配置加载失败' });
    return null;
  }

  if (!user) {
    res.status(404).json({ error: '用户不存在' });
    return null;
  }

  return user;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function buildAdminUserSummary(user, sinceIso) {
  const providerDescriptor = getProviderDescriptor(user.provider);
  const [loginCount, aiUsageSummary] = await Promise.all([
    getLoginCountSince(user.userId, sinceIso),
    getAiUsageSummary(user.userId)
  ]);

  return {
    userId: user.userId,
    apiModel: user.provider?.api_model || null,
    providerKind: providerDescriptor.providerKind,
    loginCount,
    apiCallCount: aiUsageSummary.apiCallCount,
    tokenTrackingSupported: providerDescriptor.tokenTrackingSupported,
    tokenTotals: providerDescriptor.tokenTrackingSupported ? {
      inputTokens: aiUsageSummary.inputTokens,
      outputTokens: aiUsageSummary.outputTokens,
      totalTokens: aiUsageSummary.totalTokens
    } : null
  };
}

function mapUserConfigMutationError(error) {
  if (!error?.code) {
    return { status: 500, message: error?.message || '用户配置更新失败' };
  }

  if (error.code === 'USER_ID_EXISTS' || error.code === 'ACCESS_KEY_EXISTS') {
    return { status: 409, message: error.message };
  }

  if (
    error.code === 'RESERVED_ACCESS_KEY'
    || error.code === 'INVALID_JSON'
    || error.code === 'INVALID_USER_ID'
  ) {
    return { status: 400, message: error.message };
  }

  return { status: 400, message: error.message };
}

async function bootstrap() {
  const platformConfig = await loadPlatformConfig();
  const adminConfig = await loadAdminConfig();
  const userConfigManager = createUsersConfigManager({
    reservedAccessKeys: [adminConfig.accessKey]
  });
  const initialUserSnapshot = await userConfigManager.getSnapshot();
  const sessionStore = await createSessionStore();
  const requireUserAuth = createRequireUserAuth(userConfigManager);
  const trustProxy = parseTrustProxy(TRUST_PROXY_ENV);
  const resolvedTrustProxy = trustProxy === null ? 1 : trustProxy;

  // 清理不在配置文件中的用户数据（仅在 pm2 cluster 的第一个实例或非 cluster 模式下执行）
  const pmId = process.env.pm_id || process.env.NODE_APP_INSTANCE;
  const shouldCleanup = !pmId || pmId === '0';
  if (shouldCleanup) {
    const validUserIds = initialUserSnapshot.users.map((user) => user.userId);
    await cleanupOrphanedUsers(validUserIds);
  }

  async function cleanupDeletedUserArtifacts(userId) {
    await destroyUserSessions(sessionStore, userId);
    clearUserPromptSyncState(userId);
    clearUserPreferencesCache(userId);
    closeUserChatDatabase(userId);
    await deleteUserMetrics(userId);
    await deleteUserData(userId);
  }

  // 预加载 CET 词表到内存
  try {
    await loadCetWordList();
    console.log('[Cache] CET 词表已加载到内存');
  } catch (error) {
    console.warn('[Cache] CET 词表加载失败:', error.message);
  }

  app.set('trust proxy', resolvedTrustProxy);

  // #5 Compression 配置优化
  app.use(compression({
    threshold: 1024,  // 只压缩 >1KB 的响应
    level: 6,         // 压缩级别（1-9，6是平衡点）
    filter: (req, res) => {
      const responseContentType = String(res.getHeader('Content-Type') || '').toLowerCase();
      if (req.path === '/api/ai/chat/stream') return false;
      if (req.path === '/api/tts') return false;
      if (responseContentType.startsWith('text/event-stream')) return false;
      return compression.filter(req, res);
    }
  }));

  // #15 慢请求日志
  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;

      // 记录慢请求（>1秒）
      if (duration > 1000) {
        console.warn(`[Slow] ${req.method} ${req.path} ${duration}ms`);
      } else if (process.env.NODE_ENV !== 'production' && req.path.startsWith('/api/')) {
        console.log(`[API] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      }
    });

    next();
  });

  function hasVersionedAssetRequest(req) {
    const originalUrl = String(req?.originalUrl || '');
    const queryIndex = originalUrl.indexOf('?');
    if (queryIndex === -1) return false;
    return /(?:^|&)v=/.test(originalUrl.slice(queryIndex + 1));
  }

  // Static files - serve before session middleware to avoid unnecessary session lookups
  app.use(express.static(path.join(process.cwd(), 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
        if (process.env.NODE_ENV === 'production' && hasVersionedAssetRequest(res.req)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
      }
      else if (filePath.match(/\.(jpg|jpeg|png|gif|svg|ico|webp)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
      else if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    }
  }));

  // CSP 安全策略
  app.use((req, res, next) => {
    const connectSrcDirective = buildConnectSrcDirective();
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval' https://cdn.jsdelivr.net https://challenges.cloudflare.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data:; " +
      "media-src 'self' blob:; " +
      `connect-src ${connectSrcDirective}; ` +
      "frame-src 'self' https://challenges.cloudflare.com; " +
      "worker-src 'self' blob:;"
    );
    next();
  });

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use(
    session({
      store: sessionStore,
      name: 'reading_helper_sid',
      secret: platformConfig.session_secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto',
        maxAge: 3 * 60 * 60 * 1000  // 3 小时后过期
      }
    })
  );

  app.use(ensureCsrfToken);

  const loginRateLimiter = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    max: LOGIN_MAX_ATTEMPTS,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      authenticated: false,
      error: '登录尝试过于频繁，请稍后再试'
    }
  });

  app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    const inputKey = typeof req.body?.accessKey === 'string' ? req.body.accessKey.trim() : '';
    const turnstileToken =
      typeof req.body?.turnstileToken === 'string'
        ? req.body.turnstileToken.trim()
        : '';

    if (!turnstileToken) {
      return res.status(400).json({ authenticated: false, error: '缺少人机验证' });
    }

    try {
      const turnstileSecret =
        (process.env.TURNSTILE_SECRET_KEY ||
          process.env.CF_TURNSTILE_SECRET_KEY ||
          '').trim();

      if (!turnstileSecret) {
        console.error('Turnstile secret 未配置');
        return res.status(500).json({ authenticated: false, error: '人机验证服务未配置' });
      }

      const verifyPayload = new URLSearchParams({
        secret: turnstileSecret,
        response: turnstileToken,
        remoteip: typeof req.ip === 'string' ? req.ip : ''
      });

      const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: verifyPayload.toString()
      });

      let verifyData = null;
      try {
        verifyData = await verifyResponse.json();
      } catch (parseError) {
        console.error('Turnstile 验证响应解析失败:', parseError);
        return res.status(500).json({ authenticated: false, error: '人机验证服务异常' });
      }

      if (!verifyResponse.ok || verifyData?.success !== true) {
        console.warn('Turnstile 验证未通过:', {
          status: verifyResponse.status,
          hasToken: !!turnstileToken,
          errorCodes: Array.isArray(verifyData?.['error-codes']) ? verifyData['error-codes'] : [],
          hostname: verifyData?.hostname || ''
        });
        return res.status(400).json({ authenticated: false, error: '人机验证失败' });
      }
    } catch (error) {
      console.error('Turnstile 验证失败:', error);
      return res.status(500).json({ authenticated: false, error: '人机验证服务异常' });
    }

    let user = null;
    const isAdminLogin = !!inputKey && inputKey === adminConfig.accessKey;

    try {
      user = inputKey ? await userConfigManager.getUserByAccessKey(inputKey) : null;
    } catch (error) {
      console.error('[Auth] Failed to resolve access key:', error.message);
      return res.status(500).json({ authenticated: false, error: '用户配置加载失败' });
    }

    if (!user && !isAdminLogin) {
      return res.status(401).json({ authenticated: false, error: 'Invalid key' });
    }

    try {
      await regenerateSession(req);
    } catch (error) {
      console.error('会话重建失败:', error);
      return res.status(500).json({ authenticated: false, error: '会话初始化失败' });
    }

    req.session.authenticated = true;
    req.session.role = isAdminLogin ? 'admin' : 'user';
    req.session.userId = isAdminLogin ? '' : user.userId;

    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);

    if (!isAdminLogin) {
      try {
        await recordLoginEvent(user.userId);
      } catch (metricsError) {
        console.error('[AdminMetrics] Failed to record login event:', metricsError.message);
      }
    }

    try {
      return res.json(await buildAuthResponse(req, res, userConfigManager));
    } catch (error) {
      console.error('[Auth] Failed to build login response:', error.message);
      return res.status(500).json({ authenticated: false, error: '登录状态生成失败' });
    }
  });

  app.get('/api/auth/status', ensureCsrfToken, async (req, res) => {
    try {
      return res.json(await buildAuthResponse(req, res, userConfigManager));
    } catch (error) {
      console.error('[Auth] Failed to build auth status:', error.message);
      return res.status(500).json(buildLoggedOutAuthResponse());
    }
  });

  app.post('/api/auth/logout', csrfProtection, async (req, res) => {
    await invalidateSession(req, res);
    res.json(buildLoggedOutAuthResponse());
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (req, file, cb) => {
      if (!hasAllowedTextExtension(file.originalname)) {
        return cb(new Error('仅支持 .txt、.text 或 .md 文件'));
      }
      cb(null, true);
    }
  });

  app.post('/api/files/upload', requireUserAuth, csrfProtection, (req, res, next) => {
    upload.single('file')(req, res, (error) => {
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return next();
    });
  }, async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: '未接收到文件' });
    }

    try {
      const content = req.file.buffer.toString('utf8');
      const saved = await saveUploadedText(req.session.userId, req.file.originalname, content);
      return res.json(saved);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/files', requireUserAuth, async (req, res) => {
    try {
      const files = await listUploadedTexts(req.session.userId);
      return res.json({ files });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/files/:name', requireUserAuth, async (req, res) => {
    const { name } = req.params;
    try {
      const content = await readUploadedText(req.session.userId, name);
      return res.json({ name, content });
    } catch (error) {
      if (error.code === 'INVALID_NAME') {
        return res.status(400).json({ error: error.message });
      }
      if (error.code === 'NOT_FOUND') {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/files/:name', requireUserAuth, csrfProtection, async (req, res) => {
    const { name } = req.params;
    try {
      await deleteUploadedText(req.session.userId, name);
      await deleteArticleChatStore(req.session.userId, name);
      return res.json({ deleted: true, name });
    } catch (error) {
      if (error.code === 'INVALID_NAME') {
        return res.status(400).json({ error: error.message });
      }
      if (error.code === 'NOT_FOUND') {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/cet-word-list', requireUserAuth, async (req, res) => {
    try {
      const content = await loadCetWordList();
      return res.json({ content });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({ error: '未找到 CET 词表文件' });
      }
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/prompts', requireUserAuth, async (req, res) => {
    const userId = validateRequestedUserId(req, res);
    if (!userId) return;

    try {
      const prompts = await listPromptFiles(userId);
      return res.json({ prompts });
    } catch (error) {
      return respondPromptStoreError(res, error);
    }
  });

  app.get('/api/prompts/:name', requireUserAuth, async (req, res) => {
    const { name } = req.params;
    const userId = validateRequestedUserId(req, res);
    if (!userId) return;

    try {
      const content = await readPromptFile(userId, name);
      return res.json({ name, content });
    } catch (error) {
      return respondPromptStoreError(res, error);
    }
  });

  app.put('/api/prompts/:name', requireUserAuth, csrfProtection, async (req, res) => {
    const { name } = req.params;
    const content = req.body?.content;
    const userId = validateRequestedUserId(req, res);
    if (!userId) return;

    try {
      const saved = await writePromptFile(userId, name, content);
      return res.json({ ok: true, prompt: saved });
    } catch (error) {
      return respondPromptStoreError(res, error);
    }
  });

  app.get('/api/preferences', requireUserAuth, async (req, res) => {
    const userId = validateRequestedUserId(req, res);
    if (!userId) return;

    try {
      const preferences = await getPreferences(userId);
      return res.json(preferences);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/preferences', requireUserAuth, csrfProtection, async (req, res) => {
    const userId = validateRequestedUserId(req, res);
    if (!userId) return;

    try {
      const preferences = await savePreferences(userId, req.body);
      return res.json(preferences);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/chats', requireUserAuth, async (req, res) => {
    const articleName = getArticleNameFromQuery(req);
    if (!articleName) {
      return res.status(400).json({ error: 'fileName 不能为空' });
    }

    try {
      const conversations = await listConversations(req.session.userId, articleName);
      return res.json({ fileName: articleName, conversations });
    } catch (error) {
      return respondChatStoreError(res, error);
    }
  });

  app.post('/api/chats', requireUserAuth, csrfProtection, async (req, res) => {
    const articleName = getArticleNameFromQuery(req);
    if (!articleName) {
      return res.status(400).json({ error: 'fileName 不能为空' });
    }

    try {
      const conversation = await createConversation(req.session.userId, articleName);
      return res.json({ fileName: articleName, conversation });
    } catch (error) {
      return respondChatStoreError(res, error);
    }
  });

  app.get('/api/chats/:conversationId', requireUserAuth, async (req, res) => {
    const articleName = getArticleNameFromQuery(req);
    const { conversationId } = req.params;
    if (!articleName) {
      return res.status(400).json({ error: 'fileName 不能为空' });
    }

    try {
      const conversation = await getConversation(req.session.userId, articleName, conversationId);
      return res.json({ fileName: articleName, conversation });
    } catch (error) {
      return respondChatStoreError(res, error);
    }
  });

  app.delete('/api/chats/:conversationId', requireUserAuth, csrfProtection, async (req, res) => {
    const articleName = getArticleNameFromQuery(req);
    const { conversationId } = req.params;
    if (!articleName) {
      return res.status(400).json({ error: 'fileName 不能为空' });
    }

    try {
      const deleted = await deleteConversation(req.session.userId, articleName, conversationId);
      return res.json({ ok: true, deleted });
    } catch (error) {
      return respondChatStoreError(res, error);
    }
  });

  app.post('/api/chats/:conversationId/messages', requireUserAuth, csrfProtection, async (req, res) => {
    const articleName = getArticleNameFromQuery(req);
    const { conversationId } = req.params;
    const role = req.body?.role;
    const content = req.body?.content;
    const timestamp = req.body?.timestamp;

    if (!articleName) {
      return res.status(400).json({ error: 'fileName 不能为空' });
    }

    try {
      const interaction = await appendConversationMessage(req.session.userId, articleName, conversationId, role, content, timestamp);
      return res.json({ ok: true, interaction });
    } catch (error) {
      return respondChatStoreError(res, error);
    }
  });

  app.delete('/api/chats/:conversationId/messages', requireUserAuth, csrfProtection, async (req, res) => {
    const articleName = getArticleNameFromQuery(req);
    const { conversationId } = req.params;

    if (!articleName) {
      return res.status(400).json({ error: 'fileName 不能为空' });
    }

    try {
      const cleared = await clearConversation(req.session.userId, articleName, conversationId);
      return res.json({ ok: true, cleared });
    } catch (error) {
      return respondChatStoreError(res, error);
    }
  });

  app.get('/api/admin/users', requireAdminAuth, async (req, res) => {
    const sinceIso = get24HoursAgoIso();

    try {
      const users = await userConfigManager.listUsers();
      const summaries = await Promise.all(users.map((user) => buildAdminUserSummary(user, sinceIso)));
      return res.json({
        users: summaries,
        generatedAt: new Date().toISOString(),
        windowHours: 24
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/users', requireAdminAuth, csrfProtection, async (req, res) => {
    const provider = req.body?.provider && typeof req.body.provider === 'object'
      ? req.body.provider
      : {};

    try {
      const user = await userConfigManager.addUser({
        userId: req.body?.userId,
        accessKey: req.body?.accessKey,
        provider: {
          api_url: provider.api_url,
          api_key: provider.api_key,
          api_model: provider.api_model
        }
      });

      return res.status(201).json({ ok: true, user });
    } catch (error) {
      const mappedError = mapUserConfigMutationError(error);
      return res.status(mappedError.status).json({ error: mappedError.message });
    }
  });

  app.delete('/api/admin/users/:userId', requireAdminAuth, csrfProtection, async (req, res) => {
    const userId = typeof req.params?.userId === 'string' ? req.params.userId.trim() : '';

    try {
      assertValidUserId(userId);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const deletedUser = await userConfigManager.deleteUser(userId);
      if (!deletedUser) {
        return res.status(404).json({ error: '用户不存在' });
      }

      await cleanupDeletedUserArtifacts(userId);
      return res.json({ ok: true, deletedUserId: userId });
    } catch (error) {
      const mappedError = mapUserConfigMutationError(error);
      return res.status(mappedError.status).json({ error: mappedError.message });
    }
  });

  app.get('/api/admin/users/:userId/logins', requireAdminAuth, async (req, res) => {
    const targetUser = await getAdminTargetUser(req, res, userConfigManager);
    if (!targetUser) return;

    const sinceIso = get24HoursAgoIso();

    try {
      const [totalCount, events] = await Promise.all([
        getLoginCountSince(targetUser.userId, sinceIso),
        listLoginEventsSince(targetUser.userId, sinceIso)
      ]);

      return res.json({
        userId: targetUser.userId,
        totalCount,
        events,
        windowHours: 24
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users/:userId/ai-usage', requireAdminAuth, async (req, res) => {
    const targetUser = await getAdminTargetUser(req, res, userConfigManager);
    if (!targetUser) return;

    const providerDescriptor = getProviderDescriptor(targetUser.provider);

    try {
      const [summary, events] = await Promise.all([
        getAiUsageSummary(targetUser.userId),
        listAiUsageEvents(targetUser.userId)
      ]);

      return res.json({
        userId: targetUser.userId,
        apiCallCount: summary.apiCallCount,
        tokenTrackingSupported: providerDescriptor.tokenTrackingSupported,
        tokenTotals: providerDescriptor.tokenTrackingSupported ? {
          inputTokens: summary.inputTokens,
          outputTokens: summary.outputTokens,
          totalTokens: summary.totalTokens
        } : null,
        events
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users/:userId/chats', requireAdminAuth, async (req, res) => {
    const targetUser = await getAdminTargetUser(req, res, userConfigManager);
    if (!targetUser) return;

    try {
      const conversations = await listAllConversationSummaries(targetUser.userId);
      return res.json({
        userId: targetUser.userId,
        articles: groupConversationSummariesByArticle(conversations)
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users/:userId/chats/:conversationId', requireAdminAuth, async (req, res) => {
    const targetUser = await getAdminTargetUser(req, res, userConfigManager);
    if (!targetUser) return;

    try {
      const conversation = await getConversationRecordById(targetUser.userId, req.params.conversationId);
      if (!conversation) {
        return res.status(404).json({ error: '对话不存在' });
      }

      return res.json({
        userId: targetUser.userId,
        conversation
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ai/chat/stream', requireUserAuth, csrfProtection, async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const systemPrompt = typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt : '';
    if (!prompt) {
      return res.status(400).json({ error: 'prompt 不能为空' });
    }

    const user = req.currentUser;
    const providerConfig = user.provider;
    const providerDescriptor = getProviderDescriptor(providerConfig);
    const metricsCollector = {
      status: '',
      usage: null
    };
    const aiUsageEvent = {
      userId: user.userId,
      occurredAt: new Date().toISOString(),
      providerKind: providerDescriptor.providerKind,
      model: providerConfig.api_model,
      status: 'request_failed',
      inputTokens: null,
      outputTokens: null,
      totalTokens: null
    };
    let dispatchedUpstream = false;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    try {
      const requestBody = buildUpstreamRequestBody(providerConfig, systemPrompt, prompt, providerDescriptor);

      dispatchedUpstream = true;
      const upstreamResponse = await fetch(providerConfig.api_url, {
        method: 'POST',
        headers: buildUpstreamHeaders(providerConfig),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        agent: providerConfig.api_url.startsWith('https') ? httpsAgent : httpAgent
      });

      if (!upstreamResponse.ok || !upstreamResponse.body) {
        const errorText = await upstreamResponse.text();
        aiUsageEvent.status = 'upstream_http_error';
        sendSseChunk(res, { error: errorText || `上游请求失败: ${upstreamResponse.status}` });
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // #16 防止 buffer 过大
        if (buffer.length > MAX_SSE_BUFFER_SIZE) {
          console.warn('[SSE] Buffer overflow, resetting');
          buffer = buffer.slice(-1024); // 只保留最后 1KB
        }

        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          relayUpstreamChunk(chunk, res, metricsCollector);
        }
      }

      if (buffer.trim() !== '') {
        relayUpstreamChunk(buffer, res, metricsCollector);
      }

      aiUsageEvent.status = metricsCollector.status || 'completed';
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error) {
      if (error.name === 'AbortError') {
        aiUsageEvent.status = 'timeout';
        sendSseChunk(res, { error: 'AI 请求超时（120秒），请稍后重试' });
      } else {
        aiUsageEvent.status = 'request_failed';
        sendSseChunk(res, { error: error.message || '流式请求失败' });
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    } finally {
      clearTimeout(timeout);
      if (dispatchedUpstream) {
        const usage = providerDescriptor.tokenTrackingSupported ? metricsCollector.usage : null;
        aiUsageEvent.inputTokens = usage?.inputTokens ?? null;
        aiUsageEvent.outputTokens = usage?.outputTokens ?? null;
        aiUsageEvent.totalTokens = usage?.totalTokens ?? null;

        try {
          await recordAiUsageEvent(aiUsageEvent);
        } catch (metricsError) {
          console.error('[AdminMetrics] Failed to record AI usage event:', metricsError.message);
        }
      }
    }
  });

  app.post('/api/ai/connectivity-check', requireUserAuth, csrfProtection, async (req, res) => {
    const user = req.currentUser;
    const providerConfig = user.provider;

    // 构造最小探测请求体（max_tokens=1，不启用 stream）
    let probeBody;
    if (isAnthropicApi(providerConfig.api_url)) {
      probeBody = {
        model: providerConfig.api_model,
        max_tokens: 1,
        system: 'Reply with one word.',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false
      };
    } else if (isResponsesApi(providerConfig.api_url)) {
      probeBody = {
        model: providerConfig.api_model,
        instructions: 'Reply with one word.',
        input: 'Hi',
        max_output_tokens: 1,
        stream: false
      };
    } else {
      probeBody = {
        model: providerConfig.api_model,
        messages: [
          { role: 'system', content: 'Reply with one word.' },
          { role: 'user', content: 'Hi' }
        ],
        max_tokens: 1,
        stream: false
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
    const startTime = Date.now();

    try {
      const headers = buildUpstreamHeaders(providerConfig);
      // 探测请求不需要 SSE
      headers.Accept = 'application/json';

      const upstreamResponse = await fetch(providerConfig.api_url, {
        method: 'POST',
        headers,
        body: JSON.stringify(probeBody),
        signal: controller.signal,
        agent: providerConfig.api_url.startsWith('https') ? httpsAgent : httpAgent
      });

      const latencyMs = Date.now() - startTime;

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text().catch(() => '');
        let summary = errorText;
        try {
          const parsed = JSON.parse(errorText);
          summary = parsed?.error?.message || parsed?.error || errorText;
        } catch (_) {}
        const { errorCode, message } = resolveConnectivityHttpFailure(upstreamResponse.status);
        const safeSummary = toSafeSummary(String(summary || ''));
        return res.json({
          ok: false,
          latencyMs,
          status: upstreamResponse.status,
          errorCode,
          message,
          summary: safeSummary || undefined
        });
      }

      return res.json({ ok: true, latencyMs, status: upstreamResponse.status });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      if (error.name === 'AbortError') {
        return res.json({ ok: false, latencyMs, errorCode: 'TIMEOUT', message: '连接超时（10秒）' });
      }
      const networkFailure = resolveConnectivityNetworkFailure(error);
      return res.json({
        ok: false,
        latencyMs,
        errorCode: networkFailure.errorCode,
        message: networkFailure.message,
        summary: networkFailure.summary || undefined
      });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.post('/api/tts', requireUserAuth, csrfProtection, async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const voice = typeof req.body?.voice === 'string' ? req.body.voice.trim() : '';
    const rate = typeof req.body?.rate === 'string' ? req.body.rate.trim() : '';
    const volume = typeof req.body?.volume === 'string' ? req.body.volume.trim() : '';
    const pitch = typeof req.body?.pitch === 'string' ? req.body.pitch.trim() : '';

    if (!text) {
      return res.status(400).json({ error: 'text 不能为空' });
    }

    if (!voice) {
      return res.status(400).json({ error: 'voice 不能为空' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);

    try {
      const upstreamResponse = await fetch(EDGE_TTS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg, audio/*, application/octet-stream'
        },
        body: JSON.stringify({ text, voice, rate, volume, pitch }),
        signal: controller.signal,
        agent: EDGE_TTS_ENDPOINT.startsWith('https') ? httpsAgent : httpAgent
      });

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text();
        return res.status(upstreamResponse.status).json({
          error: errorText || `TTS 上游请求失败: ${upstreamResponse.status}`
        });
      }

      // 流式转发：边接收边发送，零内存缓冲
      res.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'audio/mpeg');
      const contentLength = upstreamResponse.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Cache-Control', 'no-store');

      // 将 Web ReadableStream 转换为 Node.js Readable 并管道传输
      const { Readable } = require('stream');
      const nodeStream = Readable.fromWeb(upstreamResponse.body);

      nodeStream.pipe(res);

      // 处理流错误
      nodeStream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'TTS 流传输失败' });
        } else {
          res.end();
        }
      });

      // 客户端断开连接时中止上游请求
      res.on('close', () => {
        controller.abort();
        nodeStream.destroy();
      });

    } catch (error) {
      if (error.name === 'AbortError') {
        return res.status(504).json({ error: 'TTS 请求超时，请稍后重试' });
      }
      return res.status(502).json({ error: error.message || 'TTS 请求失败' });
    } finally {
      clearTimeout(timeout);
    }
  });

  const server = app.listen(PORT, () => {
    console.log(`Reading Helper server listening on http://localhost:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[Server] Received ${signal}, closing HTTP server...`);
    closeAllChatDatabases();
    closeAdminMetricsDatabase();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  // #14 内存监控
  setInterval(() => {
    const usage = process.memoryUsage();
    const heapUsedMB = (usage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (usage.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (usage.rss / 1024 / 1024).toFixed(2);

    // 超过 1.5GB 时告警
    if (usage.heapUsed > 1.5 * 1024 * 1024 * 1024) {
      console.warn(`[Memory] High memory usage: Heap ${heapUsedMB}/${heapTotalMB} MB, RSS ${rssMB} MB`);
    } else {
      console.log(`[Memory] Heap ${heapUsedMB}/${heapTotalMB} MB, RSS ${rssMB} MB`);
    }
  }, 5 * 60 * 1000); // 每 5 分钟检查一次
}

bootstrap().catch((error) => {
  console.error('服务启动失败:', error.message);
  process.exit(1);
});
