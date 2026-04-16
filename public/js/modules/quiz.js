let appRef = null;

function setup(app) {
  appRef = app;
  appRef.registerOperationRenderer('mcqs', (markdown, context) => renderQuiz(markdown, context, 'mcq'));
  appRef.registerOperationRenderer('tf', (markdown, context) => renderQuiz(markdown, context, 'tf'));
  appRef.registerOperationRenderer('questions', renderQuestionList);
  appRef.registerOperationRenderer('structure', renderStructureTree);
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

function collectBalancedJsonCandidates(markdown) {
  const input = String(markdown || '');
  const candidates = [];
  const seen = new Set();

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char !== '{' && char !== '[') {
      continue;
    }

    const candidate = findBalancedJsonCandidate(input, i);
    if (!candidate || seen.has(candidate)) {
      continue;
    }

    try {
      const parsed = JSON.parse(candidate);
      candidates.push({ json: candidate, data: parsed });
      seen.add(candidate);
    } catch (error) {
      // Keep scanning for another candidate.
    }
  }

  return candidates;
}

function extractBalancedJsonPayload(markdown) {
  const candidates = collectBalancedJsonCandidates(markdown);

  for (const item of candidates) {
    if (item.data && item.data.questions && Array.isArray(item.data.questions)) {
      return item.json;
    }
  }

  for (const item of candidates) {
    const syntaxTree = pickFirstDeepValue(item.data, ['syntax_tree', 'syntaxTree']);
    if (syntaxTree && typeof syntaxTree === 'object') {
      return item.json;
    }
  }

  return candidates[0]?.json || '';
}

function extractJsonPayload(markdown) {
  const fenced = extractFencedBlock(markdown, 'json');
  if (fenced) {
    return fenced;
  }

  const trimmed = String(markdown || '').trim();
  const balanced = extractBalancedJsonPayload(trimmed);
  if (balanced) {
    return balanced;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }
  return '';
}

function parseJsonWithRecovery(payload) {
  const input = String(payload || '').trim();
  if (!input) return null;

  const attempts = [input];
  const noTrailingCommas = input.replace(/,\s*([}\]])/g, '$1');
  if (noTrailingCommas !== input) {
    attempts.push(noTrailingCommas);
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Try the next fallback.
    }
  }

  return null;
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

function decodeLooseJsonValue(token) {
  const raw = String(token || '').trim();
  if (!raw) return '';

  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return raw.replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
    }
  }

  return raw.replace(/[,\]\}]+$/g, '').trim();
}

function extractLooseFieldValue(text, fieldKeys) {
  const source = String(text || '');
  for (const key of fieldKeys) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*("([^"\\\\]|\\\\.)*"|[^,\\n\\r\\]}]+)`, 'i');
    const match = source.match(pattern);
    if (!match) continue;
    const value = decodeLooseJsonValue(match[1]);
    if (value) return String(value).trim();
  }
  return '';
}

function extractLooseOptions(chunk) {
  const source = String(chunk || '');
  const blockMatch = source.match(/"options"\s*:\s*\[([\s\S]*?)\]/i);
  if (!blockMatch) return [];

  const options = [];
  const optionRegex = /"option"\s*:\s*("([^"\\]|\\.)*"|[^,\]\}\n\r]+)[\s\S]*?"content"\s*:\s*("([^"\\]|\\.)*"|[^,\]\}\n\r]+)/gi;
  let optionMatch;
  while ((optionMatch = optionRegex.exec(blockMatch[1])) !== null) {
    const option = decodeLooseJsonValue(optionMatch[1]);
    const content = decodeLooseJsonValue(optionMatch[3]);
    if (!option || !content) continue;
    options.push({
      option: String(option).trim(),
      content: String(content).trim()
    });
  }

  return options;
}

function extractLooseQuestionItems(text) {
  const source = String(text || '');
  if (!source) return [];

  const idRegex = /"id"\s*:\s*("([^"\\]|\\.)*"|\d+)/gi;
  const anchors = [];
  let idMatch;
  while ((idMatch = idRegex.exec(source)) !== null) {
    anchors.push({
      index: idMatch.index,
      id: decodeLooseJsonValue(idMatch[1])
    });
  }

  if (!anchors.length) {
    const questionRegex = /"question"\s*:/gi;
    let questionMatch;
    let autoIndex = 1;
    while ((questionMatch = questionRegex.exec(source)) !== null) {
      anchors.push({
        index: questionMatch.index,
        id: String(autoIndex)
      });
      autoIndex += 1;
    }
    if (!anchors.length) {
      return [];
    }
  }

  const items = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const start = anchors[i].index;
    const end = i + 1 < anchors.length ? anchors[i + 1].index : source.length;
    const chunk = source.slice(start, end);

    const question = extractLooseFieldValue(chunk, ['question', 'prompt', 'stem', 'statement', 'sentence', 'text', 'content']);
    if (!question) continue;

    const answer = extractLooseFieldValue(chunk, ['answer', 'correct_answer', 'correctAnswer', 'reference_answer', 'referenceAnswer']);
    const options = extractLooseOptions(chunk);
    items.push({
      id: String(anchors[i].id || items.length + 1),
      question,
      options,
      answer
    });
  }

  return items;
}

function parseJsonContent(markdown) {
  const payload = extractJsonPayload(markdown);
  if (!payload) {
    const recoveredQuestions = extractLooseQuestionItems(markdown);
    if (recoveredQuestions.length) {
      return {
        payload: '',
        data: { questions: recoveredQuestions },
        recovered: true
      };
    }
    return null;
  }

  const data = parseJsonWithRecovery(payload);
  if (data) {
    return { payload, data };
  }

  const balancedFromMarkdown = extractBalancedJsonPayload(String(markdown || ''));
  if (balancedFromMarkdown && balancedFromMarkdown !== payload) {
    const balancedData = parseJsonWithRecovery(balancedFromMarkdown);
    if (balancedData) {
      return { payload: balancedFromMarkdown, data: balancedData };
    }
  }

  const recoveredQuestions = extractLooseQuestionItems(payload || markdown);
  if (recoveredQuestions.length) {
    return {
      payload,
      data: { questions: recoveredQuestions },
      recovered: true
    };
  }

  return null;
}

function renderQuestionLoadingHtml() {
  return '<p class="rh-empty">正在生成题目中......</p>';
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

    const nestedCandidate = pickFirstValue(current, ['data', 'payload', 'response', 'result', 'output', 'content']);
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

function normalizeQuestionText(question) {
  return normalizeScalarValue(
    pickFirstDeepValue(question, ['question', 'prompt', 'stem', 'statement', 'sentence', 'text', 'content'])
  );
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
      if (!item || typeof item !== 'object') return false;
      return Boolean(normalizeQuestionText(item));
    });
    if (questionLikeItems.length) {
      return questionLikeItems;
    }
  }

  return Object.values(normalized).filter((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false;
    }
    return Boolean(
      normalizeScalarValue(
        pickFirstValue(item, ['question', 'prompt', 'stem', 'statement', 'sentence', 'text', 'content'])
      )
    );
  });
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

  return {
    option: normalizeScalarValue(pickFirstValue(option, ['option', 'label', 'key', 'id'])) || getOptionLetter(index),
    content: normalizeScalarValue(
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
    )
  };
}

function normalizeOptions(question) {
  const rawOptions = pickFirstValue(question, ['options', 'choices', 'answers', 'candidates', 'selections', 'alternatives']);

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

function renderStructuredFallback(markdown, tip) {
  const content = String(markdown || '').trim();
  const body = content ? `<pre><code>${appRef.escapeHtml(content)}</code></pre>` : '<p>请耐心等待...</p>';
  const tipHtml = tip ? `<p class="tip">${tip}</p>` : '';
  return `${body}${tipHtml}`;
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
    const qText = appRef.escapeHtml(question?.question ?? '');
    const qId = appRef.escapeHtml(String(question?.id ?? index + 1));
    const correct = appRef.escapeHtml(String(question?.answer ?? ''));
    const optionHtml = (Array.isArray(question?.options) ? question.options : []).map((option) => {
      const rawOption = option ?? '';
      const optionKey = appRef.escapeHtml(String(option?.option ?? option?.label ?? rawOption ?? ''));
      const optionText = appRef.escapeHtml(String(option?.content ?? option?.text ?? (typeof rawOption === 'string' ? rawOption : '')));
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
    <div class="rh-quiz-header">全文选择/判断题 · ${appRef.escapeHtml(currentFileName || '')}</div>
    ${cards}
  </div>`;
}

function buildQuestionListHtml(data, currentFileName, isFinal = false) {
  const rawQuestions = extractQuestionItems(data);
  const questions = rawQuestions.map((question, index) => {
    const normalizedQuestion = question && typeof question === 'object'
      ? question
      : { question: normalizeScalarValue(question) };
    return {
      id: normalizeQuestionId(normalizedQuestion, index),
      question: normalizeQuestionText(normalizedQuestion),
      answer: normalizeQuestionAnswer(normalizedQuestion)
    };
  }).filter((question) => question.question);

  if (!questions.length) {
    if (!isFinal) {
      return renderQuestionLoadingHtml();
    }
    return '<p class="rh-empty">没有找到问答题数据。</p>';
  }

  const cards = questions.map((question, index) => {
    const qText = appRef.escapeHtml(question?.question ?? '');
    const qId = appRef.escapeHtml(String(question?.id ?? index + 1));
    const answer = appRef.escapeHtml(String(question?.answer ?? ''));
    return `<div class="rh-question-card">
      <div class="rh-question-title">问题 ${qId}</div>
      <div class="rh-question-text">${qText}</div>
      <button type="button" class="rh-toggle-answer">Show Answer</button>
      <div class="rh-answer">${answer}</div>
    </div>`;
  }).join('');

  return `<div class="rh-question-list">
    <div class="rh-quiz-header">全文问答 · ${appRef.escapeHtml(currentFileName || '')}</div>
    ${cards}
  </div>`;
}

function createTree(node, parentElement, level = 0) {
  const nodeElement = document.createElement('div');
  nodeElement.className = `node ${node.type}`;
  nodeElement.textContent = node.label;
  nodeElement.setAttribute('data-type', mapNodeType(node.type));

  if (node.children && node.children.length > 0) {
    nodeElement.classList.add('is-collapsible');
  }

  parentElement.appendChild(nodeElement);

  if (node.children && node.children.length > 0) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'children';
    parentElement.appendChild(childrenContainer);

    if (level > 0) {
      childrenContainer.classList.add('is-collapsed');
      nodeElement.classList.add('is-collapsed');
    }

    node.children.forEach((child) => {
      createTree(child, childrenContainer, level + 1);
    });
  }
}

function mapNodeType(tag) {
  const tags = {
    sentence: '句子',
    subject: '主语',
    'subject-clause': '主语从句',
    predicate: '谓语',
    object: '宾语',
    'direct-object': '直接宾语',
    'indirect-object': '间接宾语',
    'object-clause': '宾语从句',
    'subject-complement': '主语补语',
    'object-complement': '宾语补语',
    'predicative-clause': '补语从句',
    attributive: '定语',
    'attributive-clause': '定语从句',
    appositive: '同位语',
    'appositive-clause': '同位语从句',
    adverbial: '状语',
    'adverbial-clause': '状语从句'
  };
  return tag in tags ? tags[tag] : tag;
}

function renderQuiz(markdown, context = {}, quizType = 'mcq') {
  const parsed = parseJsonContent(markdown);
  if (!parsed) {
    if (!context.isFinal) {
      return renderQuestionLoadingHtml();
    }
    return renderStructuredFallback(markdown, 'JSON 输出不完整或格式错误，无法渲染题目。');
  }
  return buildQuizHtml(parsed.data, context.currentFileName, quizType, context.isFinal);
}

function renderQuestionList(markdown, context = {}) {
  const parsed = parseJsonContent(markdown);
  if (!parsed) {
    if (!context.isFinal) {
      return renderQuestionLoadingHtml();
    }
    return renderStructuredFallback(markdown, 'JSON 输出不完整或格式错误，无法渲染题目。');
  }
  return buildQuestionListHtml(parsed.data, context.currentFileName, context.isFinal);
}

function findSyntaxTreeCandidate(markdown) {
  const syntaxTreeKeys = ['syntax_tree', 'syntaxTree', 'tree'];
  const parsed = parseJsonContent(markdown);
  const fromPrimaryPayload = pickFirstDeepValue(parsed?.data, syntaxTreeKeys);
  if (fromPrimaryPayload && typeof fromPrimaryPayload === 'object') {
    return fromPrimaryPayload;
  }

  const balancedCandidates = collectBalancedJsonCandidates(markdown);
  for (const candidate of balancedCandidates) {
    const fromCandidate = pickFirstDeepValue(candidate.data, syntaxTreeKeys);
    if (fromCandidate && typeof fromCandidate === 'object') {
      return fromCandidate;
    }
  }

  return null;
}

function renderStructureTree(markdown, context = {}) {
  const syntaxTree = findSyntaxTreeCandidate(markdown);
  if (syntaxTree && typeof syntaxTree === 'object') {
    const div = document.createElement('div');
    div.id = 'syntaxTree';
    div.className = 'tree';
    createTree(syntaxTree, div);
    return div.outerHTML;
  }
  if (!context.isFinal) {
    return renderQuestionLoadingHtml();
  }
  return renderStructuredFallback(markdown, 'JSON 输出格式错误，无法渲染语法树。');
}

export {
  setup
};
