let appRef = null;
let isVocabAnnotationEnabled = false;
let cetWordLevelMap = null;
let cetWordListPromise = null;

function setup(app) {
  appRef = app;
}

function buildArticleParagraphHtml(line, levelMap = null) {
  const normalizedLine = String(line || '').trim().split(/\s+/).join(' ');
  if (!normalizedLine) return '';

  if (!(levelMap instanceof Map) || levelMap.size === 0) {
    return `<p>${appRef.escapeHtml(normalizedLine)}</p>`;
  }

  let html = '';
  let lastIndex = 0;
  const wordPattern = /[A-Za-z]+/g;
  let match = wordPattern.exec(normalizedLine);

  while (match) {
    const [word] = match;
    const offset = match.index;
    html += appRef.escapeHtml(normalizedLine.slice(lastIndex, offset));

    const level = levelMap.get(word.toLowerCase());
    if (level === 4 || level === 6) {
      html += `<span class="cet-word cet-${level}">${appRef.escapeHtml(word)}</span>`;
    } else {
      html += appRef.escapeHtml(word);
    }

    lastIndex = offset + word.length;
    match = wordPattern.exec(normalizedLine);
  }

  html += appRef.escapeHtml(normalizedLine.slice(lastIndex));
  return `<p>${html}</p>`;
}

function renderArticleContent(content) {
  const levelMap = isVocabAnnotationEnabled ? cetWordLevelMap : null;
  appRef.dom.textContent.innerHTML = String(content || '')
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
        await appRef.checkAuthStatus();
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

function resetState() {
  isVocabAnnotationEnabled = false;
}

async function toggleVocabAnnotation() {
  const currentFileContent = appRef.getCurrentFileContent();
  if (!currentFileContent.trim()) {
    appRef.addSystemMessage('请先选择一篇文章。');
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

export {
  setup,
  renderArticleContent,
  toggleVocabAnnotation,
  resetState
};
