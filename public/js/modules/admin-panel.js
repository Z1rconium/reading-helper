let appRef = null;
let initialized = false;

const state = {
  users: [],
  selectedUserId: '',
  selectedDetailKey: 'chats',
  chatsCache: new Map(),
  aiUsageCache: new Map(),
  loginsCache: new Map(),
  conversationCache: new Map(),
  isSubmittingAddUser: false,
  isSubmittingDeleteUser: false,
  isRefreshingAllData: false
};

const DETAIL_TYPES = {
  chats: '聊天记录',
  logins: '近24h 登录次数',
  aiUsage: 'API 调用次数',
  tokens: 'Token 消耗'
};

const ADD_USER_FIELDS = [
  ['userId', 'userId'],
  ['accessKey', 'accessKey'],
  ['api_url', 'api_url'],
  ['api_key', 'api_key'],
  ['api_model', 'api_model']
];

const dom = {};

function setup(app) {
  appRef = app;
  cacheDom();
  bindEvents();
}

function cacheDom() {
  dom.shell = document.getElementById('admin-shell');
  dom.userList = document.getElementById('admin-user-list');
  dom.detailTypeList = document.getElementById('admin-detail-type-list');
  dom.detailTitle = document.getElementById('admin-detail-title');
  dom.detailSubtitle = document.getElementById('admin-detail-subtitle');
  dom.detailContent = document.getElementById('admin-detail-content');
  dom.selectedUserSummary = document.getElementById('admin-selected-user-summary');
  dom.refreshAllBtn = document.getElementById('admin-refresh-all-btn');
  dom.addUserBtn = document.getElementById('admin-add-user-btn');
  dom.deleteUserBtn = document.getElementById('admin-delete-user-btn');

  dom.addUserModal = document.getElementById('admin-add-user-modal');
  dom.addUserForm = document.getElementById('admin-add-user-form');
  dom.addUserError = document.getElementById('admin-add-user-error');
  dom.addUserIdInput = document.getElementById('admin-add-user-id');
  dom.addAccessKeyInput = document.getElementById('admin-add-access-key');
  dom.addApiUrlInput = document.getElementById('admin-add-api-url');
  dom.addApiKeyInput = document.getElementById('admin-add-api-key');
  dom.addApiModelInput = document.getElementById('admin-add-api-model');
  dom.addUserCancelBtn = document.getElementById('admin-add-user-cancel');
  dom.addUserSubmitBtn = document.getElementById('admin-add-user-submit');
  dom.closeAddUserModalBtn = document.getElementById('close-admin-add-user-modal');

  dom.deleteUserModal = document.getElementById('admin-delete-user-modal');
  dom.deleteUserForm = document.getElementById('admin-delete-user-form');
  dom.deleteUserSelect = document.getElementById('admin-delete-user-select');
  dom.deleteUserError = document.getElementById('admin-delete-user-error');
  dom.deleteUserCancelBtn = document.getElementById('admin-delete-user-cancel');
  dom.deleteUserSubmitBtn = document.getElementById('admin-delete-user-submit');
  dom.closeDeleteUserModalBtn = document.getElementById('close-admin-delete-user-modal');
}

function bindEvents() {
  if (initialized) {
    return;
  }

  dom.userList?.addEventListener('click', (event) => {
    const button = event.target.closest('.admin-user-button');
    if (!button || !dom.userList.contains(button)) return;
    void selectUser(button.dataset.userId || '');
  });

  dom.detailTypeList?.addEventListener('click', (event) => {
    const button = event.target.closest('.admin-detail-type-button');
    if (!button || !dom.detailTypeList.contains(button)) return;
    void selectDetail(button.dataset.detailKey || '');
  });

  dom.detailContent?.addEventListener('click', (event) => {
    const collapseButton = event.target.closest('.admin-chat-collapse');
    if (collapseButton && dom.detailContent.contains(collapseButton)) {
      void toggleConversation(collapseButton.dataset.userId || '', collapseButton.dataset.conversationId || '');
      return;
    }

    const button = event.target.closest('.admin-chat-toggle');
    if (!button || !dom.detailContent.contains(button)) return;
    void toggleConversation(button.dataset.userId || '', button.dataset.conversationId || '');
  });

  dom.addUserBtn?.addEventListener('click', () => {
    openAddUserModal();
  });
  dom.refreshAllBtn?.addEventListener('click', () => {
    void handleRefreshAllData();
  });
  dom.deleteUserBtn?.addEventListener('click', () => {
    openDeleteUserModal();
  });

  dom.closeAddUserModalBtn?.addEventListener('click', closeAddUserModal);
  dom.addUserCancelBtn?.addEventListener('click', closeAddUserModal);
  dom.addUserModal?.addEventListener('click', (event) => {
    if (event.target === dom.addUserModal && !state.isSubmittingAddUser) {
      closeAddUserModal();
    }
  });
  dom.addUserForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleAddUserSubmit();
  });

  dom.closeDeleteUserModalBtn?.addEventListener('click', closeDeleteUserModal);
  dom.deleteUserCancelBtn?.addEventListener('click', closeDeleteUserModal);
  dom.deleteUserModal?.addEventListener('click', (event) => {
    if (event.target === dom.deleteUserModal && !state.isSubmittingDeleteUser) {
      closeDeleteUserModal();
    }
  });
  dom.deleteUserForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleDeleteUserSubmit();
  });

  initialized = true;
}

function clearAdminCaches() {
  state.chatsCache.clear();
  state.aiUsageCache.clear();
  state.loginsCache.clear();
  state.conversationCache.clear();
}

function resetState() {
  state.users = [];
  state.selectedUserId = '';
  state.selectedDetailKey = 'chats';
  state.isSubmittingAddUser = false;
  state.isSubmittingDeleteUser = false;
  state.isRefreshingAllData = false;
  clearAdminCaches();
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function statusLabel(status) {
  const labels = {
    completed: '已完成',
    stream_error: '流异常',
    timeout: '超时',
    request_failed: '请求失败',
    upstream_http_error: '上游错误'
  };
  return labels[status] || status || '未知';
}

function renderLoading(message) {
  dom.detailContent.innerHTML = `
    <div class="admin-empty-state">
      <h3>加载中</h3>
      <p>${appRef.escapeHtml(message)}</p>
    </div>
  `;
}

function renderError(message) {
  dom.detailContent.innerHTML = `
    <div class="admin-empty-state admin-empty-state-error">
      <h3>加载失败</h3>
      <p>${appRef.escapeHtml(message)}</p>
    </div>
  `;
}

function renderEmpty(title, message) {
  dom.detailContent.innerHTML = `
    <div class="admin-empty-state">
      <h3>${appRef.escapeHtml(title)}</h3>
      <p>${appRef.escapeHtml(message)}</p>
    </div>
  `;
}

async function fetchAdminJson(url, options = {}) {
  const { body, headers = {}, ...rest } = options;
  const requestHeaders = { ...headers };
  const csrfToken = appRef.getCsrfToken?.();
  if (csrfToken) {
    requestHeaders['X-CSRF-Token'] = csrfToken;
  }

  let requestBody = body;
  if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== 'string') {
    requestHeaders['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    ...rest,
    headers: requestHeaders,
    body: requestBody
  });

  if (response.status === 401) {
    await appRef.checkAuthStatus();
    throw new Error('管理员会话已失效，请重新登录');
  }

  let data = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `请求失败: ${response.status}`);
  }

  return data;
}

function getSelectedUser() {
  return state.users.find((user) => user.userId === state.selectedUserId) || null;
}

function getAvailableDetailKeys(user) {
  const detailKeys = ['chats', 'logins', 'aiUsage'];
  if (user?.tokenTrackingSupported) {
    detailKeys.push('tokens');
  }
  return detailKeys;
}

function buildUserSummaryText(user) {
  if (!user) {
    return '请选择用户。';
  }

  const summaryParts = [
    `${user.userId}`,
    `登录 ${user.loginCount ?? 0} 次`,
    `AI ${user.apiCallCount ?? 0} 次`
  ];

  if (user.tokenTrackingSupported && user.tokenTotals) {
    summaryParts.push(`Token ${user.tokenTotals.totalTokens ?? 0}`);
  }

  return summaryParts.join(' · ');
}

function updateUserActionButtons() {
  const disableToolbarActions = state.isRefreshingAllData || state.isSubmittingAddUser || state.isSubmittingDeleteUser;

  if (dom.addUserBtn) {
    dom.addUserBtn.disabled = disableToolbarActions;
  }
  if (dom.deleteUserBtn) {
    dom.deleteUserBtn.disabled = disableToolbarActions || state.users.length === 0;
  }
  if (dom.refreshAllBtn) {
    dom.refreshAllBtn.disabled = disableToolbarActions || state.users.length === 0;
    dom.refreshAllBtn.textContent = state.isRefreshingAllData ? '刷新中...' : '刷新全部数据';
  }
}

function renderUserList() {
  updateUserActionButtons();

  if (!state.users.length) {
    dom.userList.innerHTML = '<li class="admin-list-empty">暂无可管理用户。</li>';
    return;
  }

  dom.userList.innerHTML = state.users.map((user) => {
    const isActive = user.userId === state.selectedUserId;
    return `
      <li>
        <button
          type="button"
          class="admin-user-button${isActive ? ' is-active' : ''}"
          data-user-id="${appRef.escapeHtml(user.userId)}"
        >
          <span class="admin-user-name">${appRef.escapeHtml(user.userId)}</span>
          <span class="admin-user-meta">${appRef.escapeHtml(user.apiModel || '未配置模型')}</span>
          <span class="admin-user-stats">登录 ${user.loginCount ?? 0} · AI ${user.apiCallCount ?? 0}</span>
        </button>
      </li>
    `;
  }).join('');
}

function renderDetailTypeList() {
  const user = getSelectedUser();

  if (!user) {
    dom.selectedUserSummary.textContent = state.users.length ? '请选择用户。' : '当前配置中没有普通用户。';
    dom.detailTypeList.innerHTML = '<li class="admin-list-empty">暂无详情类型可展示。</li>';
    return;
  }

  const availableKeys = getAvailableDetailKeys(user);
  if (!availableKeys.includes(state.selectedDetailKey)) {
    state.selectedDetailKey = availableKeys[0] || 'chats';
  }

  dom.selectedUserSummary.textContent = buildUserSummaryText(user);
  dom.detailTypeList.innerHTML = availableKeys.map((detailKey) => {
    const isActive = detailKey === state.selectedDetailKey;
    let badge = '';
    if (detailKey === 'logins') {
      badge = String(user?.loginCount ?? 0);
    } else if (detailKey === 'aiUsage') {
      badge = String(user?.apiCallCount ?? 0);
    } else if (detailKey === 'tokens') {
      badge = String(user?.tokenTotals?.totalTokens ?? 0);
    }

    return `
      <li>
        <button
          type="button"
          class="admin-detail-type-button${isActive ? ' is-active' : ''}"
          data-detail-key="${detailKey}"
        >
          <span>${DETAIL_TYPES[detailKey]}</span>
          ${badge ? `<span class="admin-detail-badge">${appRef.escapeHtml(badge)}</span>` : ''}
        </button>
      </li>
    `;
  }).join('');
}

function renderSummaryCards(cards) {
  return `
    <div class="admin-summary-grid">
      ${cards.map((card) => `
        <article class="admin-summary-card">
          <span class="admin-summary-label">${appRef.escapeHtml(card.label)}</span>
          <strong class="admin-summary-value">${appRef.escapeHtml(String(card.value))}</strong>
        </article>
      `).join('')}
    </div>
  `;
}

function renderLoginDetail(data, user) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const cards = [
    { label: '查看用户', value: user.userId },
    { label: '近24h 登录次数', value: data?.totalCount ?? 0 }
  ];

  const timeline = events.length
    ? `
      <div class="admin-timeline">
        ${events.map((event) => `
          <div class="admin-timeline-item">
            <span class="admin-timeline-dot"></span>
            <div>
              <div class="admin-timeline-title">成功登录</div>
              <div class="admin-timeline-meta">${appRef.escapeHtml(formatDateTime(event.loggedAt))}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `
    : '<div class="admin-empty-inline">最近 24 小时没有登录记录。</div>';

  dom.detailTitle.textContent = `${user.userId} · ${DETAIL_TYPES.logins}`;
  dom.detailSubtitle.textContent = '展示成功登录事件的时间线。';
  dom.detailContent.innerHTML = `${renderSummaryCards(cards)}${timeline}`;
}

function renderAiUsageDetail(data, user, options = {}) {
  const events = Array.isArray(data?.events) ? data.events : [];
  const showTokens = !!options.showTokens;
  const cards = showTokens
    ? [
      { label: '总 Token', value: data?.tokenTotals?.totalTokens ?? 0 },
      { label: '输入 Token', value: data?.tokenTotals?.inputTokens ?? 0 },
      { label: '输出 Token', value: data?.tokenTotals?.outputTokens ?? 0 }
    ]
    : [
      { label: '查看用户', value: user.userId },
      { label: '历史 API 调用', value: data?.apiCallCount ?? 0 },
      { label: '模型支持 Token', value: data?.tokenTrackingSupported ? '是' : '否' }
    ];

  const filteredEvents = showTokens
    ? events.filter((event) => typeof event.totalTokens === 'number')
    : events;

  const title = showTokens ? DETAIL_TYPES.tokens : DETAIL_TYPES.aiUsage;
  const subtitle = showTokens
    ? '展示全部历史中成功统计到 token usage 的调用事件。'
    : '按全部历史 AI 请求次数统计，不包含文件、提示词、TTS 与连通性检测。';

  const eventList = filteredEvents.length
    ? `
      <div class="admin-event-list">
        ${filteredEvents.map((event) => `
          <article class="admin-event-card">
            <div class="admin-event-row">
              <strong>${appRef.escapeHtml(formatDateTime(event.occurredAt))}</strong>
              <span class="admin-event-status">${appRef.escapeHtml(statusLabel(event.status))}</span>
            </div>
            <div class="admin-event-row admin-event-meta">
              <span>${appRef.escapeHtml(event.model || event.providerKind || '未知模型')}</span>
              <span>${appRef.escapeHtml(event.providerKind || 'custom')}</span>
            </div>
            ${showTokens ? `
              <div class="admin-token-row">
                <span>Total ${appRef.escapeHtml(String(event.totalTokens ?? 0))}</span>
                <span>Input ${appRef.escapeHtml(String(event.inputTokens ?? 0))}</span>
                <span>Output ${appRef.escapeHtml(String(event.outputTokens ?? 0))}</span>
              </div>
            ` : ''}
          </article>
        `).join('')}
      </div>
    `
    : `<div class="admin-empty-inline">${showTokens ? '当前没有可统计的历史 token 记录。' : '当前没有历史 AI 调用记录。'}</div>`;

  dom.detailTitle.textContent = `${user.userId} · ${title}`;
  dom.detailSubtitle.textContent = subtitle;
  dom.detailContent.innerHTML = `${renderSummaryCards(cards)}${eventList}`;
}

function renderChatList(data, user) {
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  if (!articles.length) {
    renderEmpty('暂无聊天记录', `${user.userId} 目前还没有持久化的聊天会话。`);
    return;
  }

  dom.detailTitle.textContent = `${user.userId} · ${DETAIL_TYPES.chats}`;
  dom.detailSubtitle.textContent = '按文章分组浏览历史会话，点击卡片展开完整消息流。';
  dom.detailContent.innerHTML = `
    <div class="admin-chat-groups">
      ${articles.map((article) => `
        <section class="admin-chat-group">
          <header class="admin-chat-group-head">
            <div>
              <span class="admin-chat-group-label">Article</span>
              <h3>${appRef.escapeHtml(article.articleName)}</h3>
            </div>
            <span class="admin-chat-group-count">${appRef.escapeHtml(String(article.conversations?.length || 0))} 个会话</span>
          </header>
          <div class="admin-chat-card-list">
            ${(article.conversations || []).map((conversation) => `
              <article class="admin-chat-card" data-conversation-id="${appRef.escapeHtml(conversation.id)}">
                <button
                  type="button"
                  class="admin-chat-toggle"
                  data-user-id="${appRef.escapeHtml(user.userId)}"
                  data-conversation-id="${appRef.escapeHtml(conversation.id)}"
                  aria-expanded="false"
                >
                  <span class="admin-chat-title">${appRef.escapeHtml(conversation.title || '新对话')}</span>
                  <span class="admin-chat-meta">${appRef.escapeHtml(formatDateTime(conversation.updatedAt))} · ${appRef.escapeHtml(String(conversation.messageCount || 0))} 条消息</span>
                  <span class="admin-chat-preview">${appRef.escapeHtml(conversation.lastMessagePreview || '点击查看完整对话')}</span>
                </button>
                <div class="admin-chat-body" aria-hidden="true"></div>
              </article>
            `).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `;
}

function renderConversationDetail(container, conversation) {
  const toggleButton = container.previousElementSibling;
  const conversationId = conversation?.id || toggleButton?.dataset.conversationId || '';
  const userId = toggleButton?.dataset.userId || '';
  const interactions = Array.isArray(conversation?.interactions) ? conversation.interactions : [];
  const title = conversation?.title || '新对话';
  const contentHtml = interactions.length
    ? interactions.map((interaction) => {
      const role = interaction.role === 'assistant' ? 'assistant' : 'user';
      const messageHtml = role === 'assistant'
        ? appRef.sanitizeAssistantHtml(interaction.content)
        : `<p>${appRef.escapeHtml(interaction.content)}</p>`;

      return `
        <article class="admin-message admin-message-${role}">
          <div class="admin-message-head">
            <span class="admin-message-role">${role === 'assistant' ? 'Assistant' : 'User'}</span>
            <span class="admin-message-time">${appRef.escapeHtml(formatDateTime(interaction.timestamp))}</span>
          </div>
          <div class="admin-message-body">${messageHtml}</div>
        </article>
      `;
    }).join('')
    : '<div class="admin-empty-inline">该会话暂无消息内容。</div>';

  renderConversationPanel(container, {
    userId,
    conversationId,
    metaText: `${title} · ${interactions.length} 条消息`,
    contentHtml
  });
}

function renderConversationPanel(container, options) {
  const userId = options?.userId || '';
  const conversationId = options?.conversationId || '';
  const metaText = options?.metaText || '完整对话';
  const contentHtml = options?.contentHtml || '<div class="admin-empty-inline">暂无内容。</div>';

  container.innerHTML = `
    <div class="admin-chat-body-head">
      <div class="admin-chat-body-summary">
        <span class="admin-chat-body-label">完整对话</span>
        <span class="admin-chat-body-meta">${appRef.escapeHtml(metaText)}</span>
      </div>
      <button
        type="button"
        class="admin-chat-collapse"
        data-user-id="${appRef.escapeHtml(userId)}"
        data-conversation-id="${appRef.escapeHtml(conversationId)}"
      >
        收起
      </button>
    </div>
    <div class="admin-chat-scroll-area">
      ${contentHtml}
    </div>
  `;
}

function setConversationExpanded(card, expanded) {
  const body = card?.querySelector('.admin-chat-body');
  const toggle = card?.querySelector('.admin-chat-toggle');
  const scrollArea = card?.querySelector('.admin-chat-scroll-area');
  if (!card || !body || !toggle) return;

  card.classList.toggle('is-expanded', expanded);
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  body.setAttribute('aria-hidden', expanded ? 'false' : 'true');

  if (!expanded) {
    body.scrollTop = 0;
    if (scrollArea) {
      scrollArea.scrollTop = 0;
    }
  }
}

function collapseExpandedConversations(scope, exceptCard = null) {
  if (!scope) return;

  scope.querySelectorAll('.admin-chat-card.is-expanded').forEach((card) => {
    if (card === exceptCard) return;
    setConversationExpanded(card, false);
  });
}

async function loadUsers() {
  const data = await fetchAdminJson('/api/admin/users');
  state.users = Array.isArray(data?.users) ? data.users : [];
  return state.users;
}

function cacheRequest(cache, key, loader) {
  if (!cache.has(key)) {
    const request = Promise.resolve()
      .then(loader)
      .catch((error) => {
        cache.delete(key);
        throw error;
      });
    cache.set(key, request);
  }

  return cache.get(key);
}

async function loadChats(userId, options = {}) {
  if (options.forceReload) {
    state.chatsCache.delete(userId);
  }
  return cacheRequest(
    state.chatsCache,
    userId,
    () => fetchAdminJson(`/api/admin/users/${encodeURIComponent(userId)}/chats`)
  );
}

async function loadLogins(userId, options = {}) {
  if (options.forceReload) {
    state.loginsCache.delete(userId);
  }
  return cacheRequest(
    state.loginsCache,
    userId,
    () => fetchAdminJson(`/api/admin/users/${encodeURIComponent(userId)}/logins`)
  );
}

async function loadAiUsage(userId, options = {}) {
  if (options.forceReload) {
    state.aiUsageCache.delete(userId);
  }
  return cacheRequest(
    state.aiUsageCache,
    userId,
    () => fetchAdminJson(`/api/admin/users/${encodeURIComponent(userId)}/ai-usage`)
  );
}

async function loadConversation(userId, conversationId) {
  const cacheKey = `${userId}:${conversationId}`;
  return cacheRequest(
    state.conversationCache,
    cacheKey,
    () => fetchAdminJson(`/api/admin/users/${encodeURIComponent(userId)}/chats/${encodeURIComponent(conversationId)}`)
  );
}

async function preloadUserDetailData(userId, options = {}) {
  await Promise.all([
    loadChats(userId, options),
    loadLogins(userId, options),
    loadAiUsage(userId, options)
  ]);
}

async function renderCurrentDetail() {
  const user = getSelectedUser();
  if (!user) {
    renderEmpty('没有可展示内容', state.users.length ? '当前没有用户可供查看。' : '当前配置中还没有普通用户。');
    return;
  }

  renderLoading(`正在加载 ${DETAIL_TYPES[state.selectedDetailKey]}...`);

  try {
    if (state.selectedDetailKey === 'chats') {
      renderChatList(await loadChats(user.userId), user);
      return;
    }

    if (state.selectedDetailKey === 'logins') {
      renderLoginDetail(await loadLogins(user.userId), user);
      return;
    }

    if (state.selectedDetailKey === 'aiUsage') {
      renderAiUsageDetail(await loadAiUsage(user.userId), user, { showTokens: false });
      return;
    }

    if (state.selectedDetailKey === 'tokens') {
      renderAiUsageDetail(await loadAiUsage(user.userId), user, { showTokens: true });
      return;
    }
  } catch (error) {
    renderError(error.message || '后台详情加载失败');
  }
}

async function selectUser(userId) {
  if (!userId || userId === state.selectedUserId) {
    return;
  }

  state.selectedUserId = userId;
  renderUserList();
  renderDetailTypeList();
  await renderCurrentDetail();
}

async function selectDetail(detailKey) {
  if (!detailKey || detailKey === state.selectedDetailKey) {
    return;
  }

  state.selectedDetailKey = detailKey;
  renderDetailTypeList();
  await renderCurrentDetail();
}

async function toggleConversation(userId, conversationId) {
  const card = dom.detailContent.querySelector(`.admin-chat-card[data-conversation-id="${CSS.escape(conversationId)}"]`);
  const body = card?.querySelector('.admin-chat-body');
  if (!card || !body) return;

  const isExpanded = card.classList.contains('is-expanded');
  if (isExpanded) {
    setConversationExpanded(card, false);
    return;
  }

  collapseExpandedConversations(card.closest('.admin-chat-card-list'), card);
  setConversationExpanded(card, true);
  renderConversationPanel(body, {
    userId,
    conversationId,
    metaText: '正在加载会话内容...',
    contentHtml: '<div class="admin-empty-inline">正在加载会话内容...</div>'
  });

  try {
    const data = await loadConversation(userId, conversationId);
    renderConversationDetail(body, data?.conversation);
  } catch (error) {
    renderConversationPanel(body, {
      userId,
      conversationId,
      metaText: '会话加载失败',
      contentHtml: `<div class="admin-empty-inline">${appRef.escapeHtml(error.message || '会话加载失败')}</div>`
    });
  }
}

function setModalError(element, message = '') {
  if (element) {
    element.textContent = message;
  }
}

function setAddUserSubmitting(isSubmitting) {
  state.isSubmittingAddUser = isSubmitting;
  updateUserActionButtons();
  if (dom.addUserSubmitBtn) {
    dom.addUserSubmitBtn.disabled = isSubmitting;
    dom.addUserSubmitBtn.textContent = isSubmitting ? '保存中...' : '保存用户';
  }
  if (dom.addUserCancelBtn) {
    dom.addUserCancelBtn.disabled = isSubmitting;
  }
}

function setDeleteUserSubmitting(isSubmitting) {
  state.isSubmittingDeleteUser = isSubmitting;
  updateUserActionButtons();
  if (dom.deleteUserSubmitBtn) {
    dom.deleteUserSubmitBtn.disabled = isSubmitting;
    dom.deleteUserSubmitBtn.textContent = isSubmitting ? '删除中...' : '确认删除';
  }
  if (dom.deleteUserCancelBtn) {
    dom.deleteUserCancelBtn.disabled = isSubmitting;
  }
  if (dom.deleteUserSelect) {
    dom.deleteUserSelect.disabled = isSubmitting;
  }
}

function setRefreshAllSubmitting(isSubmitting) {
  state.isRefreshingAllData = isSubmitting;
  updateUserActionButtons();
}

function openAddUserModal() {
  setModalError(dom.addUserError, '');
  dom.addUserForm?.reset();
  setAddUserSubmitting(false);
  if (dom.addUserModal) {
    dom.addUserModal.style.display = 'flex';
  }
  dom.addUserIdInput?.focus();
}

function closeAddUserModal() {
  if (state.isSubmittingAddUser) {
    return;
  }
  if (dom.addUserModal) {
    dom.addUserModal.style.display = 'none';
  }
  setModalError(dom.addUserError, '');
  dom.addUserForm?.reset();
}

function populateDeleteUserOptions(selectedUserId = '') {
  if (!dom.deleteUserSelect) {
    return;
  }

  if (!state.users.length) {
    dom.deleteUserSelect.innerHTML = '<option value="">暂无用户可删除</option>';
    dom.deleteUserSelect.value = '';
    return;
  }

  dom.deleteUserSelect.innerHTML = state.users.map((user) => `
    <option value="${appRef.escapeHtml(user.userId)}">${appRef.escapeHtml(user.userId)}</option>
  `).join('');

  const preferredUserId = state.users.some((user) => user.userId === selectedUserId)
    ? selectedUserId
    : state.selectedUserId || state.users[0].userId;
  dom.deleteUserSelect.value = preferredUserId;
}

function openDeleteUserModal() {
  if (!state.users.length) {
    return;
  }

  populateDeleteUserOptions(state.selectedUserId);
  setModalError(dom.deleteUserError, '');
  setDeleteUserSubmitting(false);
  if (dom.deleteUserModal) {
    dom.deleteUserModal.style.display = 'flex';
  }
  dom.deleteUserSelect?.focus();
}

function closeDeleteUserModal() {
  if (state.isSubmittingDeleteUser) {
    return;
  }
  if (dom.deleteUserModal) {
    dom.deleteUserModal.style.display = 'none';
  }
  setModalError(dom.deleteUserError, '');
}

function closeUserModals() {
  if (dom.addUserModal) {
    dom.addUserModal.style.display = 'none';
  }
  if (dom.deleteUserModal) {
    dom.deleteUserModal.style.display = 'none';
  }
  setModalError(dom.addUserError, '');
  setModalError(dom.deleteUserError, '');
  dom.addUserForm?.reset();
  setAddUserSubmitting(false);
  setDeleteUserSubmitting(false);
}

function getAddUserPayload() {
  return {
    userId: dom.addUserIdInput?.value.trim() || '',
    accessKey: dom.addAccessKeyInput?.value.trim() || '',
    provider: {
      api_url: dom.addApiUrlInput?.value.trim() || '',
      api_key: dom.addApiKeyInput?.value.trim() || '',
      api_model: dom.addApiModelInput?.value.trim() || ''
    }
  };
}

function validateAddUserPayload(payload) {
  const values = {
    userId: payload.userId,
    accessKey: payload.accessKey,
    api_url: payload.provider.api_url,
    api_key: payload.provider.api_key,
    api_model: payload.provider.api_model
  };

  for (const [fieldKey, fieldLabel] of ADD_USER_FIELDS) {
    if (!values[fieldKey]) {
      return `${fieldLabel} 不能为空`;
    }
  }

  return '';
}

async function refreshUsers(options = {}) {
  const preferredUserId = typeof options.selectedUserId === 'string'
    ? options.selectedUserId
    : state.selectedUserId;

  clearAdminCaches();
  await loadUsers();
  renderUserList();

  if (!state.users.length) {
    state.selectedUserId = '';
    state.selectedDetailKey = 'chats';
    renderDetailTypeList();
    renderEmpty('没有可管理用户', '当前配置中还没有普通用户，可通过右上角按钮直接添加。');
    return;
  }

  const nextSelectedUser = state.users.find((user) => user.userId === preferredUserId) || state.users[0];
  state.selectedUserId = nextSelectedUser.userId;
  renderUserList();
  renderDetailTypeList();
  await renderCurrentDetail();
}

async function handleRefreshAllData() {
  if (state.isRefreshingAllData || state.isSubmittingAddUser || state.isSubmittingDeleteUser) {
    return;
  }

  const preferredUserId = state.selectedUserId;
  renderLoading('正在刷新全部用户的全部项目数据...');
  setRefreshAllSubmitting(true);

  try {
    await loadUsers();
    clearAdminCaches();
    renderUserList();

    if (!state.users.length) {
      state.selectedUserId = '';
      state.selectedDetailKey = 'chats';
      renderDetailTypeList();
      renderEmpty('没有可管理用户', '当前配置中还没有普通用户，可通过右上角按钮直接添加。');
      return;
    }

    const nextSelectedUser = state.users.find((user) => user.userId === preferredUserId) || state.users[0];
    state.selectedUserId = nextSelectedUser.userId;
    renderUserList();
    renderDetailTypeList();

    await Promise.all(state.users.map((user) => preloadUserDetailData(user.userId, { forceReload: true })));
    await renderCurrentDetail();
  } catch (error) {
    renderError(error.message || '全量刷新失败');
  } finally {
    setRefreshAllSubmitting(false);
  }
}

async function handleAddUserSubmit() {
  if (state.isSubmittingAddUser) {
    return;
  }

  const payload = getAddUserPayload();
  const validationMessage = validateAddUserPayload(payload);
  if (validationMessage) {
    setModalError(dom.addUserError, validationMessage);
    return;
  }

  setModalError(dom.addUserError, '');
  setAddUserSubmitting(true);

  try {
    const data = await fetchAdminJson('/api/admin/users', {
      method: 'POST',
      body: payload
    });
    setAddUserSubmitting(false);
    closeAddUserModal();
    await refreshUsers({ selectedUserId: data?.user?.userId || payload.userId });
  } catch (error) {
    setModalError(dom.addUserError, error.message || '添加用户失败');
  } finally {
    setAddUserSubmitting(false);
  }
}

async function handleDeleteUserSubmit() {
  if (state.isSubmittingDeleteUser) {
    return;
  }

  const userId = dom.deleteUserSelect?.value.trim() || '';
  if (!userId) {
    setModalError(dom.deleteUserError, '请选择要删除的用户');
    return;
  }

  setModalError(dom.deleteUserError, '');
  setDeleteUserSubmitting(true);

  try {
    await fetchAdminJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
    setDeleteUserSubmitting(false);
    closeDeleteUserModal();
    await refreshUsers({
      selectedUserId: state.selectedUserId === userId ? '' : state.selectedUserId
    });
  } catch (error) {
    setModalError(dom.deleteUserError, error.message || '删除用户失败');
  } finally {
    setDeleteUserSubmitting(false);
  }
}

async function activateAdminPanel() {
  if (!appRef) {
    return;
  }

  resetState();
  closeUserModals();
  renderLoading('正在读取管理员后台数据...');

  try {
    await refreshUsers({ selectedUserId: '' });
  } catch (error) {
    renderError(error.message || '后台初始化失败');
  }
}

async function deactivateAdminPanel() {
  resetState();
  closeUserModals();
  if (dom.userList) {
    dom.userList.innerHTML = '';
  }
  if (dom.detailTypeList) {
    dom.detailTypeList.innerHTML = '';
  }
  if (dom.selectedUserSummary) {
    dom.selectedUserSummary.textContent = '请选择用户。';
  }
  if (dom.detailTitle) {
    dom.detailTitle.textContent = '后台管理面板';
  }
  if (dom.detailSubtitle) {
    dom.detailSubtitle.textContent = '选择左侧用户与详情类型后，这里会展示细节内容。';
  }
  updateUserActionButtons();
  renderEmpty('等待加载', '管理员登录后会在这里展示用户统计与聊天记录。');
}

export {
  activateAdminPanel,
  deactivateAdminPanel,
  setup
};
