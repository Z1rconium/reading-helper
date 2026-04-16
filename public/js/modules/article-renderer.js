let appRef = null;
let isVocabAnnotationEnabled = false;
let cetWordLevelMap = null;
let cetWordListPromise = null;
let articleCache = {
  content: '',
  paragraphs: []
};

function setup(app) {
  appRef = app;
}

function normalizeParagraphText(line) {
  return String(line || '').trim().split(/\s+/).join(' ');
}

function tokenizeParagraph(text) {
  const tokens = [];
  const wordPattern = /[A-Za-z]+/g;
  let lastIndex = 0;
  let match = wordPattern.exec(text);

  while (match) {
    const [word] = match;
    const offset = match.index;
    if (offset > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, offset) });
    }

    tokens.push({ type: 'word', value: word, lower: word.toLowerCase() });
    lastIndex = offset + word.length;
    match = wordPattern.exec(text);
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

function parseArticleParagraphs(content) {
  return String(content || '')
    .split(/\r?\n/)
    .map(normalizeParagraphText)
    .filter(Boolean)
    .map((text) => ({
      text,
      tokens: tokenizeParagraph(text),
      plainNode: null,
      annotatedNode: null
    }));
}

function ensureArticleCache(content) {
  const nextContent = String(content || '');
  if (articleCache.content !== nextContent) {
    articleCache = {
      content: nextContent,
      paragraphs: parseArticleParagraphs(nextContent)
    };
  }
  return articleCache;
}

function buildParagraphNode(paragraph, levelMap = null) {
  const node = document.createElement('p');

  if (!(levelMap instanceof Map) || levelMap.size === 0) {
    node.textContent = paragraph.text;
    return node;
  }

  paragraph.tokens.forEach((token) => {
    if (token.type !== 'word') {
      node.appendChild(document.createTextNode(token.value));
      return;
    }

    const level = levelMap.get(token.lower);
    if (level === 4 || level === 6) {
      const wordNode = document.createElement('span');
      wordNode.className = `cet-word cet-${level}`;
      wordNode.textContent = token.value;
      node.appendChild(wordNode);
      return;
    }

    node.appendChild(document.createTextNode(token.value));
  });

  return node;
}

function getParagraphNode(paragraph, annotated) {
  const cacheKey = annotated ? 'annotatedNode' : 'plainNode';
  if (!paragraph[cacheKey]) {
    paragraph[cacheKey] = buildParagraphNode(paragraph, annotated ? cetWordLevelMap : null);
  }
  return paragraph[cacheKey].cloneNode(true);
}

function buildArticleFragment(paragraphs, annotated) {
  const fragment = document.createDocumentFragment();
  paragraphs.forEach((paragraph) => {
    fragment.appendChild(getParagraphNode(paragraph, annotated));
  });
  return fragment;
}

function invalidateAnnotatedParagraphCache() {
  articleCache.paragraphs.forEach((paragraph) => {
    paragraph.annotatedNode = null;
  });
}

function renderArticleContent(content) {
  const { paragraphs } = ensureArticleCache(content);
  const shouldAnnotate = isVocabAnnotationEnabled && cetWordLevelMap instanceof Map && cetWordLevelMap.size > 0;
  appRef.dom.textContent.replaceChildren(buildArticleFragment(paragraphs, shouldAnnotate));
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
      invalidateAnnotatedParagraphCache();
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
  articleCache = {
    content: '',
    paragraphs: []
  };
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
