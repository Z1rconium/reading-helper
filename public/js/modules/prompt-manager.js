let appRef = null;
let activePromptFileName = '';
let promptFileList = [];
let initialized = false;

function setup(app) {
  appRef = app;
  if (initialized) return;

  const {
    promptManagerModal,
    promptListPanel,
    promptListView,
    promptEditorPanel,
    promptEditorName,
    promptEditorText,
    promptEditorBackBtn,
    promptEditorSaveBtn,
    closePromptManagerModalBtn
  } = appRef.dom;

  closePromptManagerModalBtn.addEventListener('click', closePromptManager);
  promptManagerModal.addEventListener('click', (event) => {
    if (event.target === promptManagerModal) {
      closePromptManager();
    }
  });
  promptEditorBackBtn.addEventListener('click', showPromptListPanel);
  promptEditorSaveBtn.addEventListener('click', async () => {
    if (!activePromptFileName) return;
    const nextContent = promptEditorText.value;
    try {
      await appRef.savePromptFileContent(activePromptFileName, nextContent);
      appRef.addSystemMessage(`已保存提示词: ${activePromptFileName}`);
    } catch (error) {
      appRef.addSystemMessage(`保存提示词失败: ${error.message}`);
    }
  });

  promptListPanel.style.display = 'block';
  promptEditorPanel.style.display = 'none';
  initialized = true;
}

function showPromptListPanel() {
  const { promptListPanel, promptEditorPanel } = appRef.dom;
  promptListPanel.style.display = 'block';
  promptEditorPanel.style.display = 'none';
  activePromptFileName = '';
}

function showPromptEditorPanel(fileName, content) {
  const {
    promptListPanel,
    promptEditorPanel,
    promptEditorName,
    promptEditorText
  } = appRef.dom;
  activePromptFileName = fileName;
  promptEditorName.textContent = fileName;
  promptEditorText.value = content;
  promptListPanel.style.display = 'none';
  promptEditorPanel.style.display = 'block';
  promptEditorText.focus();
}

function closePromptManager() {
  appRef.dom.promptManagerModal.style.display = 'none';
  showPromptListPanel();
}

function renderPromptList() {
  const { promptListView } = appRef.dom;
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
        const content = await appRef.fetchPromptFileContent(fileName, true);
        showPromptEditorPanel(fileName, content);
      } catch (error) {
        appRef.addSystemMessage(`读取提示词失败: ${error.message}`);
      }
    });
    li.appendChild(button);
    promptListView.appendChild(li);
  });
}

async function openPromptManager() {
  try {
    promptFileList = await appRef.fetchPromptFileList();
    renderPromptList();
    showPromptListPanel();
    appRef.dom.promptManagerModal.style.display = 'flex';
  } catch (error) {
    appRef.addSystemMessage(`读取提示词列表失败: ${error.message}`);
  }
}

function resetState() {
  promptFileList = [];
  activePromptFileName = '';
  if (!initialized) return;
  closePromptManager();
}

export {
  setup,
  openPromptManager,
  resetState
};
