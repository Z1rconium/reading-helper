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

const { loadPlatformConfig, loadUsersConfig, getConfigDir } = require('./config-loader');
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
  writePromptFile
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
const { assertValidUserId } = require('./user-paths');
const { createSessionStore } = require('./session-store');
const { cleanupOrphanedUsers } = require('./cleanup-orphaned-users');
const { csrfProtection, ensureCsrfToken, generateCsrfToken, setCsrfCookie } = require('./csrf-protection');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_SYSTEM_PROMPT = '你是一位专业的英语老师，擅长用中文解释英语知识。';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const TRUST_PROXY_ENV = process.env.TRUST_PROXY;
const AI_REQUEST_TIMEOUT_MS = 120000; // 120 秒超时
const TTS_REQUEST_TIMEOUT_MS = 30000;
const MAX_SSE_BUFFER_SIZE = 10 * 1024; // 10KB
const EDGE_TTS_ENDPOINT = 'https://edge-tts.shaynewong.dpdns.org/tts';

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

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated && typeof req.session.userId === 'string' && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

function getSessionUserId(req) {
  return typeof req.session?.userId === 'string' ? req.session.userId.trim() : '';
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

function buildUserMaps(users) {
  const usersByAccessKey = new Map();
  const usersById = new Map();

  for (const user of users) {
    usersByAccessKey.set(user.accessKey, user);
    usersById.set(user.userId, user);
  }

  return { usersByAccessKey, usersById };
}

function sendSseChunk(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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

function buildUpstreamHeaders(providerConfig) {
  const headers = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json'
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

function buildUpstreamRequestBody(providerConfig, systemPrompt, userPrompt) {
  const effectiveSystemPrompt = typeof systemPrompt === 'string' && systemPrompt.trim()
    ? systemPrompt.trim()
    : DEFAULT_SYSTEM_PROMPT;

  if (isAnthropicApi(providerConfig.api_url)) {
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

  if (isResponsesApi(providerConfig.api_url)) {
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
    stream: true
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

async function loadCetWordList() {
  if (cetWordListCache !== null) {
    return cetWordListCache;
  }
  const filePath = path.join(getConfigDir(), 'cet_word_list.txt');
  cetWordListCache = await fs.readFile(filePath, 'utf8');
  return cetWordListCache;
}

function relayUpstreamChunk(chunk, res) {
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
      sendSseChunk(res, { error: errorMessage });
      continue;
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

async function bootstrap() {
  const platformConfig = await loadPlatformConfig();
  const users = await loadUsersConfig();
  const { usersByAccessKey, usersById } = buildUserMaps(users);
  const sessionStore = await createSessionStore();
  const trustProxy = parseTrustProxy(TRUST_PROXY_ENV);
  const resolvedTrustProxy = trustProxy === null ? 1 : trustProxy;

  // 清理不在配置文件中的用户数据（仅在 pm2 cluster 的第一个实例或非 cluster 模式下执行）
  const pmId = process.env.pm_id || process.env.NODE_APP_INSTANCE;
  const shouldCleanup = !pmId || pmId === '0';
  if (shouldCleanup) {
    const validUserIds = users.map((user) => user.userId);
    await cleanupOrphanedUsers(validUserIds);
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
      // 跳过已压缩的内容类型
      if (req.headers['x-no-compression']) return false;
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
      }

      // 记录所有 API 请求
      if (req.path.startsWith('/api/')) {
        console.log(`[API] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      }
    });

    next();
  });

  // CSP 安全策略
  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval' https://cdn.jsdelivr.net https://challenges.cloudflare.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data:; " +
      "media-src 'self' blob:; " +
      "connect-src 'self' https://kgzqxgimphwd.us-west-1.clawcloudrun.com https://edge-tts.shaynewong.dpdns.org https://cdn.jsdelivr.net; " +
      "frame-src 'self'; " +
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
    const capToken =
      typeof req.body?.capToken === 'string'
        ? req.body.capToken.trim()
        : (typeof req.body?.turnstileToken === 'string' ? req.body.turnstileToken.trim() : '');

    // 验证 Cap token
    if (!capToken) {
      return res.status(400).json({ authenticated: false, error: '缺少人机验证' });
    }

    try {
      const capApiEndpoint = (process.env.CAP_API_ENDPOINT || 'https://kgzqxgimphwd.us-west-1.clawcloudrun.com/ad54bf614d/').replace(/\/+$/, '/');
      const capSecret = (process.env.CAP_SECRET || process.env.CAP_SECRET_KEY || '').trim();
      const siteverifyUrl = new URL('siteverify', capApiEndpoint).toString();
      const legacyVerifyUrl = new URL('verify', capApiEndpoint).toString();

      let verifyResponse = null;
      let verifyData = null;
      let usedEndpoint = '';

      // Cap Standalone protocol: requires { secret, response } on /siteverify.
      if (capSecret) {
        usedEndpoint = siteverifyUrl;
        verifyResponse = await fetch(siteverifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            secret: capSecret,
            response: capToken
          })
        });
        verifyData = await verifyResponse.json();
      }

      // Legacy fallback for older custom verification services.
      if (!verifyData?.success && (!capSecret || verifyResponse?.status === 404)) {
        usedEndpoint = legacyVerifyUrl;
        verifyResponse = await fetch(legacyVerifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            token: capToken
          })
        });
        verifyData = await verifyResponse.json();
      }

      const verifySucceeded =
        verifyData?.success === true ||
        verifyData?.verified === true ||
        verifyData?.valid === true;

      if (!verifySucceeded) {
        if (!capSecret && usedEndpoint === legacyVerifyUrl) {
          console.error('Cap secret 未配置，且 legacy /verify 未验证通过:', {
            endpoint: usedEndpoint,
            status: verifyResponse?.status,
            response: verifyData
          });
        } else {
          console.warn('Cap 验证未通过:', {
            endpoint: usedEndpoint,
            status: verifyResponse?.status,
            hasToken: !!capToken,
            response: verifyData
          });
        }
        return res.status(400).json({ authenticated: false, error: '人机验证失败' });
      }
    } catch (error) {
      console.error('Cap 验证失败:', error);
      return res.status(500).json({ authenticated: false, error: '人机验证服务异常' });
    }

    const user = inputKey ? usersByAccessKey.get(inputKey) : null;

    if (!user) {
      return res.status(401).json({ authenticated: false, error: 'Invalid key' });
    }

    req.session.authenticated = true;
    req.session.userId = user.userId;

    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);

    return res.json({ authenticated: true, userId: user.userId, apiModel: user.provider?.api_model || null });
  });

  app.get('/api/auth/status', (req, res) => {
    const authenticated = !!req.session?.authenticated && typeof req.session?.userId === 'string' && req.session.userId;
    const user = authenticated ? usersById.get(req.session.userId) : null;
    return res.json({
      authenticated: !!authenticated,
      userId: authenticated ? req.session.userId : null,
      apiModel: user?.provider?.api_model || null
    });
  });

  app.post('/api/auth/logout', csrfProtection, (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('reading_helper_sid');
      res.clearCookie('csrf_token');
      res.json({ authenticated: false, userId: null });
    });
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

  app.post('/api/files/upload', requireAuth, csrfProtection, (req, res, next) => {
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

  app.get('/api/files', requireAuth, async (req, res) => {
    try {
      const files = await listUploadedTexts(req.session.userId);
      return res.json({ files });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/files/:name', requireAuth, async (req, res) => {
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

  app.delete('/api/files/:name', requireAuth, csrfProtection, async (req, res) => {
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

  app.get('/api/cet-word-list', requireAuth, async (req, res) => {
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

  app.get('/api/prompts', requireAuth, async (req, res) => {
    const userId = validateRequestedUserId(req, res);
    if (!userId) return;

    try {
      const prompts = await listPromptFiles(userId);
      return res.json({ prompts });
    } catch (error) {
      return respondPromptStoreError(res, error);
    }
  });

  app.get('/api/prompts/:name', requireAuth, async (req, res) => {
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

  app.put('/api/prompts/:name', requireAuth, csrfProtection, async (req, res) => {
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

  app.get('/api/chats', requireAuth, async (req, res) => {
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

  app.post('/api/chats', requireAuth, csrfProtection, async (req, res) => {
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

  app.get('/api/chats/:conversationId', requireAuth, async (req, res) => {
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

  app.delete('/api/chats/:conversationId', requireAuth, csrfProtection, async (req, res) => {
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

  app.post('/api/chats/:conversationId/messages', requireAuth, csrfProtection, async (req, res) => {
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

  app.delete('/api/chats/:conversationId/messages', requireAuth, csrfProtection, async (req, res) => {
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

  app.post('/api/ai/chat/stream', requireAuth, csrfProtection, async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const systemPrompt = typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt : '';
    if (!prompt) {
      return res.status(400).json({ error: 'prompt 不能为空' });
    }

    const user = usersById.get(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: '用户会话无效，请重新登录' });
    }
    const providerConfig = user.provider;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    try {
      const requestBody = buildUpstreamRequestBody(providerConfig, systemPrompt, prompt);

      const upstreamResponse = await fetch(providerConfig.api_url, {
        method: 'POST',
        headers: buildUpstreamHeaders(providerConfig),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        agent: providerConfig.api_url.startsWith('https') ? httpsAgent : httpAgent
      });

      if (!upstreamResponse.ok || !upstreamResponse.body) {
        const errorText = await upstreamResponse.text();
        sendSseChunk(res, { error: errorText || `上游请求失败: ${upstreamResponse.status}` });
        sendSseChunk(res, { delta: `\n\n*模型: ${providerConfig.api_model}*` });
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
          relayUpstreamChunk(chunk, res);
        }
      }

      if (buffer.trim() !== '') {
        relayUpstreamChunk(buffer, res);
      }

      sendSseChunk(res, { delta: `\n\n*模型: ${providerConfig.api_model}*` });
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error) {
      if (error.name === 'AbortError') {
        sendSseChunk(res, { error: 'AI 请求超时（120秒），请稍后重试' });
      } else {
        sendSseChunk(res, { error: error.message || '流式请求失败' });
      }
      sendSseChunk(res, { delta: `\n\n*模型: ${providerConfig.api_model}*` });
      res.write('data: [DONE]\n\n');
      return res.end();
    } finally {
      clearTimeout(timeout);
    }
  });

  app.post('/api/tts', requireAuth, csrfProtection, async (req, res) => {
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

  // Enable compression for all responses
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6
  }));

  // Serve node_modules for Cap.js widget
  app.use('/node_modules', express.static(path.join(process.cwd(), 'node_modules')));

  // Static files with optimized caching strategy
  app.use(express.static(path.join(process.cwd(), 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Cache CSS and JS files with revalidation (filenames are not fingerprinted)
      if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
      // Cache images for 1 week
      else if (filePath.match(/\.(jpg|jpeg|png|gif|svg|ico|webp)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
      // HTML files: no cache (always fresh)
      else if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    }
  }));

  app.listen(PORT, () => {
    console.log(`Reading Helper server listening on http://localhost:${PORT}`);
  });

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
