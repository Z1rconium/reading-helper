const express = require('express');
const session = require('express-session');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const { loadPlatformConfig, loadUsersConfig } = require('./config-loader');
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

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_SYSTEM_PROMPT = '你是一位专业的英语老师，擅长用中文解释英语知识。';

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

  // 清理不在配置文件中的用户数据
  const validUserIds = users.map((user) => user.userId);
  await cleanupOrphanedUsers(validUserIds);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

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
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000
      }
    })
  );

  app.post('/api/auth/login', (req, res) => {
    const inputKey = typeof req.body?.accessKey === 'string' ? req.body.accessKey.trim() : '';
    const user = inputKey ? usersByAccessKey.get(inputKey) : null;

    if (!user) {
      return res.status(401).json({ authenticated: false, error: 'Invalid key' });
    }

    req.session.authenticated = true;
    req.session.userId = user.userId;
    return res.json({ authenticated: true, userId: user.userId });
  });

  app.get('/api/auth/status', (req, res) => {
    const authenticated = !!req.session?.authenticated && typeof req.session?.userId === 'string' && req.session.userId;
    return res.json({
      authenticated: !!authenticated,
      userId: authenticated ? req.session.userId : null
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('reading_helper_sid');
      res.json({ authenticated: false, userId: null });
    });
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (req, file, cb) => {
      if (!hasAllowedTextExtension(file.originalname)) {
        return cb(new Error('仅支持 .txt 或 .text 文件'));
      }
      cb(null, true);
    }
  });

  app.post('/api/files/upload', requireAuth, (req, res, next) => {
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

  app.delete('/api/files/:name', requireAuth, async (req, res) => {
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

  app.put('/api/prompts/:name', requireAuth, async (req, res) => {
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

  app.post('/api/chats', requireAuth, async (req, res) => {
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

  app.delete('/api/chats/:conversationId', requireAuth, async (req, res) => {
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

  app.post('/api/chats/:conversationId/messages', requireAuth, async (req, res) => {
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

  app.delete('/api/chats/:conversationId/messages', requireAuth, async (req, res) => {
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

  app.post('/api/ai/chat/stream', requireAuth, async (req, res) => {
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

    try {
      const requestBody = buildUpstreamRequestBody(providerConfig, systemPrompt, prompt);

      const upstreamResponse = await fetch(providerConfig.api_url, {
        method: 'POST',
        headers: buildUpstreamHeaders(providerConfig),
        body: JSON.stringify(requestBody)
      });

      if (!upstreamResponse.ok || !upstreamResponse.body) {
        const errorText = await upstreamResponse.text();
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
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          relayUpstreamChunk(chunk, res);
        }
      }

      if (buffer.trim() !== '') {
        relayUpstreamChunk(buffer, res);
      }
      console.log('[DEBUG] ========== Stream Complete ==========');

      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (error) {
      console.log('[DEBUG] Stream Error:', error.message);
      console.log('[DEBUG] Error Stack:', error.stack);
      sendSseChunk(res, { error: error.message || '流式请求失败' });
      res.write('data: [DONE]\n\n');
      return res.end();
    }
  });

  app.use(express.static(path.join(process.cwd(), 'public')));

  app.listen(PORT, () => {
    console.log(`Reading Helper server listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('服务启动失败:', error.message);
  process.exit(1);
});
