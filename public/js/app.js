        // DOM元素
        const container = document.querySelector('.container');
        const fileList = document.getElementById('file-list');
        const fileHistory = document.getElementById('file-history');
        const refreshFileListBtn = document.getElementById('refresh-file-list');
        const textPanel = document.querySelector('.text-panel');
        const fileInput = document.getElementById('file-input');
        const fileNameDisplay = document.getElementById('file-name');

        const decreaseFontBtn = document.getElementById('decrease-font');
        const increaseFontBtn = document.getElementById('increase-font');
        const fontSizeDisplay = document.getElementById('font-size-display');

        const textContent = document.getElementById('text-content');
        const actionButtons = document.getElementById('action-buttons');
        const moreFuncsSelect = document.getElementById('morefuncs');

        const resizeHandle = document.getElementById('resize-handle');

        const chatPanel = document.querySelector('.chat-panel');
        const chatMessages = document.getElementById('chat-messages');
        const userInput = document.getElementById('user-input');
        const sendButton = document.getElementById('send-button');
        const articleContextToggle = document.getElementById('article-context-toggle');
        const clearChatBtn = document.getElementById('clear-chat-btn');
        const editPromptsBtn = document.getElementById('edit-prompts-btn');
        const historyChatBtn = document.getElementById('history-chat-btn');
        const newChatBtn = document.getElementById('new-chat-btn');
        const fileContextMenu = document.getElementById('file-context-menu');
        const deleteFileBtn = document.getElementById('delete-file-btn');
        const chatHistoryModal = document.getElementById('chat-history-modal');
        const closeChatHistoryModalBtn = document.getElementById('close-chat-history-modal');
        const chatHistoryList = document.getElementById('chat-history-list');
        const chatHistoryContextMenu = document.getElementById('chat-history-context-menu');
        const deleteChatHistoryBtn = document.getElementById('delete-chat-history-btn');
        const promptManagerModal = document.getElementById('prompt-manager-modal');
        const closePromptManagerModalBtn = document.getElementById('close-prompt-manager-modal');
        const promptListPanel = document.getElementById('prompt-list-panel');
        const promptListView = document.getElementById('prompt-list-view');
        const promptEditorPanel = document.getElementById('prompt-editor-panel');
        const promptEditorName = document.getElementById('prompt-editor-name');
        const promptEditorText = document.getElementById('prompt-editor-text');
        const promptEditorBackBtn = document.getElementById('prompt-editor-back-btn');
        const promptEditorSaveBtn = document.getElementById('prompt-editor-save-btn');
        const mindmapModal = document.getElementById('mindmap-modal');
        const closeMindmapModalBtn = document.getElementById('close-mindmap-modal');
        const mindmapModalTitle = document.getElementById('mindmap-modal-title');
        const mindmapStatus = document.getElementById('mindmap-status');
        const mindmapStage = document.getElementById('mindmap-stage');

        chatMessages.addEventListener('click', (event) => {
            const optionButton = event.target.closest('.rh-option');
            if (optionButton) {
                const card = optionButton.closest('.rh-question-card');
                if (!card) return;
                const correct = card.dataset.correctAnswer || '';
                const selected = optionButton.dataset.option || '';
                const options = card.querySelectorAll('.rh-option');
                options.forEach((btn) => {
                    btn.classList.remove('is-selected', 'is-correct', 'is-incorrect');
                });
                optionButton.classList.add('is-selected');

                const feedback = card.querySelector('.rh-feedback');
                if (selected && correct && selected === correct) {
                    optionButton.classList.add('is-correct');
                    if (feedback) {
                        feedback.textContent = 'Correct!';
                        feedback.classList.remove('is-incorrect');
                        feedback.classList.add('is-correct');
                    }
                } else {
                    optionButton.classList.add('is-incorrect');
                    const correctBtn = Array.from(options).find(
                        (btn) => (btn.dataset.option || '') === correct
                    );
                    if (correctBtn) {
                        correctBtn.classList.add('is-correct');
                    }
                    if (feedback) {
                        feedback.textContent = correct ? `Incorrect. Correct answer: ${correct}` : 'Incorrect.';
                        feedback.classList.remove('is-correct');
                        feedback.classList.add('is-incorrect');
                    }
                }
                return;
            }

            const mindmapButton = event.target.closest('.rh-view-mindmap');
            if (mindmapButton) {
                const card = mindmapButton.closest('.rh-mindmap-card');
                const encodedMarkdown = card?.dataset.markdown || '';
                openMindmapModal(decodeStructuredData(encodedMarkdown));
                return;
            }

            const toggleButton = event.target.closest('.rh-toggle-answer');
            if (toggleButton) {
                const card = toggleButton.closest('.rh-question-card');
                if (!card) return;
                const answer = card.querySelector('.rh-answer');
                if (!answer) return;
                const isVisible = answer.classList.toggle('is-visible');
                toggleButton.textContent = isVisible ? 'Hide Answer' : 'Show Answer';
                return;
            }

            const treeNode = event.target.closest('.tree .node.is-collapsible');
            if (treeNode) {
                const childrenContainer = treeNode.nextElementSibling;
                if (!childrenContainer || !childrenContainer.classList.contains('children')) {
                    return;
                }
                const isCollapsed = childrenContainer.classList.toggle('is-collapsed');
                treeNode.classList.toggle('is-collapsed', isCollapsed);
            }
        });


        // 当前选中的文本
        let currentSelection = '';
        let selectedRange = null;
        let pContent = '';

        let currentFileName = '';
        let currentFileContent = '';
        let currentConversationId = '';
        let creatingConversationPromise = null;
        let fontSize = 16; // 默认字体大小
        let currentUserId = '';
        let isVocabAnnotationEnabled = false;
        let cetWordLevelMap = null;
        let cetWordListPromise = null;

        // 拖动调整面板宽度功能
        let isResizing = false;
        let resizeStartX = 0;
        let resizeStartWidth = 0;
        let resizeMinWidth = 0;
        let resizeMaxWidth = 0;

        const authModal = document.getElementById('auth-modal');
        const accessKeyInput = document.getElementById('access-key');
        const loginBtn = document.getElementById('login-btn');
        const authError = document.getElementById('auth-error');
        const logoutBtn = document.getElementById('logout-btn');
        let turnstileToken = '';
        const serverFiles = new Set();
        const defaultTextContentHtml = '<p>请上传一个文本文件。</p><p>您可以选择单词、句子或段落，然后在右侧与AI助手交互。</p>';
        let contextMenuFileName = '';
        let contextMenuConversationId = '';
        let promptFileList = [];
        let activePromptFileName = '';
        let summaryEvaluationArmed = false;
        let summaryOriginalParagraph = '';
        const promptTemplateCache = new Map();

        const PROMPT_FILES = {
            explainWord: 'explain-word.md',
            analyzeSentence: 'analyze-sentence.md',
            colorSentence: 'color-sentence.md',
            summarizeParagraph: 'summarize-paragraph.md',
            summaryEvaluation: 'summary-evaluation.md',
            translateParagraph: 'translate-paragraph.md',
            mindmap: 'mindmap.md',
            qa: 'qa.md',
            mcq: 'mcq.md',
            tf: 'tf.md',
            sendButton: 'send-button.md'
        };
        const DEFAULT_CHAT_SYSTEM_PROMPT = '你是一位专业的英语老师。请回答学生关于英语学习的问题，要求：回答专业准确、重点清晰，并在需要时给出简短例子。';
        const MAX_ARTICLE_CONTEXT_CHARS = 12000;
        const HEARTBEAT_FOREGROUND_MS = 4 * 60 * 1000;
        const HEARTBEAT_BACKGROUND_MS = 10 * 60 * 1000;
        let heartbeatTimerId = 0;
        let heartbeatInFlight = false;
        const mindmapCache = new Map();
        let markmapTransformer = null;
        let currentMindmapInstance = null;
        let currentMindmapData = null;

        // Utility: Debounce function
        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // Utility: Simple hash function for caching
        function hashString(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString(36);
        }

        // Utility: Toggle fullscreen
        function toggleFullscreen(element) {
            if (!document.fullscreenElement) {
                element.requestFullscreen().catch(err => {
                });
            } else {
                document.exitFullscreen();
            }
        }

        function getMindmapZoomTransform(svgElement = null) {
            const svg = svgElement || mindmapStage?.querySelector('svg');
            if (!svg || !window.d3?.zoomTransform) {
                return null;
            }
            return window.d3.zoomTransform(svg);
        }

        function applyMindmapZoomTransform(instance, svg, transform) {
            if (
                !instance ||
                !svg ||
                !transform ||
                !instance.zoom ||
                !window.d3?.select ||
                !window.d3?.zoomIdentity
            ) {
                return;
            }

            const preservedTransform = window.d3.zoomIdentity
                .translate(transform.x, transform.y)
                .scale(transform.k);
            window.d3.select(svg).call(instance.zoom.transform, preservedTransform);
        }

        function stopHeartbeat() {
            if (heartbeatTimerId) {
                window.clearTimeout(heartbeatTimerId);
                heartbeatTimerId = 0;
            }
        }

        function getHeartbeatIntervalMs() {
            return document.visibilityState === 'visible' ? HEARTBEAT_FOREGROUND_MS : HEARTBEAT_BACKGROUND_MS;
        }

        function scheduleHeartbeat(delayMs = getHeartbeatIntervalMs()) {
            stopHeartbeat();
            heartbeatTimerId = window.setTimeout(() => {
                void sendHeartbeat('timer');
            }, delayMs);
        }

        async function sendHeartbeat(reason = 'manual') {
            if (!currentUserId) {
                stopHeartbeat();
                return;
            }
            if (heartbeatInFlight) {
                scheduleHeartbeat();
                return;
            }

            heartbeatInFlight = true;
            try {
                const response = await fetch('/api/auth/status', {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store'
                });

                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                if (!data?.authenticated) {
                }
            } catch (error) {
            } finally {
                heartbeatInFlight = false;
                if (currentUserId) {
                    scheduleHeartbeat();
                }
            }
        }

        function startHeartbeat() {
            if (!currentUserId) {
                stopHeartbeat();
                return;
            }
            scheduleHeartbeat();
        }

        function getCsrfToken() {
            const match = document.cookie.match(/csrf_token=([^;]+)/);
            return match ? match[1] : '';
        }

        function hideFileContextMenu() {
            fileContextMenu.style.display = 'none';
            contextMenuFileName = '';
        }

        function hideChatHistoryContextMenu() {
            chatHistoryContextMenu.style.display = 'none';
            contextMenuConversationId = '';
        }

        function showFileContextMenu(x, y) {
            fileContextMenu.style.display = 'block';

            const menuWidth = fileContextMenu.offsetWidth;
            const menuHeight = fileContextMenu.offsetHeight;
            const boundedLeft = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
            const boundedTop = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

            fileContextMenu.style.left = `${boundedLeft}px`;
            fileContextMenu.style.top = `${boundedTop}px`;
        }

        function showChatHistoryContextMenu(x, y) {
            chatHistoryContextMenu.style.display = 'block';

            const menuWidth = chatHistoryContextMenu.offsetWidth;
            const menuHeight = chatHistoryContextMenu.offsetHeight;
            const boundedLeft = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
            const boundedTop = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

            chatHistoryContextMenu.style.left = `${boundedLeft}px`;
            chatHistoryContextMenu.style.top = `${boundedTop}px`;
        }

        function showAuthModal() {
            accessKeyInput.value = '';
            authModal.style.display = 'flex';
        }

        function resetDeletedFileView(deletedFileName) {
            if (currentFileName !== deletedFileName) return;

            currentFileName = '';
            currentFileContent = '';
            currentSelection = '';
            selectedRange = null;
            pContent = '';
            currentConversationId = '';
            creatingConversationPromise = null;
            resetVocabAnnotationState();
            resetSummaryEvaluationState();

            fileNameDisplay.textContent = '未选择文件';
            textContent.innerHTML = defaultTextContentHtml;
            chatMessages.innerHTML = '';
            addSystemMessage(`已删除文件: ${deletedFileName}`);
        }

        function resetSummaryEvaluationState() {
            summaryEvaluationArmed = false;
            summaryOriginalParagraph = '';
        }

        function resetPromptState() {
            promptTemplateCache.clear();
            promptFileList = [];
            activePromptFileName = '';
            closePromptManager();
        }

        function isSummaryEvaluationPrompt(promptText) {
            const text = String(promptText || '');
            if (!text) return false;
            return text.includes('学生概括') && text.includes('段落原文') && text.includes('评价');
        }

        function isArticleContextEnabled() {
            return !!articleContextToggle?.checked;
        }

        function getArticleContextText() {
            const articleText = String(currentFileContent || '').trim();
            if (!articleText) return '';
            if (articleText.length <= MAX_ARTICLE_CONTEXT_CHARS) {
                return articleText;
            }
            return `${articleText.slice(0, MAX_ARTICLE_CONTEXT_CHARS)}\n\n[文章较长，以上为前 ${MAX_ARTICLE_CONTEXT_CHARS} 个字符]`;
        }

        async function checkAuthStatus() {
            const previousUserId = currentUserId;
            try {
                const response = await fetch('/api/auth/status', {
                    method: 'GET',
                    credentials: 'include'
                });
                if (!response.ok) throw new Error(`状态检查失败: ${response.status}`);

                const data = await response.json();
                const authenticated = !!data.authenticated;
                const nextUserId = authenticated && typeof data.userId === 'string' ? data.userId : '';
                if (!authenticated || (previousUserId && previousUserId !== nextUserId)) {
                    resetPromptState();
                }
                currentUserId = nextUserId;
                if (authenticated) {
                    authModal.style.display = 'none';
                    startHeartbeat();
                } else {
                    serverFiles.clear();
                    updateFileList();
                    showAuthModal();
                    stopHeartbeat();
                }
                authError.style.display = 'none';
                if (authenticated) {
                    accessKeyInput.value = '';
                    logoutBtn.title = currentUserId ? `当前用户: ${currentUserId}` : '退出';
                }
                return authenticated;
            } catch (error) {
                resetPromptState();
                serverFiles.clear();
                updateFileList();
                currentUserId = '';
                stopHeartbeat();
                showAuthModal();
                return false;
            }
        }

        async function login() {
            const accessKey = accessKeyInput.value.trim();
            if (!accessKey) {
                authError.textContent = '请输入访问 Key';
                authError.style.display = 'block';
                return;
            }

            if (!turnstileToken) {
                authError.textContent = '请完成人机验证';
                authError.style.display = 'block';
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': getCsrfToken()
                    },
                    body: JSON.stringify({ accessKey, turnstileToken })
                });

                if (response.status === 401) {
                    authError.textContent = '访问 Key 无效，请重试。';
                    authError.style.display = 'block';
                    resetTurnstile();
                    return;
                }
                if (!response.ok) {
                    const data = await response.json();
                    authError.textContent = data.error || `登录失败: ${response.status}`;
                    authError.style.display = 'block';
                    resetTurnstile();
                    return;
                }

                const data = await response.json();
                const nextUserId = typeof data.userId === 'string' ? data.userId : '';
                if (!nextUserId || currentUserId !== nextUserId) {
                    resetPromptState();
                }
                currentUserId = nextUserId;
                authError.style.display = 'none';
                authModal.style.display = 'none';
                logoutBtn.title = currentUserId ? `当前用户: ${currentUserId}` : '退出';
                startHeartbeat();
                await fetchServerFileList();
                updateFileList();
            } catch (error) {
                authError.style.display = 'block';
            }
        }

        async function logout() {
            stopHeartbeat();
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'X-CSRF-Token': getCsrfToken()
                    }
                });
            } catch (error) {
            }

            serverFiles.clear();
            currentUserId = '';
            currentFileName = '';
            currentFileContent = '';
            currentConversationId = '';
            creatingConversationPromise = null;
            resetVocabAnnotationState();
            resetSummaryEvaluationState();
            logoutBtn.title = '退出';
            resetPromptState();
            fileNameDisplay.textContent = '未选择文件';
            textContent.innerHTML = defaultTextContentHtml;
            clearChatPanel();
            updateFileList();
            await checkAuthStatus();
        }

        async function fetchServerFileList() {
            try {
                const response = await fetch('/api/files', {
                    method: 'GET',
                    credentials: 'include'
                });

                if (response.status === 401) {
                    await checkAuthStatus();
                    return;
                }
                if (!response.ok) throw new Error(`读取服务器文件列表失败: ${response.status}`);

                const data = await response.json();
                const files = Array.isArray(data.files) ? data.files : [];

                serverFiles.clear();
                files.forEach(item => {
                    const name = typeof item === 'string' ? item : item.name;
                    if (name) serverFiles.add(name);
                });
            } catch (error) {
            }
        }

        async function uploadFileToServer(file) {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/files/upload', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                },
                body: formData
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再上传文件');
            }
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `上传失败: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.name) {
                serverFiles.add(data.name);
            }
            return data;
        }

        async function fetchServerFileContent(fileName) {
            const response = await fetch(`/api/files/${encodeURIComponent(fileName)}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再读取服务器文件');
            }
            if (!response.ok) {
                throw new Error(`读取服务器文件失败: ${response.status}`);
            }

            const data = await response.json();
            return typeof data.content === 'string' ? data.content : '';
        }

        async function deleteServerFile(fileName) {
            const response = await fetch(`/api/files/${encodeURIComponent(fileName)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再删除服务器文件');
            }

            let data = null;
            try {
                data = await response.json();
            } catch (error) {
                data = null;
            }

            if (!response.ok) {
                throw new Error(data?.error || `删除服务器文件失败: ${response.status}`);
            }
        }

        async function fetchPromptFileList() {
            const userId = await ensurePromptUserId();
            const response = await fetch(`/api/prompts?userId=${encodeURIComponent(userId)}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再读取提示词列表');
            }
            if (!response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                throw new Error(data?.error || `读取提示词列表失败: ${response.status}`);
            }

            const data = await response.json();
            const prompts = Array.isArray(data.prompts) ? data.prompts : [];
            promptFileList = prompts
                .map((item) => (typeof item === 'string' ? item : item.name))
                .filter((name) => typeof name === 'string' && name.trim());
            return promptFileList;
        }

        async function fetchPromptFileContent(fileName, forceRefresh = false) {
            if (!forceRefresh && promptTemplateCache.has(fileName)) {
                return promptTemplateCache.get(fileName);
            }

            const userId = await ensurePromptUserId();
            const response = await fetch(`/api/prompts/${encodeURIComponent(fileName)}?userId=${encodeURIComponent(userId)}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再读取提示词');
            }
            if (!response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                throw new Error(data?.error || `读取提示词失败: ${response.status}`);
            }

            const data = await response.json();
            const content = typeof data.content === 'string' ? data.content : '';
            promptTemplateCache.set(fileName, content);
            return content;
        }

        async function savePromptFileContent(fileName, content) {
            const userId = await ensurePromptUserId();
            const response = await fetch(`/api/prompts/${encodeURIComponent(fileName)}`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken()
                },
                body: JSON.stringify({ userId, content })
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再保存提示词');
            }
            if (!response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                throw new Error(data?.error || `保存提示词失败: ${response.status}`);
            }

            promptTemplateCache.set(fileName, content);
        }

        function fillPromptTemplate(template, variables) {
            return String(template || '').replace(/\$\{([^}]+)\}/g, (match, key) => {
                const variableKey = String(key || '').trim();
                if (Object.prototype.hasOwnProperty.call(variables, variableKey)) {
                    const value = variables[variableKey];
                    return value === undefined || value === null ? '' : String(value);
                }
                return match;
            });
        }

        async function ensurePromptUserId() {
            if (currentUserId) {
                return currentUserId;
            }

            await checkAuthStatus();
            if (!currentUserId) {
                throw new Error('请先登录后再操作提示词');
            }

            return currentUserId;
        }

        async function buildSystemPrompt(fileName, variables = {}, forceRefresh = false) {
            const template = await fetchPromptFileContent(fileName, forceRefresh);
            return fillPromptTemplate(template, variables).trim();
        }

        async function listChatConversations(fileName) {
            const response = await fetch(`/api/chats?fileName=${encodeURIComponent(fileName)}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再读取历史记录');
            }
            if (!response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                throw new Error(data?.error || `读取历史记录失败: ${response.status}`);
            }

            const data = await response.json();
            return Array.isArray(data.conversations) ? data.conversations : [];
        }

        async function createChatConversation(fileName) {
            const response = await fetch(`/api/chats?fileName=${encodeURIComponent(fileName)}`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再创建对话');
            }
            if (!response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                throw new Error(data?.error || `创建对话失败: ${response.status}`);
            }

            const data = await response.json();
            if (!data?.conversation?.id) {
                throw new Error('创建对话失败: 缺少对话ID');
            }
            return data.conversation;
        }

        async function getChatConversation(fileName, conversationId) {
            const response = await fetch(`/api/chats/${encodeURIComponent(conversationId)}?fileName=${encodeURIComponent(fileName)}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再读取对话');
            }
            if (!response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                throw new Error(data?.error || `读取对话失败: ${response.status}`);
            }

            const data = await response.json();
            return data.conversation || null;
        }

        async function appendChatMessage(fileName, conversationId, role, content, timestamp) {
            const response = await fetch(`/api/chats/${encodeURIComponent(conversationId)}/messages?fileName=${encodeURIComponent(fileName)}`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': getCsrfToken()
                },
                body: JSON.stringify({ role, content, timestamp })
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再保存对话');
            }
            if (!response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                throw new Error(data?.error || `保存对话失败: ${response.status}`);
            }
        }

        async function clearChatConversation(fileName, conversationId) {
            const response = await fetch(`/api/chats/${encodeURIComponent(conversationId)}/messages?fileName=${encodeURIComponent(fileName)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再清空对话');
            }
            if (!response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                throw new Error(data?.error || `清空对话失败: ${response.status}`);
            }
        }

        async function deleteChatConversationRecord(fileName, conversationId) {
            const response = await fetch(`/api/chats/${encodeURIComponent(conversationId)}?fileName=${encodeURIComponent(fileName)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                }
            });

            if (response.status === 401) {
                await checkAuthStatus();
                throw new Error('请先登录后再删除历史记录');
            }
            if (!response.ok) {
                let data = null;
                try {
                    data = await response.json();
                } catch (error) {
                    data = null;
                }
                throw new Error(data?.error || `删除历史记录失败: ${response.status}`);
            }
        }

        async function handleDeleteFile(fileName) {
            if (!fileName) return;
            const confirmed = window.confirm(`确定删除「${fileName}」吗？`);
            if (!confirmed) return;

            try {
                const deletingCurrentFile = currentFileName === fileName;
                if (serverFiles.has(fileName)) {
                    await deleteServerFile(fileName);
                }
                serverFiles.delete(fileName);
                resetDeletedFileView(fileName);
                if (!deletingCurrentFile) {
                    addSystemMessage(`已删除文件: ${fileName}`);
                }
                await fetchServerFileList();
                updateFileList();
            } catch (error) {
                addSystemMessage(`删除失败: ${error.message}`);
            }
        }

        function clearChatPanel() {
            chatMessages.innerHTML = '';
        }

        function highlightCurrentFile() {
            Array.from(fileList.children).forEach((li) => {
                li.classList.toggle('active', li.dataset.fileName === currentFileName);
            });
        }

        function buildArticleParagraphHtml(line, levelMap = null) {
            const normalizedLine = String(line || '').trim().split(/\s+/).join(' ');
            if (!normalizedLine) return '';

            if (!(levelMap instanceof Map) || levelMap.size === 0) {
                return `<p>${escapeHtml(normalizedLine)}</p>`;
            }

            let html = '';
            let lastIndex = 0;
            const wordPattern = /[A-Za-z]+/g;
            let match = wordPattern.exec(normalizedLine);

            while (match) {
                const [word] = match;
                const offset = match.index;
                html += escapeHtml(normalizedLine.slice(lastIndex, offset));

                const level = levelMap.get(word.toLowerCase());
                if (level === 4 || level === 6) {
                    html += `<span class="cet-word cet-${level}">${escapeHtml(word)}</span>`;
                } else {
                    html += escapeHtml(word);
                }

                lastIndex = offset + word.length;
                match = wordPattern.exec(normalizedLine);
            }

            html += escapeHtml(normalizedLine.slice(lastIndex));
            return `<p>${html}</p>`;
        }

        function renderArticleContent(content) {
            const levelMap = isVocabAnnotationEnabled ? cetWordLevelMap : null;
            textContent.innerHTML = String(content || '')
                .split('\n')
                .map((line) => buildArticleParagraphHtml(line, levelMap))
                .join('');
        }

        function parseCetWordList(content) {
            const wordLevelMap = new Map();
            let currentLevel = 0;

            String(content || '')
                .split(/\r?\n/)
                .forEach((rawLine) => {
                    const line = rawLine.trim().toLowerCase();
                    if (!line) return;

                    const levelMatch = line.match(/^([46])(.+)$/);
                    if (levelMatch) {
                        currentLevel = Number(levelMatch[1]);
                        const baseWord = levelMatch[2].trim();
                        if (baseWord) {
                            wordLevelMap.set(baseWord, currentLevel);
                        }
                        return;
                    }

                    if (currentLevel === 4 || currentLevel === 6) {
                        wordLevelMap.set(line, currentLevel);
                    }
                });

            return wordLevelMap;
        }

        async function fetchCetWordList() {
            if (cetWordLevelMap instanceof Map) {
                return cetWordLevelMap;
            }

            if (!cetWordListPromise) {
                cetWordListPromise = (async () => {
                    const response = await fetch('/api/cet-word-list', {
                        method: 'GET',
                        credentials: 'include'
                    });

                    if (response.status === 401) {
                        await checkAuthStatus();
                        throw new Error('请先登录后再读取 CET 词表');
                    }
                    if (!response.ok) {
                        let data = null;
                        try {
                            data = await response.json();
                        } catch (error) {
                            data = null;
                        }
                        throw new Error(data?.error || `读取 CET 词表失败: ${response.status}`);
                    }

                    const data = await response.json();
                    cetWordLevelMap = parseCetWordList(data?.content || '');
                    return cetWordLevelMap;
                })().catch((error) => {
                    cetWordListPromise = null;
                    throw error;
                });
            }

            return cetWordListPromise;
        }

        function resetVocabAnnotationState() {
            isVocabAnnotationEnabled = false;
            if (moreFuncsSelect) {
                moreFuncsSelect.value = '';
            }
        }

        async function toggleVocabAnnotation() {
            if (!currentFileContent.trim()) {
                addSystemMessage('请先选择一篇文章。');
                return;
            }

            if (isVocabAnnotationEnabled) {
                isVocabAnnotationEnabled = false;
                renderArticleContent(currentFileContent);
                return;
            }

            await fetchCetWordList();
            isVocabAnnotationEnabled = true;
            renderArticleContent(currentFileContent);
        }

        function renderConversationMessages(interactions) {
            clearChatPanel();
            (Array.isArray(interactions) ? interactions : []).forEach((interaction) => {
                if (!interaction || !interaction.content) return;

                const messageElement = document.createElement('div');
                if (interaction.role === 'user') {
                    messageElement.className = 'message user-message';
                    messageElement.textContent = interaction.content;
                } else if (interaction.role === 'assistant') {
                    messageElement.className = 'message ai-message';
                    messageElement.innerHTML = sanitizeAssistantHtml(interaction.content);
                } else {
                    return;
                }
                chatMessages.appendChild(messageElement);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function startNewConversation() {
            currentConversationId = '';
            creatingConversationPromise = null;
            resetSummaryEvaluationState();
            clearChatPanel();
            chatHistoryModal.style.display = 'none';
            hideChatHistoryContextMenu();
        }

        function formatDateTime(value) {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '--';
            return date.toLocaleString('zh-CN', { hour12: false });
        }

        async function ensureActiveConversation() {
            if (!currentFileName) return '';
            if (currentConversationId) return currentConversationId;
            if (creatingConversationPromise) return creatingConversationPromise;

            creatingConversationPromise = (async () => {
                const created = await createChatConversation(currentFileName);
                currentConversationId = created.id;
                return created.id;
            })();

            try {
                return await creatingConversationPromise;
            } finally {
                creatingConversationPromise = null;
            }
        }

        function renderChatHistoryList(conversations) {
            chatHistoryList.innerHTML = '';
            if (!Array.isArray(conversations) || conversations.length === 0) {
                const emptyNode = document.createElement('li');
                emptyNode.className = 'chat-history-empty';
                emptyNode.textContent = '该文章暂无历史记录。';
                chatHistoryList.appendChild(emptyNode);
                return;
            }

            conversations.forEach((conversation) => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'chat-history-item';
                button.dataset.conversationId = conversation.id;

                const title = document.createElement('div');
                title.className = 'chat-history-title';
                title.textContent = conversation.title || '新对话';

                const meta = document.createElement('div');
                meta.className = 'chat-history-meta';
                meta.textContent = `${formatDateTime(conversation.updatedAt)} · ${conversation.messageCount || 0}条消息`;

                button.appendChild(title);
                button.appendChild(meta);
                button.addEventListener('click', async () => {
                    await loadConversationById(conversation.id);
                });
                li.appendChild(button);
                chatHistoryList.appendChild(li);
            });
        }

        async function openChatHistory() {
            if (!currentFileName) {
                addSystemMessage('请先选择一篇文章。');
                return;
            }

            try {
                hideChatHistoryContextMenu();
                const conversations = await listChatConversations(currentFileName);
                renderChatHistoryList(conversations);
                chatHistoryModal.style.display = 'flex';
            } catch (error) {
                addSystemMessage(`读取历史记录失败: ${error.message}`);
            }
        }

        async function loadConversationById(conversationId) {
            if (!currentFileName || !conversationId) return;
            try {
                const conversation = await getChatConversation(currentFileName, conversationId);
                if (!conversation || conversation.id !== conversationId) {
                    throw new Error('找不到对应的对话记录');
                }
                currentConversationId = conversation.id;
                creatingConversationPromise = null;
                renderConversationMessages(conversation.interactions || []);
                chatHistoryModal.style.display = 'none';
                hideChatHistoryContextMenu();
            } catch (error) {
                addSystemMessage(`加载历史对话失败: ${error.message}`);
            }
        }

        async function deleteConversationFromHistory(conversationId) {
            if (!currentFileName || !conversationId) return;
            try {
                await deleteChatConversationRecord(currentFileName, conversationId);
                if (currentConversationId === conversationId) {
                    currentConversationId = '';
                    creatingConversationPromise = null;
                    clearChatPanel();
                }
                const conversations = await listChatConversations(currentFileName);
                renderChatHistoryList(conversations);
            } catch (error) {
                addSystemMessage(`删除历史记录失败: ${error.message}`);
            }
        }

        function showPromptListPanel() {
            promptListPanel.style.display = 'block';
            promptEditorPanel.style.display = 'none';
            activePromptFileName = '';
        }

        function showPromptEditorPanel(fileName, content) {
            activePromptFileName = fileName;
            promptEditorName.textContent = fileName;
            promptEditorText.value = content;
            promptListPanel.style.display = 'none';
            promptEditorPanel.style.display = 'block';
            promptEditorText.focus();
        }

        function closePromptManager() {
            promptManagerModal.style.display = 'none';
            showPromptListPanel();
        }

        function renderPromptList() {
            promptListView.innerHTML = '';
            if (!promptFileList.length) {
                const empty = document.createElement('li');
                empty.className = 'prompt-empty';
                empty.textContent = '未找到提示词文件。';
                promptListView.appendChild(empty);
                return;
            }

            promptFileList.forEach((fileName) => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'prompt-list-item';
                button.textContent = fileName;
                button.addEventListener('click', async () => {
                    try {
                        const content = await fetchPromptFileContent(fileName, true);
                        showPromptEditorPanel(fileName, content);
                    } catch (error) {
                        addSystemMessage(`读取提示词失败: ${error.message}`);
                    }
                });
                li.appendChild(button);
                promptListView.appendChild(li);
            });
        }

        async function openPromptManager() {
            try {
                await fetchPromptFileList();
                renderPromptList();
                showPromptListPanel();
                promptManagerModal.style.display = 'flex';
            } catch (error) {
                addSystemMessage(`读取提示词列表失败: ${error.message}`);
            }
        }

        loginBtn.addEventListener('click', login);
        accessKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                login();
            }
        });
        logoutBtn.addEventListener('click', logout);

        // Turnstile callbacks
        window.onTurnstileSuccess = function(token) {
            turnstileToken = token;
            loginBtn.disabled = false;
        };

        window.onTurnstileError = function() {
            turnstileToken = '';
            loginBtn.disabled = true;
            authError.textContent = '人机验证失败，请刷新页面重试';
            authError.style.display = 'block';
        };

        function resetTurnstile() {
            turnstileToken = '';
            loginBtn.disabled = true;
            if (window.turnstile) {
                window.turnstile.reset();
            }
        }
        fileList.addEventListener('contextmenu', (event) => {
            const item = event.target.closest('li');
            if (!item || !fileList.contains(item)) {
                hideFileContextMenu();
                return;
            }

            event.preventDefault();
            contextMenuFileName = item.dataset.fileName || item.textContent.trim();
            showFileContextMenu(event.clientX, event.clientY);
        });
        chatHistoryList.addEventListener('contextmenu', (event) => {
            const item = event.target.closest('.chat-history-item');
            if (!item || !chatHistoryList.contains(item)) {
                hideChatHistoryContextMenu();
                return;
            }

            event.preventDefault();
            contextMenuConversationId = item.dataset.conversationId || '';
            if (!contextMenuConversationId) {
                hideChatHistoryContextMenu();
                return;
            }
            showChatHistoryContextMenu(event.clientX, event.clientY);
        });
        deleteFileBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const targetName = contextMenuFileName;
            hideFileContextMenu();
            await handleDeleteFile(targetName);
        });
        deleteChatHistoryBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            const targetConversationId = contextMenuConversationId;
            hideChatHistoryContextMenu();
            await deleteConversationFromHistory(targetConversationId);
        });
        document.addEventListener('click', (event) => {
            if (!fileContextMenu.contains(event.target)) {
                hideFileContextMenu();
            }
            if (!chatHistoryContextMenu.contains(event.target)) {
                hideChatHistoryContextMenu();
            }
        });
        closeChatHistoryModalBtn.addEventListener('click', () => {
            chatHistoryModal.style.display = 'none';
            hideChatHistoryContextMenu();
        });
        closePromptManagerModalBtn.addEventListener('click', () => {
            closePromptManager();
        });
        closeMindmapModalBtn.addEventListener('click', () => {
            closeMindmapModal();
        });
        chatHistoryModal.addEventListener('click', (event) => {
            if (event.target === chatHistoryModal) {
                chatHistoryModal.style.display = 'none';
                hideChatHistoryContextMenu();
            }
        });
        promptManagerModal.addEventListener('click', (event) => {
            if (event.target === promptManagerModal) {
                closePromptManager();
            }
        });
        mindmapModal.addEventListener('click', (event) => {
            if (event.target === mindmapModal) {
                closeMindmapModal();
            }
        });
        fileHistory.addEventListener('scroll', hideFileContextMenu);
        chatHistoryList.addEventListener('scroll', hideChatHistoryContextMenu);
        window.addEventListener('resize', () => {
            hideFileContextMenu();
            hideChatHistoryContextMenu();
            if (window.matchMedia('(max-width: 820px)').matches) {
                stopResize();
                textPanel.style.flex = '';
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && mindmapModal.style.display === 'flex') {
                closeMindmapModal();
            }
        });

        // Mindmap toolbar controls
        document.getElementById('mindmap-zoom-in')?.addEventListener('click', () => {
            if (currentMindmapInstance?.rescale) {
                const currentScale = getMindmapZoomTransform()?.k || 1;
                currentMindmapInstance.rescale(currentScale * 1.2);
            }
        });

        document.getElementById('mindmap-zoom-out')?.addEventListener('click', () => {
            if (currentMindmapInstance?.rescale) {
                const currentScale = getMindmapZoomTransform()?.k || 1;
                currentMindmapInstance.rescale(currentScale / 1.2);
            }
        });

        document.getElementById('mindmap-fit')?.addEventListener('click', () => {
            if (currentMindmapInstance?.fit) {
                currentMindmapInstance.fit();
            }
        });

        document.getElementById('mindmap-fullscreen')?.addEventListener('click', () => {
            toggleFullscreen(mindmapStage);
        });

        // Handle window resize for mindmap
        const handleMindmapResize = debounce(() => {
            if (mindmapModal.style.display === 'flex' && currentMindmapInstance) {
                // Resize SVG while preserving the current zoom/pan transform.
                const containerWidth = mindmapStage.clientWidth;
                const containerHeight = mindmapStage.clientHeight;
                const svg = mindmapStage.querySelector('svg');

                if (svg) {
                    const previousTransform = getMindmapZoomTransform();
                    const width = Math.max(containerWidth - 24, 600);
                    const height = Math.max(containerHeight - 24, 400);
                    svg.setAttribute('width', String(width));
                    svg.setAttribute('height', String(height));

                    if (
                        previousTransform &&
                        currentMindmapInstance.zoom &&
                        window.d3?.select &&
                        window.d3?.zoomIdentity
                    ) {
                        const preservedTransform = window.d3.zoomIdentity
                            .translate(previousTransform.x, previousTransform.y)
                            .scale(previousTransform.k);
                        window.d3.select(svg).call(currentMindmapInstance.zoom.transform, preservedTransform);
                    }
                }
            }
        }, 300);

        window.addEventListener('resize', handleMindmapResize);

        // Handle fullscreen change
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement === mindmapStage) {
                mindmapStage.classList.add('fullscreen');
            } else {
                mindmapStage.classList.remove('fullscreen');
            }
        });

        window.addEventListener('load', async () => {
            const authenticated = await checkAuthStatus();
            if (authenticated) {
                await fetchServerFileList();
            }
            updateFileList();
        });
        document.addEventListener('visibilitychange', () => {
            if (!currentUserId) return;
            if (document.visibilityState === 'visible') {
                scheduleHeartbeat(0);
                return;
            }
            scheduleHeartbeat(HEARTBEAT_BACKGROUND_MS);
        });
        window.addEventListener('online', () => {
            if (!currentUserId) return;
            scheduleHeartbeat(0);
        });

        refreshFileListBtn.addEventListener('click', async () => {
            await fetchServerFileList();
            updateFileList();
        });

        clearChatBtn.addEventListener('click', () => {
            clearChatHistory();
        });
        editPromptsBtn.addEventListener('click', async () => {
            await openPromptManager();
        });
        historyChatBtn.addEventListener('click', async () => {
            await openChatHistory();
        });
        newChatBtn.addEventListener('click', () => {
            startNewConversation();
        });
        articleContextToggle.addEventListener('change', () => {
            if (!isArticleContextEnabled()) {
                resetSummaryEvaluationState();
            }
        });
        promptEditorBackBtn.addEventListener('click', () => {
            showPromptListPanel();
        });
        promptEditorSaveBtn.addEventListener('click', async () => {
            if (!activePromptFileName) return;
            const nextContent = promptEditorText.value;
            try {
                await savePromptFileContent(activePromptFileName, nextContent);
                addSystemMessage(`已保存提示词: ${activePromptFileName}`);
            } catch (error) {
                addSystemMessage(`保存提示词失败: ${error.message}`);
            }
        });

        function updateFileList() {
            hideFileContextMenu();
            fileList.innerHTML = '';

            const names = Array.from(serverFiles).sort((a, b) => a.localeCompare(b, 'zh-CN'));

            names.forEach((fileName) => {
                const li = document.createElement('li');
                li.textContent = fileName;
                li.dataset.fileName = fileName;
                li.addEventListener('click', async () => {
                    hideFileContextMenu();
                    await loadHistory(fileName);
                });
                fileList.appendChild(li);
            });

            highlightCurrentFile();
        }

        async function loadHistory(fileName) {
            currentFileName = fileName;
            currentConversationId = '';
            creatingConversationPromise = null;
            resetVocabAnnotationState();
            resetSummaryEvaluationState();

            try {
                const content = await fetchServerFileContent(currentFileName);
                fileNameDisplay.textContent = currentFileName;
                currentFileContent = content;
                renderArticleContent(content);
                startNewConversation();
                highlightCurrentFile();
            } catch (error) {
                addSystemMessage(`加载服务器文件失败: ${error.message}`);
            }
        }

        // 监听文件选择
        fileInput.addEventListener('change', async function (e) {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const saved = await uploadFileToServer(file);
                await fetchServerFileList();
                updateFileList();
                await loadHistory(saved?.name || file.name);
            } catch (error) {
                addSystemMessage(`上传文件失败: ${error.message}`);
            } finally {
                fileInput.value = '';
            }
        });

        resizeHandle.addEventListener('mousedown', (e) => {
            if (window.matchMedia('(max-width: 820px)').matches) {
                return;
            }

            isResizing = true;
            resizeHandle.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d46a3a';
            resizeStartX = e.clientX;
            resizeStartWidth = textPanel.getBoundingClientRect().width;
            resizeMinWidth = parseFloat(getComputedStyle(textPanel).minWidth) || 0;

            const currentChatWidth = chatPanel.getBoundingClientRect().width;
            const chatMinWidth = parseFloat(getComputedStyle(chatPanel).minWidth) || 0;
            resizeMaxWidth = resizeStartWidth + Math.max(0, currentChatWidth - chatMinWidth);

            if (resizeMaxWidth < resizeMinWidth) {
                resizeMinWidth = resizeMaxWidth;
            }

            document.body.style.cursor = 'col-resize';
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        });

        function handleResize(e) {
            if (!isResizing) return;
            const dx = e.clientX - resizeStartX;
            const nextWidth = resizeStartWidth + dx;
            const clampedWidth = Math.min(resizeMaxWidth, Math.max(resizeMinWidth, nextWidth));
            textPanel.style.flex = '0 0 ' + clampedWidth + 'px';
        }

        function stopResize() {
            isResizing = false;
            resizeHandle.style.backgroundColor = '';
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
        }

        // 字体大小控制
        decreaseFontBtn.addEventListener('click', () => {
            if (fontSize > 12) {
                fontSize -= 2;
                textContent.style.fontSize = `${fontSize}px`;
                updateFontSizeDisplay();
            }
        });

        increaseFontBtn.addEventListener('click', () => {
            if (fontSize < 32) {
                fontSize += 2;
                textContent.style.fontSize = `${fontSize}px`;
                updateFontSizeDisplay();
            }
        });

        function updateFontSizeDisplay() {
            fontSizeDisplay.textContent = `${fontSize}px`;
        }


        // 监听文本选择
        textContent.addEventListener('mouseup', function () {
            const selection = window.getSelection();
            if (!selection.isCollapsed) {
                currentSelection = selection.toString().trim();
                selectedRange = selection.getRangeAt(0);
                const currentNode = selectedRange.startContainer.parentNode;
                pContent = (currentNode.nodeName === 'SPAN') ? currentNode.parentNode.innerText : currentNode.innerText;
                if (!pContent.includes(currentSelection)) {
                    window.getSelection().removeAllRanges();
                    currentSelection = '';
                    selectedRange = null;
                    pContent = '';
                }
            }
        });

        async function callFeaturePrompt(fileName, variables, userPrompt, loadingText, operation, forceRefresh = false) {
            const systemPrompt = await buildSystemPrompt(fileName, variables, forceRefresh);
            if (!systemPrompt) {
                throw new Error(`提示词为空: ${fileName}`);
            }
            const loadingMessage = simulateAIResponse(loadingText);
            await callAIApi(systemPrompt, userPrompt, loadingMessage, operation);
        }

        function buildArticleQuestionUserPrompt(instruction, passageContent, currentFileName) {
            return [
                instruction,
                `Article title: ${currentFileName || 'Untitled Article'}`,
                'Article content:',
                passageContent
            ].join('\n\n');
        }

        // 解释单词
        document.getElementById('explain-word').addEventListener('click', async function () {
            if (!currentSelection) return;
            resetSummaryEvaluationState();
            addUserMessage(`请解释单词: "${currentSelection}"`);

            try {
                await callFeaturePrompt(
                    PROMPT_FILES.explainWord,
                    { currentSelection, pContent, currentFileName, currentFileContent },
                    `段落：${pContent}\n目标单词：${currentSelection}`,
                    `正在解释单词 "${currentSelection}"...`,
                    null
                );
            } catch (error) {
                addSystemMessage(`调用解释单词失败: ${error.message}`);
            }
        });

        // 分析句子
        document.getElementById('analyze-sentence').addEventListener('click', async function () {
            if (!currentSelection) return;
            resetSummaryEvaluationState();
            addUserMessage(`请分析句子: "${currentSelection}"`);

            try {
                await callFeaturePrompt(
                    PROMPT_FILES.analyzeSentence,
                    { currentSelection, pContent, currentFileName, currentFileContent },
                    `段落：${pContent}\n目标句子：${currentSelection}`,
                    `正在分析并翻译 "${currentSelection}"...`,
                    null
                );
            } catch (error) {
                addSystemMessage(`调用分析句子失败: ${error.message}`);
            }
        });

        // 彩虹拆句
        document.getElementById('color-sentence').addEventListener('click', async function () {
            if (!currentSelection) return;
            resetSummaryEvaluationState();
            addUserMessage(`请彩虹拆句: "${currentSelection}"`);

            try {
                await callFeaturePrompt(
                    PROMPT_FILES.colorSentence,
                    { currentSelection, pContent, currentFileName, currentFileContent },
                    `请分析句子：${currentSelection}`,
                    `正在拆句 "${currentSelection}"...`,
                    'structure'
                );
            } catch (error) {
                addSystemMessage(`调用彩虹拆句失败: ${error.message}`);
            }
        });

        // 朗读功能
        let speechSynthesisUtterance = null;
        let currentAudio = null;
        let audioQueue = [];
        let isPlayingQueue = false;
        const readAloudBtn = document.getElementById('read-aloud-btn');
        const voiceSelect = document.getElementById('voice-select');
        const ttsEndpoint = '/api/tts';
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        function getSelectedVoiceName() {
            return voiceSelect?.value || 'en-GB-SoniaNeural';
        }

        function getSafariVoiceForSelection(availableVoices, edgeVoiceName) {
            const selectionMap = {
                'en-GB-SoniaNeural': ['Daniel', 'Samantha'],
                'en-GB-RyanNeural': ['Daniel', 'Alex'],
                'en-US-AriaNeural': ['Samantha', 'Ava'],
                'en-US-GuyNeural': ['Alex', 'Aaron']
            };
            const preferredNames = selectionMap[edgeVoiceName] || [];

            for (const preferredName of preferredNames) {
                const matchedVoice = availableVoices.find((voice) => voice.name.includes(preferredName));
                if (matchedVoice) {
                    return matchedVoice;
                }
            }

            if (edgeVoiceName.startsWith('en-GB')) {
                return availableVoices.find((voice) => voice.lang === 'en-GB')
                    || availableVoices.find((voice) => voice.lang.startsWith('en-GB'));
            }

            if (edgeVoiceName.startsWith('en-US')) {
                return availableVoices.find((voice) => voice.lang === 'en-US')
                    || availableVoices.find((voice) => voice.lang.startsWith('en-US'));
            }

            return availableVoices.find((voice) => voice.lang.startsWith('en'));
        }

        // 初始化语音列表（Safari 需要）
        let voicesLoaded = false;
        function loadVoices() {
            if (voicesLoaded) return;
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                voicesLoaded = true;
            }
        }

        if (isSafari && 'speechSynthesis' in window) {
            loadVoices();
            window.speechSynthesis.onvoiceschanged = loadVoices;
        } else if (isSafari) {
            readAloudBtn.disabled = true;
            readAloudBtn.title = '您的浏览器不支持语音朗读功能';
        }

        readAloudBtn.addEventListener('click', async function () {
            const isSpeakingNatively = 'speechSynthesis' in window && window.speechSynthesis.speaking;

            // 如果正在朗读，则停止
            if ((currentAudio && !currentAudio.paused) || isSpeakingNatively || isPlayingQueue) {
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                }
                if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                }
                isPlayingQueue = false;
                audioQueue = [];
                readAloudBtn.textContent = '朗读';
                readAloudBtn.classList.remove('speaking');
                return;
            }

            // 检查是否有选中文本
            if (!currentSelection) {
                addSystemMessage('请先选择要朗读的文本');
                return;
            }

            const rateInput = document.getElementById('speech-rate');
            const volumeInput = document.getElementById('speech-volume');
            const pitchInput = document.getElementById('speech-pitch');
            const selectedVoice = getSelectedVoiceName();

            if (!isSafari) {
                // 非 Safari 浏览器统一使用 edge-tts 服务
                try {
                    const rate = parseFloat(rateInput.value) || 0.9;
                    const volume = parseFloat(volumeInput.value) || 1.0;
                    const pitch = parseFloat(pitchInput.value) || 1.0;


                    readAloudBtn.textContent = '停止';
                    readAloudBtn.classList.add('speaking');
                    isPlayingQueue = true;

                    // 分句处理：按句号、问号、感叹号分割
                    const sentences = currentSelection.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [currentSelection];
                    let currentIndex = 0;

                    const playNext = async () => {
                        if (!isPlayingQueue || currentIndex >= audioQueue.length) {
                            isPlayingQueue = false;
                            audioQueue = [];
                            readAloudBtn.textContent = '朗读';
                            readAloudBtn.classList.remove('speaking');
                            return;
                        }

                        const audioUrl = await audioQueue[currentIndex];
                        currentIndex++;

                        if (!isPlayingQueue) return;

                        currentAudio = new Audio(audioUrl);
                        currentAudio.onended = () => {
                            URL.revokeObjectURL(audioUrl);
                            playNext();
                        };
                        currentAudio.onerror = () => {
                            URL.revokeObjectURL(audioUrl);
                            playNext();
                        };
                        await currentAudio.play();
                    };

                    // 并行请求所有句子的 TTS
                    audioQueue = sentences.map(async (sentence) => {
                        const requestBody = {
                            text: sentence.trim(),
                            voice: selectedVoice,
                            rate: `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`,
                            volume: `${volume >= 1 ? '+' : ''}${Math.round((volume - 1) * 100)}%`,
                            pitch: `${pitch >= 1 ? '+' : ''}${Math.round((pitch - 1) * 50)}Hz`
                        };

                        const response = await fetch(ttsEndpoint, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRF-Token': getCsrfToken()
                            },
                            body: JSON.stringify(requestBody)
                        });

                        if (!response.ok) {
                            throw new Error('TTS服务请求失败');
                        }

                        const audioBlob = await response.blob();
                        return URL.createObjectURL(audioBlob);
                    });

                    await playNext();

                } catch (error) {
                    isPlayingQueue = false;
                    audioQueue = [];
                    readAloudBtn.textContent = '朗读';
                    readAloudBtn.classList.remove('speaking');
                    addSystemMessage(`朗读失败: ${error.message}`);
                }
            } else {
                // 非Chrome: 使用原生 speechSynthesis
                if (!('speechSynthesis' in window)) {
                    addSystemMessage('您的浏览器不支持语音朗读功能');
                    return;
                }

                let availableVoices = window.speechSynthesis.getVoices();
                if (availableVoices.length === 0) {
                    await new Promise(resolve => {
                        let attempts = 0;
                        const checkVoices = setInterval(() => {
                            availableVoices = window.speechSynthesis.getVoices();
                            attempts++;
                            if (availableVoices.length > 0 || attempts > 10) {
                                clearInterval(checkVoices);
                                resolve();
                            }
                        }, 100);
                    });
                }

                speechSynthesisUtterance = new SpeechSynthesisUtterance(currentSelection);
                speechSynthesisUtterance.lang = 'en-US';
                speechSynthesisUtterance.rate = parseFloat(rateInput.value) || 0.9;
                speechSynthesisUtterance.volume = parseFloat(volumeInput.value) || 1.0;
                speechSynthesisUtterance.pitch = parseFloat(pitchInput.value) || 1.0;

                let selectedSafariVoice = getSafariVoiceForSelection(availableVoices, selectedVoice)
                    || availableVoices.find(voice => voice.lang.startsWith('en') && !voice.localService)
                    || availableVoices.find(voice => voice.lang.startsWith('en') && voice.localService)
                    || availableVoices.find(voice => voice.lang.startsWith('en'));

                if (selectedSafariVoice) {
                    speechSynthesisUtterance.voice = selectedSafariVoice;
                }

                speechSynthesisUtterance.onstart = () => {
                    readAloudBtn.textContent = '停止';
                    readAloudBtn.classList.add('speaking');
                };

                speechSynthesisUtterance.onend = () => {
                    readAloudBtn.textContent = '朗读';
                    readAloudBtn.classList.remove('speaking');
                };

                speechSynthesisUtterance.onerror = (event) => {
                    readAloudBtn.textContent = '朗读';
                    readAloudBtn.classList.remove('speaking');
                    if (event.error !== 'interrupted') {
                        addSystemMessage(`朗读失败: ${event.error}`);
                    }
                };

                try {
                    window.speechSynthesis.speak(speechSynthesisUtterance);
                } catch (error) {
                    addSystemMessage(`朗读失败: ${error.message}`);
                    readAloudBtn.textContent = '朗读';
                    readAloudBtn.classList.remove('speaking');
                }
            }
        });

        // 概括段落
        document.getElementById('summarize-paragraph').addEventListener('click', async function () {
            if (!currentSelection) return;
            const paragraph = (pContent || currentSelection || '').trim();
            if (!paragraph) return;

            summaryEvaluationArmed = true;
            summaryOriginalParagraph = paragraph;

            addUserMessage(`请概括段落: "${paragraph}"`);
            let guideMessage = '请先用英文概括这段内容的主要意思。你发送概括后，我会评价是否准确并给出参考句。';
            try {
                const template = await fetchPromptFileContent(PROMPT_FILES.summarizeParagraph, true);
                const rendered = fillPromptTemplate(template, {
                    currentSelection,
                    pContent: paragraph,
                    currentFileName,
                    currentFileContent
                }).trim();
                if (rendered) {
                    guideMessage = rendered;
                }
            } catch (error) {
            }
            simulateAIResponse(guideMessage);
        });

        document.getElementById('translate-paragraph').addEventListener('click', async function () {
            if (!currentSelection) return;
            resetSummaryEvaluationState();
            addUserMessage(`请翻译段落: "${pContent}"`);

            try {
                await callFeaturePrompt(
                    PROMPT_FILES.translateParagraph,
                    { currentSelection, pContent, currentFileName, currentFileContent },
                    `请翻译这段内容：${pContent}`,
                    '正在翻译段落...',
                    null
                );
            } catch (error) {
                addSystemMessage(`调用翻译段落失败: ${error.message}`);
            }
        });

        //文章思维导图
        async function gen_mindmap() {
            const passageContent = textContent.innerText.trim();
            if (!passageContent) return;
            resetSummaryEvaluationState();
            addUserMessage('请生成文章思维导图');

            try {
                await callFeaturePrompt(
                    PROMPT_FILES.mindmap,
                    { passageContent, currentFileName, currentFileContent },
                    `Read the full article below and return only an English Markdown mind map with exactly one level-1 heading and nested "-" bullet points.\n\nArticle:\n${passageContent}`,
                    '正在生成思维导图...',
                    'mindmap'
                );
            } catch (error) {
                addSystemMessage(`调用思维导图失败: ${error.message}`);
            }
        }

        async function gen_qa() {
            const passageContent = textContent.innerText.trim();
            if (!passageContent) return;
            resetSummaryEvaluationState();
            addUserMessage('请生成10个开放性问题');

            try {
                await callFeaturePrompt(
                    PROMPT_FILES.qa,
                    { passageContent, currentFileName, currentFileContent },
                    buildArticleQuestionUserPrompt(
                        'Please generate 10 open-ended questions based on the article content below and follow the required JSON output format.',
                        passageContent,
                        currentFileName
                    ),
                    '正在生成开放性问题...',
                    'questions',
                    true
                );
            } catch (error) {
                addSystemMessage(`调用全文问答题失败: ${error.message}`);
            }
        }

        async function gen_mcq() {
            const passageContent = textContent.innerText.trim();
            if (!passageContent) return;
            resetSummaryEvaluationState();
            addUserMessage('请生成10个多项选择题');

            try {
                await callFeaturePrompt(
                    PROMPT_FILES.mcq,
                    { passageContent, currentFileName, currentFileContent },
                    buildArticleQuestionUserPrompt(
                        'Please generate 10 multiple choice questions based on the article content below and follow the required JSON output format.',
                        passageContent,
                        currentFileName
                    ),
                    '正在生成多项选择题...',
                    'mcqs',
                    true
                );
            } catch (error) {
                addSystemMessage(`调用全文选择题失败: ${error.message}`);
            }
        }

        async function gen_tf() {
            const passageContent = textContent.innerText.trim();
            if (!passageContent) return;
            resetSummaryEvaluationState();
            addUserMessage('请生成10个正误判断题');

            try {
                await callFeaturePrompt(
                    PROMPT_FILES.tf,
                    { passageContent, currentFileName, currentFileContent },
                    buildArticleQuestionUserPrompt(
                        'Please generate 10 true/false questions based on the article content below and follow the required JSON output format.',
                        passageContent,
                        currentFileName
                    ),
                    '正在生成正误判断题...',
                    'tf',
                    true
                );
            } catch (error) {
                addSystemMessage(`调用全文判断题失败: ${error.message}`);
            }
        }

        // 发送消息
        sendButton.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        async function sendMessage() {
            const message = userInput.value.trim();
            const useArticleContext = isArticleContextEnabled();
            if (useArticleContext && !currentFileName) {
                addSystemMessage('请先选择一篇文章，或关闭“基于文章”开关后再提问。');
                return;
            }
            if (message) {
                addUserMessage(message);
                userInput.value = '';

                try {
                    if (summaryEvaluationArmed && useArticleContext) {
                        const paragraph = (summaryOriginalParagraph || pContent || '').trim();
                        if (!paragraph) {
                            resetSummaryEvaluationState();
                            throw new Error('缺少待评价的原文段落，请重新点击“概括段落”');
                        }

                        const systemPrompt = await buildSystemPrompt(
                            PROMPT_FILES.summaryEvaluation,
                            {
                                currentFileName,
                                currentFileContent,
                                pContent: paragraph,
                                summaryParagraph: paragraph,
                                studentSummary: message
                            }
                        );
                        const loadingMessage = simulateAIResponse('正在分析你的概括...');
                        await callAIApi(
                            systemPrompt,
                            [
                                `段落原文：${paragraph}`,
                                `学生概括：${message}`
                            ].join('\n'),
                            loadingMessage,
                            null
                        );
                        resetSummaryEvaluationState();
                        return;
                    }

                    if (!useArticleContext) {
                        resetSummaryEvaluationState();
                    }

                    const contextCurrentSelection = useArticleContext ? currentSelection : '';
                    const contextParagraph = useArticleContext ? pContent : '';
                    const contextFileName = useArticleContext ? currentFileName : '';
                    const contextFileContent = useArticleContext ? getArticleContextText() : '';

                    let systemPrompt = await buildSystemPrompt(
                        PROMPT_FILES.sendButton,
                        {
                            message,
                            currentSelection: contextCurrentSelection,
                            pContent: contextParagraph,
                            currentFileName: contextFileName,
                            currentFileContent: contextFileContent
                        }
                    );
                    if (isSummaryEvaluationPrompt(systemPrompt)) {
                        systemPrompt = DEFAULT_CHAT_SYSTEM_PROMPT;
                    }
                    const loadingMessage = simulateAIResponse('正在思考你的问题...');
                    const userPrompt = useArticleContext
                        ? [
                            `用户问题：${message}`,
                            `当前文章：${contextFileName || '（无）'}`,
                            `当前选中文本：${contextCurrentSelection || '（无）'}`,
                            `当前段落：${contextParagraph || '（无）'}`,
                            `当前文章内容：\n${contextFileContent || '（空）'}`
                        ].join('\n')
                        : `用户问题：${message}`;
                    await callAIApi(
                        systemPrompt,
                        userPrompt,
                        loadingMessage,
                        null
                    );
                } catch (error) {
                    addSystemMessage(`调用问答失败: ${error.message}`);
                }
            }
        }

        // 添加系统消息
        function addSystemMessage(message) {
            const messageElement = document.createElement('div');
            messageElement.className = 'message ai-message';
            const text = document.createElement('p');
            text.className = 'system-message-error';
            text.textContent = String(message || '');
            messageElement.appendChild(text);
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        // 添加用户消息
        function addUserMessage(message) {
            const messageElement = document.createElement('div');
            messageElement.className = 'message user-message';
            messageElement.textContent = message;
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // 保存互动内容
            saveInteraction('user', message).catch((error) => {
                addSystemMessage(`保存对话失败: ${error.message}`);
            });
        }

        async function clearChatHistory() {
            if (!currentFileName || !currentConversationId) {
                resetSummaryEvaluationState();
                clearChatPanel();
                return;
            }

            try {
                await clearChatConversation(currentFileName, currentConversationId);
                resetSummaryEvaluationState();
                clearChatPanel();
            } catch (error) {
                addSystemMessage(`清除记录失败: ${error.message}`);
            }
        }

        // 模拟AI响应
        function simulateAIResponse(message) {
            const messageElement = document.createElement('div');
            messageElement.className = 'message ai-message loading';

            // 如果是Markdown内容，直接作为HTML插入
            if (message.includes('#')) {
                messageElement.innerHTML = sanitizeAssistantHtml(markdownToHtml(message, null));
            } else {
                messageElement.textContent = message;
            }

            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // 保存互动内容
            if (message.includes('#')) {
                saveInteraction('assistant', sanitizeAssistantHtml(markdownToHtml(message, null))).catch((error) => {
                    addSystemMessage(`保存对话失败: ${error.message}`);
                });
            }

            return messageElement;
        }

        function extractStreamContent(data) {
            if (data && data.error) {
                if (typeof data.error === 'string') {
                    throw new Error(data.error);
                }
                if (typeof data.error.message === 'string') {
                    throw new Error(data.error.message);
                }
                throw new Error('AI服务返回错误');
            }

            if (typeof data?.delta === 'string') return data.delta;
            if (typeof data?.content === 'string') return data.content;
            return '';
        }

        function renderAIResponse(messageElement, message, operation, isFinal = false) {
            messageElement.innerHTML = sanitizeAssistantHtml(markdownToHtml(message, operation, isFinal));
            messageElement.classList.remove('loading');
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        // 调用AI API（流式输出版本）
        async function callAIApi(systemPrompt, userPrompt, loadingMessage, operation) {
            let responseElement = loadingMessage;
            try {
                const response = await fetch('/api/ai/chat/stream', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': getCsrfToken()
                    },
                    body: JSON.stringify({
                        systemPrompt: String(systemPrompt || ''),
                        prompt: String(userPrompt || '')
                    })
                });

                if (response.status === 401) {
                    await checkAuthStatus();
                    throw new Error('请先登录后再使用AI功能');
                }
                if (!response.ok) {
                    throw new Error(`API请求失败: ${response.status}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let accumulatedText = '';
                let buffer = '';

                const streamingDiv = document.createElement('div');
                streamingDiv.className = 'message ai-message';
                loadingMessage.replaceWith(streamingDiv);
                responseElement = streamingDiv;

                const cursor = document.createElement('span');
                cursor.className = 'typing-cursor';
                streamingDiv.appendChild(cursor);

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const chunks = buffer.split('\n\n');
                    buffer = chunks.pop();

                    for (const chunk of chunks) {
                        if (chunk.trim() === '') continue;

                        const lines = chunk.split('\n');
                        for (const line of lines) {
                            if (!line.startsWith('data:')) continue;
                            const payload = line.substring(5).trim();
                            if (!payload || payload === '[DONE]') continue;

                            let data;
                            try {
                                data = JSON.parse(payload);
                            } catch (e) {
                                continue;
                            }

                            const content = extractStreamContent(data);
                            if (content) {
                                accumulatedText += content;
                                renderAIResponse(streamingDiv, accumulatedText, operation, false);
                            }
                        }
                    }
                }

                if (buffer.trim() !== '') {
                    const lines = buffer.split('\n');
                    for (const line of lines) {
                        if (!line.startsWith('data:')) continue;
                        const payload = line.substring(5).trim();
                        if (!payload || payload === '[DONE]') continue;

                        let data;
                        try {
                            data = JSON.parse(payload);
                        } catch (e) {
                            continue;
                        }

                        const content = extractStreamContent(data);
                        if (content) {
                            accumulatedText += content;
                        }
                    }
                    renderAIResponse(streamingDiv, accumulatedText, operation, true);
                }

                if (!accumulatedText.trim()) {
                    throw new Error('AI未返回有效内容');
                }

                const cursorElement = streamingDiv.querySelector('.typing-cursor');
                if (cursorElement) {
                    cursorElement.remove();
                }

                renderAIResponse(streamingDiv, accumulatedText, operation, true);

                chatMessages.scrollTop = chatMessages.scrollHeight;
                saveInteraction('assistant', sanitizeAssistantHtml(markdownToHtml(accumulatedText, operation, true))).catch((error) => {
                    addSystemMessage(`保存对话失败: ${error.message}`);
                });
            } catch (error) {
                renderAIResponse(responseElement, `抱歉，处理请求时出错: ${error.message}`, null);
            }
        }

        // 替换最后的AI响应（用于更新加载中的消息）
        function replaceLastAIResponse(newMessage) {
            const lastMessage = chatMessages.lastElementChild;
            if (lastMessage && lastMessage.classList.contains('loading')) {
                renderAIResponse(lastMessage, newMessage, null);
            }
        }

        async function saveInteraction(role, content) {
            if (!currentFileName) return;
            if (role === 'assistant' && (typeof content !== 'string' || content.trim() === '')) return;
            if (role !== 'assistant' && role !== 'user') return;

            const conversationId = await ensureActiveConversation();
            if (!conversationId) return;

            await appendChatMessage(
                currentFileName,
                conversationId,
                role,
                content,
                new Date().toISOString()
            );
        }

        function escapeHtml(text) {
            return String(text || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        const ASSISTANT_SANITIZE_TAGS = [
            'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
            'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
            'div', 'span', 'button', 'a'
        ];
        const ASSISTANT_SANITIZE_ATTR = [
            'class', 'data-markdown', 'data-type', 'data-option', 'data-correct-answer',
            'type', 'href', 'target', 'rel'
        ];

        function sanitizeAssistantHtml(html) {
            const raw = String(html || '');
            if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
                return window.DOMPurify.sanitize(raw, {
                    ALLOWED_TAGS: ASSISTANT_SANITIZE_TAGS,
                    ALLOWED_ATTR: ASSISTANT_SANITIZE_ATTR
                });
            }
            return `<p>${escapeHtml(raw)}</p>`;
        }

        function encodeStructuredData(text) {
            return encodeURIComponent(String(text || ''));
        }

        function decodeStructuredData(text) {
            try {
                return decodeURIComponent(String(text || ''));
            } catch (error) {
                return String(text || '');
            }
        }

        function getMindmapMarkdown(markdown) {
            return extractFencedBlock(markdown, 'markdown') || String(markdown || '').trim();
        }

        function getMindmapRootLabel() {
            const rawName = String(currentFileName || '').trim();
            if (!rawName) return 'Article Mindmap';
            return rawName.replace(/\.[^.]+$/, '') || rawName;
        }

        function normalizeMindmapLabel(text) {
            const patterns = [
                [/\[([^\]]+)\]\(([^)]+)\)/g, '$1'],  // Links
                [/!\[([^\]]*)\]\(([^)]+)\)/g, '$1'], // Images
                [/`([^`]+)`/g, '$1'],                 // Code
                [/\*\*([^*]+)\*\*/g, '$1'],           // Bold
                [/\*([^*]+)\*/g, '$1'],               // Italic
                [/__([^_]+)__/g, '$1'],               // Bold alt
                [/_([^_]+)_/g, '$1'],                 // Italic alt
                [/~~([^~]+)~~/g, '$1']                // Strikethrough
            ];

            return patterns.reduce((str, [pattern, replacement]) =>
                str.replace(pattern, replacement), String(text || '')
            ).replace(/\s+/g, ' ').trim();
        }

        function createMindmapNode(content) {
            return {
                content: normalizeMindmapLabel(content),
                children: []
            };
        }

        function buildMarkmapTree(markdown) {
            const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
            const root = createMindmapNode(getMindmapRootLabel());
            const headingStack = [root];
            const listStack = [];
            let lastNode = null;
            let inCodeBlock = false;

            for (const rawLine of lines) {
                const line = rawLine.replace(/\t/g, '    ');
                const trimmed = line.trim();
                if (!trimmed) continue;

                if (trimmed.startsWith('```')) {
                    inCodeBlock = !inCodeBlock;
                    continue;
                }
                if (inCodeBlock) continue;

                const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
                if (headingMatch) {
                    const level = headingMatch[1].length;
                    const label = normalizeMindmapLabel(headingMatch[2]);
                    if (!label) continue;

                    headingStack.length = level;
                    const parent = headingStack[level - 1] || root;
                    const node = createMindmapNode(label);
                    parent.children.push(node);
                    headingStack[level] = node;
                    listStack.length = 0;
                    lastNode = node;
                    continue;
                }

                const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
                if (listMatch) {
                    const indent = listMatch[1].length;
                    const level = Math.floor(indent / 2) + 1;
                    const label = normalizeMindmapLabel(listMatch[3]);
                    if (!label) continue;

                    listStack.length = level;
                    const parent = level === 1
                        ? headingStack[headingStack.length - 1] || root
                        : listStack[level - 1] || headingStack[headingStack.length - 1] || root;
                    const node = createMindmapNode(label);
                    parent.children.push(node);
                    listStack[level] = node;
                    lastNode = node;
                    continue;
                }

                const label = normalizeMindmapLabel(trimmed);
                if (!label) continue;

                if (lastNode) {
                    lastNode.content = normalizeMindmapLabel(`${lastNode.content} ${label}`);
                } else {
                    root.children.push(createMindmapNode(label));
                }
            }

            if (root.children.length === 1 && !root.children[0].children.length) {
                return {
                    content: root.content,
                    children: root.children
                };
            }

            return root;
        }

        function buildMindmapMessageHtml(markdown) {
            const data = getMindmapMarkdown(markdown);
            if (!data) {
                return renderStructuredFallback('', '正在等待思维导图内容...');
            }

            const lines = data.split('\n').map(line => line.trim()).filter(Boolean);
            const preview = lines.slice(0, 3).join(' / ');

            // Count nodes
            const headingCount = lines.filter(line => line.startsWith('#')).length;
            const listCount = lines.filter(line => /^\s*[-*+]/.test(line)).length;
            const totalNodes = headingCount + listCount;

            const stats = totalNodes > 0 ? `${totalNodes} 个节点` : '';
            const summary = preview || '思维导图内容已准备好，点击按钮在站内查看。';

            return `<div class="rh-mindmap-card" data-markdown="${escapeHtml(encodeStructuredData(data))}">
                <div class="rh-mindmap-copy">
                    <div class="rh-mindmap-title">思维导图已生成</div>
                    <div class="rh-mindmap-summary">${escapeHtml(summary)}</div>
                    ${stats ? `<div class="mindmap-summary-stats">${stats}</div>` : ''}
                </div>
                <button type="button" class="rh-view-mindmap">查看</button>
            </div>`;
        }

        async function ensureMarkmapReady() {
            const timeout = 8000;
            const startTime = Date.now();
            let lastState = '';

            while (Date.now() - startTime < timeout) {
                const hasD3 = Boolean(window.d3);
                const markmapGlobal = window.markmap;
                const hasMarkmap = Boolean(markmapGlobal?.Markmap);
                const hasTransformer = Boolean(markmapGlobal?.Transformer);

                if (hasD3 && hasMarkmap && hasTransformer) {
                    // Initialize singleton Transformer instance
                    if (!markmapTransformer) {
                        markmapTransformer = new markmapGlobal.Transformer();
                    }
                    return markmapGlobal;
                }

                lastState = JSON.stringify({
                    hasD3,
                    hasMarkmap,
                    hasTransformer
                });
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            throw new Error(`Markmap 资源加载超时（8秒）: ${lastState}`);
        }

        const MINDMAP_BRANCH_COLORS = ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E86452', '#6DC8EC', '#945FB9', '#FF9845'];
        const MINDMAP_BASE_TEXT_COLOR = '#3A2D22';
        const MINDMAP_ROOT_FILL = '#FFF6E8';
        const MINDMAP_FONT_FAMILY = '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

        function getMindmapNodeDepth(node) {
            return Number(node?.state?.depth ?? node?.depth ?? node?.dataset?.depth ?? 0);
        }

        function getMindmapBranchColor(node) {
            const depth = getMindmapNodeDepth(node);
            return MINDMAP_BRANCH_COLORS[Math.abs(depth) % MINDMAP_BRANCH_COLORS.length];
        }

        function mixMindmapColors(color, target, ratio) {
            const normalize = (value) => String(value || '').replace('#', '').trim();
            const source = normalize(color);
            const destination = normalize(target);
            if (source.length !== 6 || destination.length !== 6) {
                return color;
            }

            const clamp = (value) => Math.max(0, Math.min(255, value));
            const mixChannel = (index) => {
                const start = parseInt(source.slice(index, index + 2), 16);
                const end = parseInt(destination.slice(index, index + 2), 16);
                return clamp(Math.round(start + (end - start) * ratio));
            };

            return `#${[0, 2, 4].map((index) => mixChannel(index).toString(16).padStart(2, '0')).join('')}`;
        }

        function getMindmapGlobalStyle() {
            return `
                .markmap {
                    --markmap-font: 520 14px/1.45 ${MINDMAP_FONT_FAMILY};
                    --markmap-text-color: ${MINDMAP_BASE_TEXT_COLOR};
                }
                .markmap .markmap-foreign,
                .markmap .markmap-foreign > div,
                .markmap .markmap-foreign > div > div {
                    font-family: ${MINDMAP_FONT_FAMILY};
                }
            `;
        }

        function getMindmapTextStyle(depth, branchColor) {
            if (depth <= 1) {
                return {
                    color: MINDMAP_BASE_TEXT_COLOR,
                    fontFamily: MINDMAP_FONT_FAMILY,
                    fontSize: '18px',
                    fontWeight: '700',
                    letterSpacing: '0.01em'
                };
            }

            if (depth === 2) {
                return {
                    color: mixMindmapColors(branchColor, MINDMAP_BASE_TEXT_COLOR, 0.35),
                    fontFamily: MINDMAP_FONT_FAMILY,
                    fontSize: '15px',
                    fontWeight: '650',
                    letterSpacing: '0.005em'
                };
            }

            return {
                color: mixMindmapColors(branchColor, MINDMAP_BASE_TEXT_COLOR, 0.55),
                fontFamily: MINDMAP_FONT_FAMILY,
                fontSize: '14px',
                fontWeight: '520',
                letterSpacing: '0'
            };
        }

        function applyMindmapLabelTextStyles(label, textStyle) {
            if (!label || !textStyle) {
                return;
            }

            label.style.setProperty('color', textStyle.color, 'important');
            label.style.setProperty('font-family', textStyle.fontFamily, 'important');
            label.style.setProperty('font-size', textStyle.fontSize, 'important');
            label.style.setProperty('font-weight', textStyle.fontWeight, 'important');
            label.style.setProperty('letter-spacing', textStyle.letterSpacing, 'important');
        }

        function applyMindmapVisualStyles() {
            const nodes = mindmapStage.querySelectorAll('g.markmap-node');
            nodes.forEach((nodeElement) => {
                const nodeData = nodeElement.__data__ || { dataset: nodeElement.dataset };
                const depth = getMindmapNodeDepth(nodeData);
                const branchColor = getMindmapBranchColor(nodeData);
                const circle = nodeElement.querySelector('circle');
                const line = nodeElement.querySelector('line');
                const label = nodeElement.querySelector('foreignObject div div') || nodeElement.querySelector('foreignObject div');

                if (line) {
                    line.setAttribute('stroke', branchColor);
                }

                if (circle) {
                    circle.setAttribute('stroke', branchColor);
                    circle.setAttribute('stroke-width', depth <= 1 ? '2.25' : '1.75');
                    circle.setAttribute('fill', depth <= 1 ? MINDMAP_ROOT_FILL : '#FFFFFF');
                }

                if (label) {
                    const textStyle = getMindmapTextStyle(depth, branchColor);
                    applyMindmapLabelTextStyles(label, textStyle);
                    label.querySelectorAll('*').forEach((child) => {
                        applyMindmapLabelTextStyles(child, textStyle);
                    });
                }
            });
        }

        function scheduleMindmapVisualStyles() {
            // Apply styles once immediately, then once after DOM updates
            applyMindmapVisualStyles();
            requestAnimationFrame(() => applyMindmapVisualStyles());
        }

        function getMindmapRenderOptions() {
            return {
                autoFit: false,
                duration: 300,
                fitRatio: 0.95,
                maxWidth: 300,
                paddingX: 20,
                spacingVertical: 10,
                spacingHorizontal: 80,
                color: (node) => {
                    return getMindmapBranchColor(node);
                },
                style: () => getMindmapGlobalStyle()
            };
        }

        function stabilizeMindmapToggleZoom(instance, svg) {
            if (!instance || !svg || instance.__rhZoomStabilized) {
                return instance;
            }

            const originalToggleNode = typeof instance.toggleNode === 'function'
                ? instance.toggleNode.bind(instance)
                : null;

            if (!originalToggleNode) {
                return instance;
            }

            instance.toggleNode = async (...args) => {
                const beforeTransform = getMindmapZoomTransform(svg);
                const result = await originalToggleNode(...args);
                const transitionDuration = Number(instance.options?.duration) || 0;
                const restoreMindmapState = () => {
                    scheduleMindmapVisualStyles();
                    if (beforeTransform) {
                        applyMindmapZoomTransform(instance, svg, beforeTransform);
                    }
                };

                requestAnimationFrame(restoreMindmapState);
                window.setTimeout(restoreMindmapState, transitionDuration + 24);

                return result;
            };

            instance.__rhZoomStabilized = true;
            return instance;
        }

        async function renderMindmap(markdown, precomputedRoot = null) {
            const content = getMindmapMarkdown(markdown);
            if (!content) {
                throw new Error('思维导图内容为空');
            }

            const markmap = await ensureMarkmapReady();
            const { Markmap } = markmap;

            // Use precomputed root from cache when available to avoid duplicate parsing work.
            const root = precomputedRoot || markmapTransformer.transform(content).root;

            mindmapStage.innerHTML = '';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

            // Responsive sizing
            const containerWidth = mindmapStage.clientWidth;
            const containerHeight = mindmapStage.clientHeight;
            const width = Math.max(containerWidth - 24, 600);
            const height = Math.max(containerHeight - 24, 400);

            svg.setAttribute('width', String(width));
            svg.setAttribute('height', String(height));
            svg.style.width = '100%';
            svg.style.height = '100%';
            mindmapStage.appendChild(svg);

            const mm = stabilizeMindmapToggleZoom(
                Markmap.create(svg, getMindmapRenderOptions(), root),
                svg
            );

            scheduleMindmapVisualStyles();

            // Store instance for toolbar controls
            currentMindmapInstance = mm;
            currentMindmapData = content;

            // Show toolbar
            document.getElementById('mindmap-toolbar').style.display = 'flex';

            return mm;
        }

        function closeMindmapModal() {
            mindmapModal.style.display = 'none';
            mindmapStage.innerHTML = '';
            mindmapStatus.textContent = '';
            document.getElementById('mindmap-toolbar').style.display = 'none';
            currentMindmapInstance = null;
            currentMindmapData = null;

            // Exit fullscreen if active
            if (document.fullscreenElement === mindmapStage) {
                document.exitFullscreen();
            }
        }

        function openMindmapModal(markdown) {
            const content = getMindmapMarkdown(markdown);
            if (!content) {
                addSystemMessage('思维导图内容为空，无法查看。');
                return;
            }

            mindmapModalTitle.textContent = currentFileName ? `${currentFileName} · 思维导图` : '文章思维导图';
            mindmapStatus.textContent = '正在渲染思维导图...';
            mindmapStage.innerHTML = '';
            document.getElementById('mindmap-toolbar').style.display = 'none';
            mindmapModal.style.display = 'flex';

            // Check cache
            const cacheKey = hashString(content);

            requestAnimationFrame(async () => {
                try {
                    if (mindmapCache.has(cacheKey)) {
                        // Cache hit: reuse parsed tree, but always render into a fresh SVG.
                        const cachedData = mindmapCache.get(cacheKey);
                        await renderMindmap(content, cachedData.root);
                        mindmapStatus.textContent = '';
                    } else {
                        // Render fresh
                        await ensureMarkmapReady();
                        const { root } = markmapTransformer.transform(content);
                        await renderMindmap(content, root);
                        mindmapStatus.textContent = '';

                        // Cache parsed root only. Caching rendered HTML can duplicate markmap layers.
                        mindmapCache.set(cacheKey, {
                            root: root
                        });

                        // Limit cache size to 10 items
                        if (mindmapCache.size > 10) {
                            const firstKey = mindmapCache.keys().next().value;
                            mindmapCache.delete(firstKey);
                        }
                    }
                } catch (error) {
                    mindmapStatus.textContent = `思维导图渲染失败: ${error.message}`;
                }
            });
        }

        function extractFencedBlock(markdown, language) {
            const pattern = new RegExp(`\`\`\`${language}\\s*([\\s\\S]*?)\`\`\``, 'i');
            const match = String(markdown || '').match(pattern);
            return match ? match[1].trim() : '';
        }

        function findBalancedJsonCandidate(text, startIndex) {
            const input = String(text || '');
            const openingChar = input[startIndex];
            const closingChar = openingChar === '{' ? '}' : ']';
            let depth = 0;
            let inString = false;
            let escaping = false;

            for (let i = startIndex; i < input.length; i += 1) {
                const char = input[i];

                if (inString) {
                    if (escaping) {
                        escaping = false;
                    } else if (char === '\\') {
                        escaping = true;
                    } else if (char === '"') {
                        inString = false;
                    }
                    continue;
                }

                if (char === '"') {
                    inString = true;
                    continue;
                }

                if (char === openingChar) {
                    depth += 1;
                    continue;
                }

                if (char === closingChar) {
                    depth -= 1;
                    if (depth === 0) {
                        return input.slice(startIndex, i + 1).trim();
                    }
                    continue;
                }

                if ((openingChar === '{' && char === ']') || (openingChar === '[' && char === '}')) {
                    return '';
                }
            }

            return '';
        }

        function extractBalancedJsonPayload(markdown) {
            const input = String(markdown || '');
            const candidates = [];

            for (let i = 0; i < input.length; i += 1) {
                const char = input[i];
                if (char !== '{' && char !== '[') {
                    continue;
                }

                const candidate = findBalancedJsonCandidate(input, i);
                if (!candidate) {
                    continue;
                }

                try {
                    const parsed = JSON.parse(candidate);
                    candidates.push({ json: candidate, data: parsed });
                } catch (error) {
                    // Continue searching; earlier braces may belong to prose/code examples.
                }
            }

            // Prefer JSON objects that contain "questions" field (for quiz/question operations)
            for (const item of candidates) {
                if (item.data && item.data.questions && Array.isArray(item.data.questions)) {
                    return item.json;
                }
            }

            // Fall back to first valid JSON found
            if (candidates.length > 0) {
                return candidates[0].json;
            }

            return '';
        }

        function extractJsonPayload(markdown) {
            const fenced = extractFencedBlock(markdown, 'json');
            if (fenced) {
                return fenced;
            }

            const trimmed = String(markdown || '').trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                return trimmed;
            }

            const balanced = extractBalancedJsonPayload(trimmed);
            if (balanced) {
                return balanced;
            }
            return '';
        }

        function parseJsonContent(markdown) {
            const payload = extractJsonPayload(markdown);
            if (!payload) return null;
            try {
                const data = JSON.parse(payload);
                return { payload, data };
            } catch (error) {
                return null;
            }
        }

        function formatJsonForDisplay(payload) {
            if (!payload) return '';
            try {
                const parsed = JSON.parse(payload);
                return JSON.stringify(parsed, null, 2);
            } catch (error) {
                return String(payload);
            }
        }

        function renderQuestionLoadingHtml() {
            return '<p class="rh-empty">正在生成题目中......</p>';
        }

        function tryParseStructuredValue(value) {
            if (typeof value !== 'string') return null;
            const trimmed = value.trim();
            if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
                return null;
            }

            try {
                return JSON.parse(trimmed);
            } catch (error) {
                return null;
            }
        }

        function pickFirstValue(source, keys) {
            if (!source || typeof source !== 'object') return undefined;
            for (const key of keys) {
                if (source[key] !== undefined && source[key] !== null) {
                    return source[key];
                }
            }
            return undefined;
        }

        function pickFirstDeepValue(source, keys, seen = new Set()) {
            if (source === undefined || source === null) return undefined;

            const parsedSource = typeof source === 'string' ? tryParseStructuredValue(source) : null;
            if (parsedSource) {
                return pickFirstDeepValue(parsedSource, keys, seen);
            }

            if (typeof source !== 'object') return undefined;
            if (seen.has(source)) return undefined;
            seen.add(source);

            for (const key of keys) {
                if (source[key] !== undefined && source[key] !== null) {
                    return source[key];
                }
            }

            if (Array.isArray(source)) {
                for (const item of source) {
                    const nested = pickFirstDeepValue(item, keys, seen);
                    if (nested !== undefined) {
                        return nested;
                    }
                }
                return undefined;
            }

            for (const value of Object.values(source)) {
                const nested = pickFirstDeepValue(value, keys, seen);
                if (nested !== undefined) {
                    return nested;
                }
            }

            return undefined;
        }

        function normalizeScalarValue(value) {
            if (value === undefined || value === null) return '';
            if (typeof value === 'string') return value.trim();
            if (typeof value === 'number') return String(value);
            if (typeof value === 'boolean') return value ? 'true' : 'false';
            if (Array.isArray(value)) {
                return value
                    .map((item) => normalizeScalarValue(item))
                    .filter(Boolean)
                    .join('\n\n');
            }
            if (typeof value === 'object') {
                return normalizeScalarValue(
                    pickFirstValue(value, [
                        'answer',
                        'answers',
                        'correct_answer',
                        'correctAnswer',
                        'reference_answer',
                        'referenceAnswer',
                        'reference_answers',
                        'referenceAnswers',
                        'sample_answer',
                        'sampleAnswer',
                        'sample_answers',
                        'sampleAnswers',
                        'model_answer',
                        'modelAnswer',
                        'model_answers',
                        'modelAnswers',
                        'ideal_answer',
                        'idealAnswer',
                        'expected_answer',
                        'expectedAnswer',
                        'suggested_answer',
                        'suggestedAnswer',
                        'option',
                        'label',
                        'key',
                        'id',
                        'value',
                        'content',
                        'text'
                    ])
                );
            }
            return String(value).trim();
        }

        function unwrapStructuredData(data) {
            let current = data;
            const seen = new Set();

            while (current && typeof current === 'object' && !Array.isArray(current) && !seen.has(current)) {
                seen.add(current);

                const directArray = pickFirstValue(current, [
                    'questions',
                    'items',
                    'results',
                    'mcqs',
                    'qa',
                    'quiz',
                    'data',
                    'payload',
                    'response',
                    'result',
                    'output',
                    'multiple_choice_questions',
                    'multipleChoiceQuestions',
                    'true_false_questions',
                    'trueFalseQuestions',
                    'open_questions',
                    'openEndedQuestions'
                ]);
                if (Array.isArray(directArray)) {
                    return directArray;
                }

                const nestedCandidate = pickFirstValue(current, [
                    'data',
                    'payload',
                    'response',
                    'result',
                    'output',
                    'content'
                ]);
                const parsedNested = tryParseStructuredValue(nestedCandidate);
                if (parsedNested) {
                    current = parsedNested;
                    continue;
                }
                if (nestedCandidate && typeof nestedCandidate === 'object') {
                    current = nestedCandidate;
                    continue;
                }
                break;
            }

            return current;
        }

        function extractQuestionItems(data) {
            const normalized = unwrapStructuredData(data);
            if (Array.isArray(normalized)) {
                return normalized;
            }
            if (!normalized || typeof normalized !== 'object') {
                return [];
            }

            const arrayKeys = [
                'questions',
                'items',
                'results',
                'mcqs',
                'qa',
                'quiz',
                'statements',
                'true_false_statements',
                'trueFalseStatements',
                'true_false_items',
                'trueFalseItems',
                'judgments',
                'multiple_choice_questions',
                'multipleChoiceQuestions',
                'true_false_questions',
                'trueFalseQuestions',
                'open_questions',
                'openEndedQuestions'
            ];
            for (const key of arrayKeys) {
                const candidate = normalized[key];
                if (Array.isArray(candidate)) {
                    return candidate;
                }
                const parsedCandidate = tryParseStructuredValue(candidate);
                if (Array.isArray(parsedCandidate)) {
                    return parsedCandidate;
                }
                if (parsedCandidate && typeof parsedCandidate === 'object') {
                    const nestedItems = extractQuestionItems(parsedCandidate);
                    if (nestedItems.length) {
                        return nestedItems;
                    }
                }
            }

            const arrayValues = Object.values(normalized).filter(Array.isArray);
            for (const candidate of arrayValues) {
                const questionLikeItems = candidate.filter((item) => {
                    if (!item || typeof item !== 'object') {
                        return false;
                    }
                    const text = normalizeQuestionText(item);
                    return Boolean(text);
                });
                if (questionLikeItems.length) {
                    return questionLikeItems;
                }
            }

            const objectValues = Object.values(normalized).filter(
                (value) => value && typeof value === 'object' && !Array.isArray(value)
            );
            const questionLikeValues = objectValues.filter((item) => {
                const text = normalizeScalarValue(
                    pickFirstValue(item, ['question', 'prompt', 'stem', 'statement', 'sentence', 'text', 'content'])
                );
                return Boolean(text);
            });
            return questionLikeValues;
        }

        function getOptionLetter(index) {
            return String.fromCharCode(65 + index);
        }

        function normalizeOptionItem(option, index) {
            if (typeof option === 'string') {
                return {
                    option: getOptionLetter(index),
                    content: option
                };
            }
            if (!option || typeof option !== 'object') {
                return null;
            }

            const entries = Object.entries(option).filter(([, value]) => value !== undefined && value !== null);
            if (
                !('option' in option) &&
                !('label' in option) &&
                !('key' in option) &&
                !('id' in option) &&
                entries.length === 1
            ) {
                const [entryKey, entryValue] = entries[0];
                return {
                    option: normalizeScalarValue(entryKey) || getOptionLetter(index),
                    content: normalizeScalarValue(entryValue)
                };
            }

            const optionKey = normalizeScalarValue(
                pickFirstValue(option, ['option', 'label', 'key', 'id'])
            ) || getOptionLetter(index);
            const optionText = normalizeScalarValue(
                pickFirstValue(option, [
                    'content',
                    'text',
                    'option_text',
                    'optionText',
                    'answer_text',
                    'answerText',
                    'description',
                    'value',
                    'label'
                ])
            );

            return {
                option: optionKey,
                content: optionText
            };
        }

        function normalizeOptions(question) {
            const rawOptions = pickFirstValue(question, [
                'options',
                'choices',
                'answers',
                'candidates',
                'selections',
                'alternatives'
            ]);

            if (Array.isArray(rawOptions)) {
                return rawOptions
                    .map((option, index) => normalizeOptionItem(option, index))
                    .filter((option) => option && option.content);
            }

            if (rawOptions && typeof rawOptions === 'object') {
                return Object.entries(rawOptions)
                    .map(([key, value], index) => normalizeOptionItem({ option: key, content: value }, index))
                    .filter((option) => option && option.content);
            }

            return [];
        }

        function looksLikeTrueFalse(question, options, answer) {
            const typeHint = normalizeScalarValue(pickFirstValue(question, ['type', 'question_type', 'questionType'])).toLowerCase();
            if (typeHint.includes('true') || typeHint.includes('false') || typeHint === 'tf') {
                return true;
            }
            if (options.length === 2) {
                const optionTexts = options.map((option) => option.content.toLowerCase());
                if (optionTexts.includes('true') && optionTexts.includes('false')) {
                    return true;
                }
            }
            const normalizedAnswer = String(answer || '').trim().toUpperCase();
            return ['A', 'B', 'TRUE', 'FALSE', 'T', 'F'].includes(normalizedAnswer);
        }

        function normalizeQuizAnswer(question, options) {
            const rawAnswer = normalizeScalarValue(
                pickFirstDeepValue(question, [
                    'answer',
                    'correct_answer',
                    'correctAnswer',
                    'reference_answer',
                    'referenceAnswer',
                    'solution',
                    'correct_option',
                    'correctOption'
                ])
            );
            if (!rawAnswer) {
                return '';
            }

            const upperAnswer = rawAnswer.toUpperCase();
            if (upperAnswer === 'TRUE' || upperAnswer === 'T') {
                return 'A';
            }
            if (upperAnswer === 'FALSE' || upperAnswer === 'F') {
                return 'B';
            }

            const optionByKey = options.find((option) => option.option.toUpperCase() === upperAnswer);
            if (optionByKey) {
                return optionByKey.option;
            }

            const optionByText = options.find((option) => option.content.toLowerCase() === rawAnswer.toLowerCase());
            if (optionByText) {
                return optionByText.option;
            }

            return rawAnswer;
        }

        function normalizeQuestionText(question) {
            return normalizeScalarValue(
                pickFirstDeepValue(question, ['question', 'prompt', 'stem', 'statement', 'sentence', 'text', 'content'])
            );
        }

        function normalizeQuestionAnswer(question) {
            return normalizeScalarValue(
                pickFirstDeepValue(question, [
                    'answer',
                    'answers',
                    'reference_answer',
                    'referenceAnswer',
                    'reference_answers',
                    'referenceAnswers',
                    'sample_answer',
                    'sampleAnswer',
                    'sample_answers',
                    'sampleAnswers',
                    'model_answer',
                    'modelAnswer',
                    'model_answers',
                    'modelAnswers',
                    'ideal_answer',
                    'idealAnswer',
                    'expected_answer',
                    'expectedAnswer',
                    'correct_answer',
                    'correctAnswer',
                    'suggested_answer',
                    'suggestedAnswer',
                    'explanation',
                    'explanations',
                    'solution',
                    'solutions'
                ])
            );
        }

        function normalizeQuestionId(question, index) {
            const rawId = normalizeScalarValue(pickFirstDeepValue(question, ['id', 'number', 'index']));
            return rawId || String(index + 1);
        }

        function buildQuizHtml(data, currentFileName, quizType = 'mcq', isFinal = false) {
            const rawQuestions = extractQuestionItems(data);
            const questions = rawQuestions.map((question, index) => {
                const normalizedQuestion = question && typeof question === 'object'
                    ? question
                    : { question: normalizeScalarValue(question) };
                let options = normalizeOptions(normalizedQuestion);
                const provisionalAnswer = normalizeQuizAnswer(normalizedQuestion, options);

                if (!options.length && (quizType === 'tf' || looksLikeTrueFalse(normalizedQuestion, options, provisionalAnswer))) {
                    options = [
                        { option: 'A', content: 'True' },
                        { option: 'B', content: 'False' }
                    ];
                }

                return {
                    id: normalizeQuestionId(normalizedQuestion, index),
                    question: normalizeQuestionText(normalizedQuestion),
                    options,
                    answer: normalizeQuizAnswer(normalizedQuestion, options)
                };
            }).filter((question) => question.question);

            if (!questions.length) {
                if (!isFinal) {
                    return renderQuestionLoadingHtml();
                }
                return '<p class="rh-empty">没有找到题目数据。</p>';
            }

            const cards = questions.map((question, index) => {
                const qText = escapeHtml(question?.question ?? '');
                const qId = escapeHtml(String(question?.id ?? index + 1));
                const correct = escapeHtml(String(question?.answer ?? ''));
                const options = Array.isArray(question?.options) ? question.options : [];
                const optionHtml = options.map((option) => {
                    const rawOption = option ?? '';
                    const optionKey = escapeHtml(String(option?.option ?? option?.label ?? rawOption ?? ''));
                    const optionText = escapeHtml(String(option?.content ?? option?.text ?? (typeof rawOption === 'string' ? rawOption : '')));
                    return `<button type="button" class="rh-option" data-option="${optionKey}">
                        <span class="rh-option-letter">${optionKey}</span>
                        <span class="rh-option-text">${optionText}</span>
                    </button>`;
                }).join('');

                return `<div class="rh-question-card" data-correct-answer="${correct}">
                    <div class="rh-question-title">题目 ${qId}</div>
                    <div class="rh-question-text">${qText}</div>
                    <div class="rh-options">${optionHtml}</div>
                    <div class="rh-feedback" aria-live="polite"></div>
                </div>`;
            }).join('');

            return `<div class="rh-quiz">
                <div class="rh-quiz-header">全文选择/判断题 · ${escapeHtml(currentFileName || '')}</div>
                ${cards}
            </div>`;
        }

        function buildQuestionListHtml(data, currentFileName, isFinal = false) {
            const rawQuestions = extractQuestionItems(data);
            const questions = rawQuestions.map((question, index) => {
                const normalizedQuestion = question && typeof question === 'object'
                    ? question
                    : { question: normalizeScalarValue(question) };
                const answer = normalizeQuestionAnswer(normalizedQuestion);
                return {
                    id: normalizeQuestionId(normalizedQuestion, index),
                    question: normalizeQuestionText(normalizedQuestion),
                    answer: answer
                };
            }).filter((question) => question.question);

            if (!questions.length) {
                if (!isFinal) {
                    return renderQuestionLoadingHtml();
                }
                return '<p class="rh-empty">没有找到问答题数据。</p>';
            }

            const cards = questions.map((question, index) => {
                const qText = escapeHtml(question?.question ?? '');
                const qId = escapeHtml(String(question?.id ?? index + 1));
                const answer = escapeHtml(String(question?.answer ?? ''));
                return `<div class="rh-question-card">
                    <div class="rh-question-title">问题 ${qId}</div>
                    <div class="rh-question-text">${qText}</div>
                    <button type="button" class="rh-toggle-answer">Show Answer</button>
                    <div class="rh-answer">${answer}</div>
                </div>`;
            }).join('');

            return `<div class="rh-question-list">
                <div class="rh-quiz-header">全文问答 · ${escapeHtml(currentFileName || '')}</div>
                ${cards}
            </div>`;
        }

        function renderStructuredFallback(markdown, tip) {
            const content = String(markdown || '').trim();
            const body = content ? `<pre><code>${escapeHtml(content)}</code></pre>` : '<p>请耐心等待...</p>';
            const tipHtml = tip ? `<p class="tip">${tip}</p>` : '';
            return `${body}${tipHtml}`;
        }

        function markdownToHtml(markdown, operation, isFinal = false) {
            const currentFileName = document.getElementById('file-name').textContent;
            if (operation === 'mindmap') {
                return buildMindmapMessageHtml(markdown);

            } else if (operation === 'mcqs') {
                const parsed = parseJsonContent(markdown);
                if (!parsed) {
                    if (!isFinal) {
                        return renderQuestionLoadingHtml();
                    }
                    return renderStructuredFallback(markdown, '正在等待完整 JSON 输出...');
                }
                const quizHtml = buildQuizHtml(parsed.data, currentFileName, 'mcq', isFinal);
                return quizHtml;
            } else if (operation === 'tf') {
                const parsed = parseJsonContent(markdown);
                if (!parsed) {
                    if (!isFinal) {
                        return renderQuestionLoadingHtml();
                    }
                    return renderStructuredFallback(markdown, '正在等待完整 JSON 输出...');
                }
                const quizHtml = buildQuizHtml(parsed.data, currentFileName, 'tf', isFinal);
                return quizHtml;
            } else if (operation === 'questions') {
                const parsed = parseJsonContent(markdown);
                if (!parsed) {
                    if (!isFinal) {
                        return renderQuestionLoadingHtml();
                    }
                    return renderStructuredFallback(markdown, '正在等待完整 JSON 输出...');
                }
                const questionHtml = buildQuestionListHtml(parsed.data, currentFileName, isFinal);
                return questionHtml;
            } else if (operation === 'structure') {
                const data = extractJsonPayload(markdown);
                if (data) {
                    try {
                        const data1 = JSON.parse(data);
                        const div = document.createElement('div');
                        div.id = 'syntaxTree';
                        div.className = "tree";
                        createTree(data1.syntax_tree, div);
                        return div.outerHTML;
                    } catch (error) {
                        return renderStructuredFallback(markdown, '正在等待完整 JSON 输出...');
                    }
                }
                return renderStructuredFallback(markdown, '正在等待完整 JSON 输出...');
            } else {
                return markdownToHtml1(markdown);
            }
        };


        // 简单的Markdown转HTML函数
        function markdownToHtml1(markdown) {
            // 处理标题
            let html = markdown
                .replace(/^###### (.*$)/gm, '<h6>$1</h6>')
                .replace(/^##### (.*$)/gm, '<h5>$1</h5>')
                .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
                .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                .replace(/^# (.*$)/gm, '<h1>$1</h1>');

            // 处理列表
            html = html.replace(/^\s*[-*+] (.*$)/gm, '<li>$1</li>');
            html = html.replace(/<li>.*<\/li>/g, function (match) {
                return '<ul>' + match + '</ul>';
            });

            // 处理代码块
            //html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

            // 处理行内代码
            html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

            // 处理引用
            html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');

            // 处理表格
            html = html.replace(/^\|(.+)\|$\n^\|([-:|]+)\|$\n((?:^\|.+$\n?)+)/gm, function (match, headers, alignments, rows) {
                headers = headers.split('|').map(h => h.trim());
                rows = rows.split('\n').filter(r => r.trim() && r.includes('|')); // 确保是表格行

                let table = '<table><thead><tr>';
                headers.forEach(h => {
                    if (h) table += `<th>${h}</th>`;
                });
                table += '</tr></thead><tbody>';

                rows.forEach(row => {
                    const cells = row.split('|').map(c => c.trim());
                    table += '<tr>';
                    cells.forEach(c => {
                        if (c) table += `<td>${c}</td>`;
                    });
                    table += '</tr>';
                });

                table += '</tbody></table>';
                return table;
            });

            // 处理粗体和斜体
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

            // 处理水平线
            html = html.replace(/^---$/gm, '<hr>');

            // 处理段落
            html = html.replace(/^(?!<[a-z])(.*$)/gm, function (m) {
                return m.trim() ? '<p>' + m + '</p>' : '';
            });

            // 合并相邻的相同标签
            html = html.replace(/<\/ul>\s*<ul>/g, '');
            html = html.replace(/<\/p>\s*<p>/g, '</p><p>');

            return html;
        }

        function createTree(node, parentElement, level = 0) {
            const nodeElement = document.createElement('div');
            nodeElement.className = `node ${node.type}`;
            nodeElement.textContent = node.label;
            nodeElement.setAttribute('data-type', g(node.type));

            if (node.children && node.children.length > 0) {
                nodeElement.classList.add('is-collapsible');
            }

            parentElement.appendChild(nodeElement);

            if (node.children && node.children.length > 0) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'children';
                parentElement.appendChild(childrenContainer);

                // 初始状态下，非第一层节点默认折叠
                if (level > 0) {
                    childrenContainer.classList.add('is-collapsed');
                    nodeElement.classList.add('is-collapsed');
                }

                node.children.forEach(child => {
                    createTree(child, childrenContainer, level + 1);
                });
            }
        }

        function g(tag) {
            tags = {
                'sentence': '句子',
                'subject': '主语',
                'subject-clause': '主语从句',
                'predicate': '谓语',
                'object': '宾语',
                'direct-object': '直接宾语',
                'indirect-object': '间接宾语',
                'object-clause': '宾语从句',
                'subject-complement': '主语补语',
                'object-complement': '宾语补语',
                'predicative-clause': '补语从句',
                'attributive': '定语',
                'attributive-clause': '定语从句',
                'appositive': '同位语',
                'appositive-clause': '同位语从句',
                'adverbial': '状语',
                'adverbial-clause': '状语从句'
            };
            return (tag in tags) ? tags[tag] : tag;
        }

        function executeFunction() {
            const selectedValue = moreFuncsSelect.value;

            switch (selectedValue) {
                case 'annotate-vocab':
                    toggleVocabAnnotation().catch((error) => {
                        addSystemMessage(`词汇标注失败: ${error.message}`);
                    }).finally(() => {
                        moreFuncsSelect.value = '';
                    });
                    break;
                case 'mindmap':
                    gen_mindmap();
                    moreFuncsSelect.value = '';
                    break;
                case 'qa':
                    gen_qa();
                    moreFuncsSelect.value = '';
                    break;
                case 'mcq':
                    gen_mcq();
                    moreFuncsSelect.value = '';
                    break;
                case 'tf':
                    gen_tf();
                    moreFuncsSelect.value = '';
                    break;
            }
        }
