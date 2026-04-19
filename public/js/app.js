        // DOM元素
        const appShell = document.querySelector('.app-shell');
        const adminShell = document.getElementById('admin-shell');
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
        const readAloudBtn = document.getElementById('read-aloud-btn');
        const voiceSelect = document.getElementById('voice-select');
        const speechRateInput = document.getElementById('speech-rate');
        const speechVolumeInput = document.getElementById('speech-volume');
        const speechPitchInput = document.getElementById('speech-pitch');
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
        const mindmapToolbar = document.getElementById('mindmap-toolbar');
        const mindmapStage = document.getElementById('mindmap-stage');
        const mindmapZoomInBtn = document.getElementById('mindmap-zoom-in');
        const mindmapZoomOutBtn = document.getElementById('mindmap-zoom-out');
        const mindmapFullscreenBtn = document.getElementById('mindmap-fullscreen');
        const phoneBlockScreen = document.getElementById('phone-block-screen');
        const deviceHelper = window.readingHelperDevice || null;

        function syncDeviceTier() {
            if (deviceHelper && typeof deviceHelper.syncDeviceTier === 'function') {
                return deviceHelper.syncDeviceTier();
            }
            document.documentElement.setAttribute('data-device-tier', 'desktop');
            return 'desktop';
        }

        function getDeviceTier() {
            if (deviceHelper && typeof deviceHelper.getTier === 'function') {
                return deviceHelper.getTier();
            }
            return document.documentElement.getAttribute('data-device-tier') || syncDeviceTier();
        }

        function isPhoneDevice() {
            return getDeviceTier() === 'phone';
        }

        function isTabletDevice() {
            return getDeviceTier() === 'tablet';
        }

        function isResizeHandleAvailable() {
            if (!resizeHandle) return false;
            return getComputedStyle(resizeHandle).display !== 'none';
        }

        function applyDeviceSpecificCopy() {
            if (!userInput) return;
            userInput.placeholder = isTabletDevice()
                ? '输入问题...'
                : '输入任何与英文学习相关的问题...';
        }

        syncDeviceTier();
        applyDeviceSpecificCopy();

        const featureModuleLoaders = new Map();
        const featureModules = new Map();
        const featureModulePromises = new Map();
        const operationRenderers = new Map();
        const OPERATION_FEATURE_MODULES = new Map([
            ['mindmap', 'mindmap'],
            ['mcqs', 'quiz'],
            ['tf', 'quiz'],
            ['questions', 'quiz'],
            ['structure', 'quiz']
        ]);
        const appApi = {};
        window.readingHelperApp = appApi;

        function registerFeatureLoader(name, loader) {
            if (typeof name !== 'string' || !name || typeof loader !== 'function') return;
            featureModuleLoaders.set(name, loader);
        }

        function getLoadedFeatureModule(name) {
            return featureModules.get(name) || null;
        }

        async function loadFeatureModule(name) {
            if (featureModules.has(name)) {
                return featureModules.get(name);
            }
            if (featureModulePromises.has(name)) {
                return featureModulePromises.get(name);
            }

            const loader = featureModuleLoaders.get(name);
            if (typeof loader !== 'function') {
                return null;
            }

            const loadingPromise = Promise.resolve(loader())
                .then((loadedModule) => {
                    if (loadedModule && typeof loadedModule.setup === 'function') {
                        loadedModule.setup(appApi);
                    }
                    featureModules.set(name, loadedModule);
                    featureModulePromises.delete(name);
                    return loadedModule;
                })
                .catch((error) => {
                    featureModulePromises.delete(name);
                    throw error;
                });

            featureModulePromises.set(name, loadingPromise);
            return loadingPromise;
        }

        async function ensureOperationRenderer(operation) {
            const featureName = OPERATION_FEATURE_MODULES.get(operation);
            if (!featureName) return null;
            return loadFeatureModule(featureName);
        }

        function registerOperationRenderer(operation, renderer) {
            if (typeof operation !== 'string' || !operation || typeof renderer !== 'function') return;
            operationRenderers.set(operation, renderer);
        }

        chatMessages.addEventListener('click', async (event) => {
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
                try {
                    const mindmapModule = await loadFeatureModule('mindmap');
                    mindmapModule?.openMindmapModal?.(decodeStructuredData(encodedMarkdown));
                } catch (error) {
                    addSystemMessage(`加载思维导图失败: ${error.message}`);
                }
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
        let currentRole = '';
        let currentUserId = '';

        // 拖动调整面板宽度功能
        let isResizing = false;
        let resizeStartX = 0;
        let resizeStartWidth = 0;
        let resizeMinWidth = 0;
        let resizeMaxWidth = 0;
        let activeResizePointerId = null;

        const authModal = document.getElementById('auth-modal');
        const accessKeyInput = document.getElementById('access-key');
        const loginBtn = document.getElementById('login-btn');
        const authError = document.getElementById('auth-error');
        const logoutBtn = document.getElementById('logout-btn');
        const adminLogoutBtn = document.getElementById('admin-logout-btn');
        const connectivityCheckBtn = document.getElementById('connectivity-check-btn');
        const turnstileWidget = document.getElementById('turnstile-widget');
        let turnstileToken = '';
        const serverFiles = new Set();
        let serverFileNames = [];
        let renderedFileNames = [];
        const fileNameCollator = new Intl.Collator('zh-CN');
        const defaultTextContentHtml = '<p>请上传一个文本文件。</p><p>您可以选择单词、句子或段落，然后在右侧与AI助手交互。</p>';
        let contextMenuFileName = '';
        let contextMenuConversationId = '';
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
        const DEFAULT_PREFERENCES = Object.freeze({
            speechRate: 0.9,
            speechVolume: 1.0,
            speechPitch: 1.0
        });
        const PREFERENCE_SAVE_DELAY_MS = 500;
        let heartbeatTimerId = 0;
        let heartbeatInFlight = false;
        let preferenceSaveTimerId = 0;
        let pendingPreferences = null;
        let preferenceSavePromise = null;
        let lastSavedPreferences = { ...DEFAULT_PREFERENCES };

        function clearServerFiles() {
            serverFiles.clear();
            serverFileNames = [];
        }

        function setServerFileNames(fileNames) {
            clearServerFiles();
            fileNames.forEach((fileName) => {
                if (typeof fileName !== 'string' || !fileName.trim() || serverFiles.has(fileName)) {
                    return;
                }
                serverFiles.add(fileName);
                serverFileNames.push(fileName);
            });
        }

        function insertServerFileName(fileName) {
            if (typeof fileName !== 'string' || !fileName.trim() || serverFiles.has(fileName)) {
                return;
            }

            serverFiles.add(fileName);
            const insertIndex = serverFileNames.findIndex((currentName) => fileNameCollator.compare(currentName, fileName) > 0);
            if (insertIndex === -1) {
                serverFileNames.push(fileName);
                return;
            }
            serverFileNames.splice(insertIndex, 0, fileName);
        }

        function removeServerFileName(fileName) {
            if (!serverFiles.has(fileName)) {
                return;
            }

            serverFiles.delete(fileName);
            const index = serverFileNames.indexOf(fileName);
            if (index !== -1) {
                serverFileNames.splice(index, 1);
            }
        }

        function normalizePreferenceValue(value, fallback) {
            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        }

        function getCurrentPreferencesSnapshot() {
            return {
                speechRate: normalizePreferenceValue(speechRateInput.value, DEFAULT_PREFERENCES.speechRate),
                speechVolume: normalizePreferenceValue(speechVolumeInput.value, DEFAULT_PREFERENCES.speechVolume),
                speechPitch: normalizePreferenceValue(speechPitchInput.value, DEFAULT_PREFERENCES.speechPitch)
            };
        }

        function applyPreferencesToInputs(preferences) {
            const nextPreferences = preferences || DEFAULT_PREFERENCES;
            speechRateInput.value = String(nextPreferences.speechRate);
            speechVolumeInput.value = String(nextPreferences.speechVolume);
            speechPitchInput.value = String(nextPreferences.speechPitch);
        }

        function arePreferencesEqual(left, right) {
            return left.speechRate === right.speechRate
                && left.speechVolume === right.speechVolume
                && left.speechPitch === right.speechPitch;
        }

        function clearPendingPreferenceSave() {
            if (!preferenceSaveTimerId) {
                return;
            }
            window.clearTimeout(preferenceSaveTimerId);
            preferenceSaveTimerId = 0;
        }

        function schedulePreferencesSave() {
            clearPendingPreferenceSave();
            preferenceSaveTimerId = window.setTimeout(() => {
                preferenceSaveTimerId = 0;
                void savePreferences();
            }, PREFERENCE_SAVE_DELAY_MS);
        }

        async function flushPreferencesSave() {
            clearPendingPreferenceSave();
            await savePreferences();
        }

        function haveSameFileNames(left, right) {
            if (left.length !== right.length) {
                return false;
            }
            for (let index = 0; index < left.length; index += 1) {
                if (left[index] !== right[index]) {
                    return false;
                }
            }
            return true;
        }

        async function persistPendingPreferences() {
            if (preferenceSavePromise) {
                await preferenceSavePromise;
                return;
            }

            preferenceSavePromise = (async () => {
                while (pendingPreferences) {
                    const preferenceOwner = currentUserId;
                    if (!preferenceOwner) {
                        pendingPreferences = null;
                        return;
                    }

                    const nextPreferences = pendingPreferences;
                    pendingPreferences = null;

                    if (arePreferencesEqual(nextPreferences, lastSavedPreferences)) {
                        continue;
                    }

                    const response = await fetch('/api/preferences', {
                        method: 'PUT',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': getCsrfToken()
                        },
                        body: JSON.stringify({ userId: preferenceOwner, ...nextPreferences })
                    });

                    if (response.status === 401) {
                        await checkAuthStatus();
                        throw new Error('请先登录后再保存偏好');
                    }
                    if (!response.ok) {
                        throw new Error(`保存偏好失败: ${response.status}`);
                    }

                    const savedPreferences = await response.json();
                    if (currentUserId !== preferenceOwner) {
                        continue;
                    }
                    lastSavedPreferences = {
                        speechRate: normalizePreferenceValue(savedPreferences.speechRate, nextPreferences.speechRate),
                        speechVolume: normalizePreferenceValue(savedPreferences.speechVolume, nextPreferences.speechVolume),
                        speechPitch: normalizePreferenceValue(savedPreferences.speechPitch, nextPreferences.speechPitch)
                    };
                }
            })();

            try {
                await preferenceSavePromise;
            } finally {
                preferenceSavePromise = null;
            }

            if (pendingPreferences && !arePreferencesEqual(pendingPreferences, lastSavedPreferences)) {
                await persistPendingPreferences();
            }
        }

        function resetPreferenceState() {
            clearPendingPreferenceSave();
            pendingPreferences = null;
            preferenceSavePromise = null;
            lastSavedPreferences = { ...DEFAULT_PREFERENCES };
            applyPreferencesToInputs(DEFAULT_PREFERENCES);
        }

        async function queuePreferencesSave(preferences) {
            pendingPreferences = preferences;
            await persistPendingPreferences();
        }

        function attachPreferenceInputListeners(input) {
            input.addEventListener('input', schedulePreferencesSave);
            input.addEventListener('change', schedulePreferencesSave);
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
            const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
            return match ? decodeURIComponent(match[1]) : '';
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

        function clearTextSelectionState(clearBrowserSelection = false) {
            currentSelection = '';
            selectedRange = null;
            pContent = '';

            if (clearBrowserSelection) {
                const selection = window.getSelection();
                selection?.removeAllRanges();
            }
        }

        function getSelectionAnchorElement(node) {
            if (!node) return null;
            return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        }

        function isRangeInsideTextContent(range) {
            const anchorElement = getSelectionAnchorElement(range?.commonAncestorContainer);
            return !!anchorElement && textContent.contains(anchorElement);
        }

        function getParagraphElementFromRange(range) {
            const anchorElement = getSelectionAnchorElement(range?.commonAncestorContainer);
            return anchorElement?.closest ? anchorElement.closest('#text-content p') : null;
        }

        function updateSelectionStateFromRange(range) {
            if (!(range instanceof Range) || !isRangeInsideTextContent(range)) {
                return false;
            }

            const nextSelection = range.toString().trim();
            const paragraphElement = getParagraphElementFromRange(range);
            const nextParagraph = (paragraphElement?.innerText || '').trim();

            if (!nextSelection || !nextParagraph || !nextParagraph.includes(nextSelection)) {
                return false;
            }

            currentSelection = nextSelection;
            selectedRange = range.cloneRange();
            pContent = nextParagraph;
            return true;
        }

        function syncSelectionState(options = {}) {
            const {
                preservePrevious = true,
                clearBrowserSelection = false
            } = options;

            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
                const range = selection.getRangeAt(0);
                if (updateSelectionStateFromRange(range)) {
                    return true;
                }
            }

            if (!preservePrevious) {
                clearTextSelectionState(clearBrowserSelection);
            }

            return false;
        }

        function scheduleSelectionSync(preservePrevious = false) {
            window.setTimeout(() => {
                syncSelectionState({ preservePrevious });
            }, 0);
        }

        function dismissAuthModal() {
            accessKeyInput.value = '';
            authModal.style.display = 'none';
            authError.style.display = 'none';
            resetCaptcha();
        }

        function showPhoneBlockedView() {
            stopHeartbeat();
            currentRole = '';
            currentUserId = '';
            setActiveShell('user');
            hideModelBadge();
            dismissAuthModal();
            if (phoneBlockScreen) {
                phoneBlockScreen.setAttribute('aria-hidden', 'false');
            }
        }

        function showAuthModal() {
            syncDeviceTier();
            if (isPhoneDevice()) {
                showPhoneBlockedView();
                return;
            }

            if (phoneBlockScreen) {
                phoneBlockScreen.setAttribute('aria-hidden', 'true');
            }

            accessKeyInput.value = '';
            authModal.style.display = 'flex';
            resetCaptcha();
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
            getLoadedFeatureModule('articleRenderer')?.resetState?.();
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
            getLoadedFeatureModule('promptManager')?.resetState?.();
        }

        function hideModelBadge() {
            const modelBadge = document.getElementById('model-badge');
            if (modelBadge) {
                modelBadge.style.display = 'none';
                modelBadge.textContent = '';
            }
        }

        function setActiveShell(role) {
            const isAdmin = role === 'admin';
            if (appShell) {
                appShell.style.display = isAdmin ? 'none' : '';
            }
            if (adminShell) {
                adminShell.style.display = isAdmin ? 'block' : 'none';
            }
            document.body.classList.toggle('is-admin-mode', isAdmin);
        }

        function resetUserWorkspace() {
            clearServerFiles();
            currentFileName = '';
            currentFileContent = '';
            currentSelection = '';
            selectedRange = null;
            pContent = '';
            currentConversationId = '';
            creatingConversationPromise = null;
            renderedFileNames = [];
            contextMenuFileName = '';
            contextMenuConversationId = '';
            getLoadedFeatureModule('articleRenderer')?.resetState?.();
            getLoadedFeatureModule('mindmap')?.resetState?.();
            getLoadedFeatureModule('speech')?.resetState?.();
            resetSummaryEvaluationState();
            resetPromptState();
            resetPreferenceState();
            hideFileContextMenu();
            hideChatHistoryContextMenu();
            chatHistoryModal.style.display = 'none';
            fileNameDisplay.textContent = '未选择文件';
            textContent.innerHTML = defaultTextContentHtml;
            clearChatPanel();
            updateFileList();
        }

        async function deactivateAdminPanel() {
            try {
                const adminPanel = getLoadedFeatureModule('adminPanel');
                await adminPanel?.deactivateAdminPanel?.();
            } catch (error) {
            }
        }

        async function activateAdminPanel() {
            const adminPanel = await loadFeatureModule('adminPanel');
            await adminPanel?.activateAdminPanel?.();
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
            const articleText = getCurrentArticleContent();
            if (!articleText) return '';
            if (articleText.length <= MAX_ARTICLE_CONTEXT_CHARS) {
                return articleText;
            }
            return `${articleText.slice(0, MAX_ARTICLE_CONTEXT_CHARS)}\n\n[文章较长，以上为前 ${MAX_ARTICLE_CONTEXT_CHARS} 个字符]`;
        }

        async function showAuthenticatedView(options = {}) {
            const {
                role,
                hydrateUserData = false,
                apiModel = ''
            } = options;

            syncDeviceTier();
            if (isPhoneDevice()) {
                showPhoneBlockedView();
                return;
            }

            if (phoneBlockScreen) {
                phoneBlockScreen.setAttribute('aria-hidden', 'true');
            }

            if (role === 'admin') {
                stopHeartbeat();
                hideModelBadge();
                setActiveShell('admin');
                await activateAdminPanel();
                if (adminLogoutBtn) {
                    adminLogoutBtn.title = '管理员退出';
                }
                logoutBtn.title = '退出';
                return;
            }

            await deactivateAdminPanel();
            setActiveShell('user');
            startHeartbeat();
            if (apiModel) {
                showModelBadge(apiModel);
            } else {
                hideModelBadge();
            }
            logoutBtn.title = currentUserId ? `当前用户: ${currentUserId}` : '退出';
            if (adminLogoutBtn) {
                adminLogoutBtn.title = '退出';
            }

            if (hydrateUserData) {
                try {
                    await fetchServerFileList();
                    updateFileList();
                } catch (error) {
                    addSystemMessage(`读取文件列表失败: ${error.message}`);
                }
                await loadPreferences();
            }
        }

        async function showLoggedOutView() {
            stopHeartbeat();
            currentRole = '';
            currentUserId = '';
            await deactivateAdminPanel();
            setActiveShell('user');
            resetUserWorkspace();
            hideModelBadge();
            logoutBtn.title = '退出';
            if (adminLogoutBtn) {
                adminLogoutBtn.title = '退出';
            }
            syncDeviceTier();
            if (isPhoneDevice()) {
                showPhoneBlockedView();
                return;
            }
            showAuthModal();
        }

        async function checkAuthStatus() {
            syncDeviceTier();
            if (isPhoneDevice()) {
                showPhoneBlockedView();
                return false;
            }

            const previousRole = currentRole;
            const previousUserId = currentUserId;
            try {
                const response = await fetch('/api/auth/status', {
                    method: 'GET',
                    credentials: 'include'
                });
                if (!response.ok) throw new Error(`状态检查失败: ${response.status}`);

                const data = await response.json();
                const authenticated = !!data.authenticated;
                const nextRole = authenticated && (data.role === 'admin' || data.role === 'user') ? data.role : '';
                const nextUserId = nextRole === 'user' && typeof data.userId === 'string' ? data.userId : '';
                const shouldResetWorkspace = !authenticated
                    || previousRole !== nextRole
                    || (previousUserId && previousUserId !== nextUserId);

                if (!authenticated || previousRole !== nextRole || (previousUserId && previousUserId !== nextUserId)) {
                    resetPromptState();
                }
                if (shouldResetWorkspace) {
                    resetUserWorkspace();
                }
                currentRole = nextRole;
                currentUserId = nextUserId;
                if (authenticated) {
                    dismissAuthModal();
                    await showAuthenticatedView({
                        role: nextRole,
                        apiModel: data.apiModel || '',
                        hydrateUserData: false
                    });
                } else {
                    await showLoggedOutView();
                }
                return authenticated;
            } catch (error) {
                resetPromptState();
                await showLoggedOutView();
                return false;
            }
        }

        async function login() {
            syncDeviceTier();
            if (isPhoneDevice()) {
                showPhoneBlockedView();
                return;
            }

            const accessKey = accessKeyInput.value.trim();
            if (!accessKey) {
                authError.textContent = '请输入访问 Key';
                authError.style.display = 'block';
                return;
            }

            const latestTurnstileToken = getLatestTurnstileToken();
            if (!latestTurnstileToken) {
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
                    body: JSON.stringify({ accessKey, turnstileToken: latestTurnstileToken })
                });

                if (response.status === 401) {
                    authError.textContent = '访问 Key 无效，请重试。';
                    authError.style.display = 'block';
                    resetCaptcha();
                    return;
                }
                if (!response.ok) {
                    const data = await response.json();
                    authError.textContent = data.error || `登录失败: ${response.status}`;
                    authError.style.display = 'block';
                    resetCaptcha();
                    return;
                }

                const data = await response.json();
                const nextRole = data.role === 'admin' || data.role === 'user' ? data.role : '';
                const nextUserId = nextRole === 'user' && typeof data.userId === 'string' ? data.userId : '';
                const shouldResetWorkspace = currentRole !== nextRole
                    || (currentUserId && currentUserId !== nextUserId)
                    || nextRole === 'admin';

                if (!nextRole || (nextRole === 'user' && !nextUserId)) {
                    throw new Error('登录响应缺少角色信息');
                }

                if (!nextUserId || currentUserId !== nextUserId || currentRole !== nextRole) {
                    resetPromptState();
                }
                if (shouldResetWorkspace) {
                    resetUserWorkspace();
                }
                currentRole = nextRole;
                currentUserId = nextUserId;
                authError.style.display = 'none';
                dismissAuthModal();
                await showAuthenticatedView({
                    role: nextRole,
                    apiModel: data.apiModel || '',
                    hydrateUserData: nextRole === 'user'
                });
            } catch (error) {
                authError.textContent = error.message || '登录失败';
                authError.style.display = 'block';
            }
        }

        async function logout() {
            stopHeartbeat();
            try {
                await flushPreferencesSave();
            } catch (error) {
            }
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
            await showLoggedOutView();
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
                const files = Array.isArray(data.files)
                    ? data.files.filter((name) => typeof name === 'string' && name.trim())
                    : [];
                setServerFileNames(files);
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
                insertServerFileName(data.name);
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
            return (Array.isArray(data.prompts) ? data.prompts : [])
                .filter((name) => typeof name === 'string' && name.trim());
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
                removeServerFileName(fileName);
                resetDeletedFileView(fileName);
                if (!deletingCurrentFile) {
                    addSystemMessage(`已删除文件: ${fileName}`);
                }
                updateFileList();
            } catch (error) {
                addSystemMessage(`删除失败: ${error.message}`);
            }
        }

        function clearChatPanel() {
            chatMessages.replaceChildren();
        }

        function highlightCurrentFile() {
            Array.from(fileList.children).forEach((li) => {
                li.classList.toggle('active', li.dataset.fileName === currentFileName);
            });
        }

        function getCurrentArticleContent() {
            return String(currentFileContent || '').trim();
        }

        function buildPlainArticleFragment(content) {
            const fragment = document.createDocumentFragment();
            String(content || '')
                .split('\n\n')
                .map((paragraph) => String(paragraph || '').trim())
                .filter(Boolean)
                .forEach((paragraph) => {
                    const node = document.createElement('p');
                    node.textContent = paragraph;
                    fragment.appendChild(node);
                });
            return fragment;
        }

        function renderPlainArticleContent(content) {
            textContent.replaceChildren(buildPlainArticleFragment(content));
        }

        async function renderArticleContent(content) {
            try {
                const articleRenderer = await loadFeatureModule('articleRenderer');
                if (articleRenderer?.renderArticleContent) {
                    articleRenderer.renderArticleContent(content);
                    return;
                }
            } catch (error) {
            }

            renderPlainArticleContent(content);
        }

        async function toggleVocabAnnotation() {
            const articleRenderer = await loadFeatureModule('articleRenderer');
            if (!articleRenderer?.toggleVocabAnnotation) {
                throw new Error('文章渲染模块未就绪');
            }
            await articleRenderer.toggleVocabAnnotation();
        }

        function renderConversationMessages(interactions) {
            const fragment = document.createDocumentFragment();
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
                fragment.appendChild(messageElement);
            });
            chatMessages.replaceChildren(fragment);
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
            const fragment = document.createDocumentFragment();
            if (!Array.isArray(conversations) || conversations.length === 0) {
                const emptyNode = document.createElement('li');
                emptyNode.className = 'chat-history-empty';
                emptyNode.textContent = '该文章暂无历史记录。';
                chatHistoryList.replaceChildren(emptyNode);
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
                li.appendChild(button);
                fragment.appendChild(li);
            });

            chatHistoryList.replaceChildren(fragment);
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

        async function openPromptManager() {
            const promptManager = await loadFeatureModule('promptManager');
            if (!promptManager?.openPromptManager) {
                throw new Error('提示词模块未就绪');
            }
            await promptManager.openPromptManager();
        }

        loginBtn.addEventListener('click', login);
        accessKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                login();
            }
        });
        logoutBtn.addEventListener('click', logout);
        adminLogoutBtn?.addEventListener('click', logout);

        connectivityCheckBtn?.addEventListener('click', async () => {
            connectivityCheckBtn.disabled = true;
            connectivityCheckBtn.textContent = '检测中…';
            try {
                const response = await fetch('/api/ai/connectivity-check', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': getCsrfToken()
                    }
                });
                const data = await response.json();
                if (data.ok) {
                    addSystemMessage(`✅ AI 连通性正常，延迟 ${data.latencyMs} ms`);
                } else {
                    const code = data.errorCode ? `[${data.errorCode}] ` : '';
                    const message = data.message || data.error || '连接失败';
                    const detail = data.summary ? `（${data.summary}）` : '';
                    const latency = typeof data.latencyMs === 'number' ? `（${data.latencyMs} ms）` : '';
                    addSystemMessage(`❌ AI 连通性异常${latency}：${code}${message}${detail}`);
                }
            } catch (error) {
                addSystemMessage(`❌ 连通性检查失败：${error.message}`);
            } finally {
                connectivityCheckBtn.disabled = false;
                connectivityCheckBtn.textContent = '检查连通性';
            }
        });

        function handleTurnstileSuccess(token) {
            turnstileToken = typeof token === 'string' ? token.trim() : '';
            loginBtn.disabled = !turnstileToken;
            authError.style.display = 'none';
        }

        function handleTurnstileExpired() {
            turnstileToken = '';
            loginBtn.disabled = true;
        }

        function handleTurnstileError() {
            turnstileToken = '';
            loginBtn.disabled = true;
            authError.textContent = '人机验证失败，请刷新页面重试';
            authError.style.display = 'block';
        }

        window.onTurnstileSuccess = handleTurnstileSuccess;
        window.onTurnstileExpired = handleTurnstileExpired;
        window.onTurnstileError = handleTurnstileError;

        function getLatestTurnstileToken() {
            const responseInput = document.querySelector('input[name="cf-turnstile-response"]');
            const inputToken = typeof responseInput?.value === 'string' ? responseInput.value.trim() : '';
            if (inputToken) {
                turnstileToken = inputToken;
                return inputToken;
            }
            return typeof turnstileToken === 'string' ? turnstileToken.trim() : '';
        }

        function resetCaptcha() {
            turnstileToken = '';
            loginBtn.disabled = true;
            if (window.turnstile && typeof window.turnstile.reset === 'function' && turnstileWidget) {
                try {
                    window.turnstile.reset();
                } catch (error) {
                }
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
        chatHistoryModal.addEventListener('click', (event) => {
            if (event.target === chatHistoryModal) {
                chatHistoryModal.style.display = 'none';
                hideChatHistoryContextMenu();
            }
        });
        fileHistory.addEventListener('scroll', hideFileContextMenu);
        chatHistoryList.addEventListener('scroll', hideChatHistoryContextMenu);
        window.addEventListener('resize', () => {
            syncDeviceTier();
            applyDeviceSpecificCopy();
            hideFileContextMenu();
            hideChatHistoryContextMenu();
            if (isPhoneDevice()) {
                showPhoneBlockedView();
            } else if (phoneBlockScreen) {
                phoneBlockScreen.setAttribute('aria-hidden', 'true');
            }
            if (!isResizeHandleAvailable()) {
                stopResize();
                textPanel.style.flex = '';
            }
        });

        async function loadPreferences() {
            if (!currentUserId) return;
            const requestedUserId = currentUserId;
            try {
                const response = await fetch(`/api/preferences?userId=${encodeURIComponent(requestedUserId)}`, {
                    method: 'GET',
                    credentials: 'include'
                });
                if (response.ok && currentUserId === requestedUserId) {
                    const prefs = await response.json();
                    const normalizedPreferences = {
                        speechRate: normalizePreferenceValue(prefs.speechRate, DEFAULT_PREFERENCES.speechRate),
                        speechVolume: normalizePreferenceValue(prefs.speechVolume, DEFAULT_PREFERENCES.speechVolume),
                        speechPitch: normalizePreferenceValue(prefs.speechPitch, DEFAULT_PREFERENCES.speechPitch)
                    };
                    applyPreferencesToInputs(normalizedPreferences);
                    lastSavedPreferences = normalizedPreferences;
                }
            } catch (error) {}
        }

        async function savePreferences() {
            if (!currentUserId) return;
            try {
                const preferences = getCurrentPreferencesSnapshot();
                if (arePreferencesEqual(preferences, lastSavedPreferences)) {
                    return;
                }
                await queuePreferencesSave(preferences);
            } catch (error) {}
        }

        window.addEventListener('load', async () => {
            syncDeviceTier();
            applyDeviceSpecificCopy();
            const authenticated = await checkAuthStatus();
            if (authenticated && currentRole === 'user') {
                await fetchServerFileList();
                await loadPreferences();
            }
            updateFileList();
        });
        document.addEventListener('visibilitychange', () => {
            if (currentRole !== 'user' || !currentUserId) return;
            if (document.visibilityState === 'visible') {
                scheduleHeartbeat(0);
                return;
            }
            void flushPreferencesSave();
            scheduleHeartbeat(HEARTBEAT_BACKGROUND_MS);
        });
        window.addEventListener('online', () => {
            if (currentRole !== 'user' || !currentUserId) return;
            scheduleHeartbeat(0);
        });
        window.addEventListener('pagehide', () => {
            if (currentRole !== 'user' || !currentUserId) return;
            void flushPreferencesSave();
        });

        attachPreferenceInputListeners(speechRateInput);
        attachPreferenceInputListeners(speechVolumeInput);
        attachPreferenceInputListeners(speechPitchInput);

        refreshFileListBtn.addEventListener('click', async () => {
            await fetchServerFileList();
            updateFileList();
        });

        clearChatBtn.addEventListener('click', () => {
            clearChatHistory();
        });
        editPromptsBtn.addEventListener('click', async () => {
            try {
                await openPromptManager();
            } catch (error) {
                addSystemMessage(`打开提示词编辑器失败: ${error.message}`);
            }
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

        // Event delegation for file list clicks
        fileList.addEventListener('click', async (event) => {
            const li = event.target.closest('li');
            if (!li || !fileList.contains(li)) return;
            hideFileContextMenu();
            await loadHistory(li.dataset.fileName);
        });
        chatHistoryList.addEventListener('click', async (event) => {
            const item = event.target.closest('.chat-history-item');
            if (!item || !chatHistoryList.contains(item)) return;
            hideChatHistoryContextMenu();
            await loadConversationById(item.dataset.conversationId);
        });

        function updateFileList() {
            hideFileContextMenu();
            if (haveSameFileNames(serverFileNames, renderedFileNames)) {
                highlightCurrentFile();
                return;
            }

            const fragment = document.createDocumentFragment();
            serverFileNames.forEach((fileName) => {
                const li = document.createElement('li');
                li.textContent = fileName;
                li.dataset.fileName = fileName;
                fragment.appendChild(li);
            });
            fileList.replaceChildren(fragment);
            renderedFileNames = serverFileNames.slice();

            highlightCurrentFile();
        }

        async function loadHistory(fileName) {
            currentFileName = fileName;
            currentConversationId = '';
            creatingConversationPromise = null;
            getLoadedFeatureModule('articleRenderer')?.resetState?.();
            resetSummaryEvaluationState();

            try {
                const content = await fetchServerFileContent(currentFileName);
                fileNameDisplay.textContent = currentFileName;
                currentFileContent = content;
                await renderArticleContent(content);
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
                updateFileList();
                await loadHistory(saved?.name || file.name);
            } catch (error) {
                addSystemMessage(`上传文件失败: ${error.message}`);
            } finally {
                fileInput.value = '';
            }
        });

        resizeHandle.addEventListener('pointerdown', (e) => {
            if (!isResizeHandleAvailable()) {
                return;
            }

            if (e.pointerType === 'mouse' && e.button !== 0) {
                return;
            }

            isResizing = true;
            activeResizePointerId = e.pointerId;
            if (typeof resizeHandle.setPointerCapture === 'function') {
                try {
                    resizeHandle.setPointerCapture(e.pointerId);
                } catch (error) {
                }
            }
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
            document.body.style.userSelect = 'none';
            document.addEventListener('pointermove', handleResize);
            document.addEventListener('pointerup', stopResize);
            document.addEventListener('pointercancel', stopResize);
            e.preventDefault();
        });

        function handleResize(e) {
            if (!isResizing) return;
            if (activeResizePointerId !== null && e.pointerId !== activeResizePointerId) return;
            const dx = e.clientX - resizeStartX;
            const nextWidth = resizeStartWidth + dx;
            const clampedWidth = Math.min(resizeMaxWidth, Math.max(resizeMinWidth, nextWidth));
            textPanel.style.flex = '0 0 ' + clampedWidth + 'px';
        }

        function stopResize(e) {
            if (!isResizing) return;
            if (e && activeResizePointerId !== null && e.pointerId !== activeResizePointerId) return;

            isResizing = false;
            if (activeResizePointerId !== null && resizeHandle?.hasPointerCapture?.(activeResizePointerId)) {
                try {
                    resizeHandle.releasePointerCapture(activeResizePointerId);
                } catch (error) {
                }
            }
            activeResizePointerId = null;
            resizeHandle.style.backgroundColor = '';
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('pointermove', handleResize);
            document.removeEventListener('pointerup', stopResize);
            document.removeEventListener('pointercancel', stopResize);
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


        function handleSelectionCommit() {
            scheduleSelectionSync(false);
        }

        document.addEventListener('selectionchange', () => {
            syncSelectionState({ preservePrevious: true });
        });
        textContent.addEventListener('pointerup', handleSelectionCommit);
        textContent.addEventListener('touchend', handleSelectionCommit, { passive: true });
        textContent.addEventListener('mouseup', handleSelectionCommit);

        async function callFeaturePrompt(fileName, variables, userPrompt, loadingText, operation, forceRefresh = false) {
            await ensureOperationRenderer(operation);
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
            syncSelectionState({ preservePrevious: true });
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
            syncSelectionState({ preservePrevious: true });
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
            syncSelectionState({ preservePrevious: true });
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

        readAloudBtn.addEventListener('click', async function () {
            syncSelectionState({ preservePrevious: true });
            try {
                const speechModule = await loadFeatureModule('speech');
                if (!speechModule?.handleReadAloudClick) {
                    throw new Error('朗读模块未就绪');
                }
                await speechModule.handleReadAloudClick();
            } catch (error) {
                addSystemMessage(`朗读失败: ${error.message}`);
            }
        });

        // 概括段落
        document.getElementById('summarize-paragraph').addEventListener('click', async function () {
            syncSelectionState({ preservePrevious: true });
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
            syncSelectionState({ preservePrevious: true });
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
            const passageContent = getCurrentArticleContent();
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
            const passageContent = getCurrentArticleContent();
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
            const passageContent = getCurrentArticleContent();
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
            const passageContent = getCurrentArticleContent();
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
            scheduleChatScrollToBottom();
        }

        // 添加用户消息
        function addUserMessage(message) {
            const messageElement = document.createElement('div');
            messageElement.className = 'message user-message';
            messageElement.textContent = message;
            chatMessages.appendChild(messageElement);
            scheduleChatScrollToBottom();

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
                const html = buildAssistantMessageHtml(message, null);
                messageElement.innerHTML = sanitizeAssistantHtml(html);
                saveInteraction('assistant', html).catch((error) => {
                    addSystemMessage(`保存对话失败: ${error.message}`);
                });
            } else {
                messageElement.textContent = message;
            }

            chatMessages.appendChild(messageElement);
            scheduleChatScrollToBottom();

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

        const STRUCTURED_STREAM_OPERATIONS = new Set(['mindmap', 'mcqs', 'tf', 'questions', 'structure']);
        const STREAM_RENDER_THROTTLE_MS = 250;
        let chatScrollFrame = 0;

        function scheduleChatScrollToBottom() {
            if (chatScrollFrame) return;
            chatScrollFrame = requestAnimationFrame(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
                chatScrollFrame = 0;
            });
        }

        function isStructuredStreamOperation(operation) {
            return STRUCTURED_STREAM_OPERATIONS.has(operation);
        }

        function getStructuredStreamLabel(operation) {
            switch (operation) {
                case 'mindmap':
                    return '思维导图';
                case 'mcqs':
                    return '选择题';
                case 'tf':
                    return '判断题';
                case 'questions':
                    return '问答题';
                case 'structure':
                    return '语法树';
                default:
                    return '结构化内容';
            }
        }

        function buildAssistantMessageHtml(message, operation, isFinal = false) {
            return markdownToHtml(message, operation, isFinal);
        }

        function ensureStreamContentHost(messageElement) {
            const existing = messageElement.querySelector('.ai-stream-content');
            if (existing) {
                return existing;
            }

            const host = document.createElement('div');
            host.className = 'ai-stream-content';
            messageElement.appendChild(host);
            return host;
        }

        function renderAIStreamPreview(messageElement, message, operation) {
            const contentHost = ensureStreamContentHost(messageElement);

            if (isStructuredStreamOperation(operation)) {
                if (!contentHost.querySelector('.ai-structured-pending')) {
                    contentHost.innerHTML = '';

                    const wrapper = document.createElement('div');
                    wrapper.className = 'ai-structured-pending';

                    const title = document.createElement('div');
                    title.className = 'ai-structured-pending-title';
                    title.textContent = `正在生成${getStructuredStreamLabel(operation)}...`;

                    const hint = document.createElement('div');
                    hint.className = 'ai-structured-pending-hint';
                    hint.textContent = '内容完成后会自动渲染。';

                    wrapper.appendChild(title);
                    wrapper.appendChild(hint);
                    contentHost.appendChild(wrapper);
                }
            } else {
                let preview = contentHost.querySelector('.ai-stream-preview');
                if (!preview) {
                    contentHost.innerHTML = '';
                    preview = document.createElement('pre');
                    preview.className = 'ai-stream-preview';
                    contentHost.appendChild(preview);
                }
                preview.textContent = String(message || '');
            }

            messageElement.classList.remove('loading');
            scheduleChatScrollToBottom();
        }

        function renderAIResponse(messageElement, message, operation, isFinal = false) {
            const html = buildAssistantMessageHtml(message, operation, isFinal);
            messageElement.innerHTML = sanitizeAssistantHtml(html);
            messageElement.classList.remove('loading');
            scheduleChatScrollToBottom();
            return html;
        }

        // 调用AI API（流式输出版本）
        async function callAIApi(systemPrompt, userPrompt, loadingMessage, operation) {
            let responseElement = loadingMessage;
            let renderTimer = 0;
            let lastStreamRenderAt = 0;
            let pendingText = '';
            let structuredPreviewRendered = false;

            const clearScheduledRender = () => {
                if (!renderTimer) return;
                clearTimeout(renderTimer);
                renderTimer = 0;
            };

            const flushRender = (streamingDiv) => {
                clearScheduledRender();
                lastStreamRenderAt = Date.now();
                if (isStructuredStreamOperation(operation)) {
                    if (!structuredPreviewRendered) {
                        renderAIStreamPreview(streamingDiv, pendingText, operation);
                        structuredPreviewRendered = true;
                    }
                    return;
                }
                renderAIStreamPreview(streamingDiv, pendingText, operation);
            };

            const scheduleRender = (streamingDiv) => {
                if (isStructuredStreamOperation(operation)) {
                    if (!structuredPreviewRendered) {
                        flushRender(streamingDiv);
                    }
                    return;
                }
                if (renderTimer) return;
                const elapsed = Date.now() - lastStreamRenderAt;
                const delay = Math.max(0, STREAM_RENDER_THROTTLE_MS - elapsed);
                renderTimer = window.setTimeout(() => flushRender(streamingDiv), delay);
            };

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

                const streamContent = document.createElement('div');
                streamContent.className = 'ai-stream-content';
                streamingDiv.appendChild(streamContent);

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
                                pendingText = accumulatedText;
                                scheduleRender(streamingDiv);
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
                            pendingText = accumulatedText;
                        }
                    }
                }

                if (!accumulatedText.trim()) {
                    throw new Error('AI未返回有效内容');
                }

                clearScheduledRender();
                const cursorElement = streamingDiv.querySelector('.typing-cursor');
                if (cursorElement) {
                    cursorElement.remove();
                }

                const finalHtml = renderAIResponse(streamingDiv, accumulatedText, operation, true);
                saveInteraction('assistant', finalHtml).catch((error) => {
                    addSystemMessage(`保存对话失败: ${error.message}`);
                });
            } catch (error) {
                clearScheduledRender();
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

        function showModelBadge(modelName) {
            let modelBadge = document.getElementById('model-badge');
            if (!modelBadge) {
                modelBadge = document.createElement('div');
                modelBadge.id = 'model-badge';
                modelBadge.className = 'model-badge';
                chatMessages.parentElement.appendChild(modelBadge);
            }
            modelBadge.textContent = `模型: ${modelName}`;
            modelBadge.style.display = 'block';
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

        function renderStructuredFallback(markdown, tip) {
            const content = String(markdown || '').trim();
            const body = content ? `<pre><code>${escapeHtml(content)}</code></pre>` : '<p>请耐心等待...</p>';
            const tipHtml = tip ? `<p class="tip">${tip}</p>` : '';
            return `${body}${tipHtml}`;
        }

        function markdownToHtml(markdown, operation, isFinal = false) {
            const renderer = operation ? operationRenderers.get(operation) : null;
            if (renderer) {
                return renderer(markdown, {
                    currentFileName,
                    isFinal
                });
            }

            if (operation && isStructuredStreamOperation(operation) && isFinal) {
                return renderStructuredFallback(markdown, '结构化渲染模块尚未就绪，已展示原始内容。');
            }

            return markdownToHtml1(markdown);
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

        async function executeFunction() {
            const selectedValue = moreFuncsSelect.value;
            if (!selectedValue) return;

            try {
                switch (selectedValue) {
                    case 'annotate-vocab':
                        await toggleVocabAnnotation();
                        break;
                    case 'mindmap':
                        await gen_mindmap();
                        break;
                    case 'qa':
                        await gen_qa();
                        break;
                    case 'mcq':
                        await gen_mcq();
                        break;
                    case 'tf':
                        await gen_tf();
                        break;
                }
            } catch (error) {
                const labels = {
                    'annotate-vocab': '词汇标注',
                    mindmap: '思维导图',
                    qa: '全文问答题',
                    mcq: '全文选择题',
                    tf: '全文判断题'
                };
                addSystemMessage(`${labels[selectedValue] || '功能'}失败: ${error.message}`);
            } finally {
                moreFuncsSelect.value = '';
            }
        }

        moreFuncsSelect.addEventListener('change', () => {
            void executeFunction();
        });

        Object.assign(appApi, {
            registerFeatureLoader,
            loadFeatureModule,
            registerOperationRenderer,
            getCsrfToken,
            checkAuthStatus,
            fetchPromptFileList,
            fetchPromptFileContent,
            savePromptFileContent,
            addSystemMessage,
            getCurrentSelection: () => currentSelection,
            getCurrentFileName: () => currentFileName,
            getCurrentFileContent: () => currentFileContent,
            getCurrentRole: () => currentRole,
            hashString,
            encodeStructuredData,
            decodeStructuredData,
            escapeHtml,
            sanitizeAssistantHtml,
            dom: {
                appShell,
                adminShell,
                fileList,
                textContent,
                moreFuncsSelect,
                editPromptsBtn,
                readAloudBtn,
                voiceSelect,
                speechRateInput,
                speechVolumeInput,
                speechPitchInput,
                promptManagerModal,
                closePromptManagerModalBtn,
                promptListPanel,
                promptListView,
                promptEditorPanel,
                promptEditorName,
                promptEditorText,
                promptEditorBackBtn,
                promptEditorSaveBtn,
                mindmapModal,
                closeMindmapModalBtn,
                mindmapModalTitle,
                mindmapStatus,
                mindmapToolbar,
                mindmapStage,
                mindmapZoomInBtn,
                mindmapZoomOutBtn,
                mindmapFullscreenBtn
            }
        });
