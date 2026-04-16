let appRef = null;
let initialized = false;
let markmapLoadPromise = null;
let markmapTransformer = null;
let currentMindmapInstance = null;
let currentMindmapData = null;
let currentMindmapObserver = null;
let pendingMindmapAnnotationFrame = 0;
const mindmapCache = new Map();
const pendingMindmapAnnotationRoots = new Set();

const MINDMAP_BRANCH_COLORS = ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E86452', '#6DC8EC', '#945FB9', '#FF9845'];
const MINDMAP_BASE_TEXT_COLOR = '#3A2D22';
const MINDMAP_ROOT_FILL = '#FFF6E8';
const MINDMAP_FONT_FAMILY = '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

function debounce(func, wait) {
  let timeout;
  return function debounced(...args) {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => func(...args), wait);
  };
}

function setup(app) {
  appRef = app;
  appRef.registerOperationRenderer('mindmap', renderMindmapMessageHtml);

  if (initialized) return;
  initialized = true;

  const {
    closeMindmapModalBtn,
    mindmapModal,
    mindmapStage,
    mindmapZoomInBtn,
    mindmapZoomOutBtn,
    mindmapFullscreenBtn
  } = appRef.dom;

  closeMindmapModalBtn.addEventListener('click', closeMindmapModal);
  mindmapModal.addEventListener('click', (event) => {
    if (event.target === mindmapModal) {
      closeMindmapModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mindmapModal.style.display === 'flex') {
      closeMindmapModal();
    }
  });
  mindmapZoomInBtn?.addEventListener('click', () => {
    if (currentMindmapInstance?.rescale) {
      const currentScale = getMindmapZoomTransform()?.k || 1;
      currentMindmapInstance.rescale(currentScale * 1.2);
    }
  });
  mindmapZoomOutBtn?.addEventListener('click', () => {
    if (currentMindmapInstance?.rescale) {
      const currentScale = getMindmapZoomTransform()?.k || 1;
      currentMindmapInstance.rescale(currentScale / 1.2);
    }
  });
  mindmapFullscreenBtn?.addEventListener('click', () => {
    toggleFullscreen(mindmapStage);
  });

  const handleMindmapResize = debounce(() => {
    if (mindmapModal.style.display !== 'flex' || !currentMindmapInstance) {
      return;
    }

    const svg = mindmapStage.querySelector('svg');
    if (!svg) return;

    const previousTransform = getMindmapZoomTransform(svg);
    const width = Math.max(mindmapStage.clientWidth - 24, 600);
    const height = Math.max(mindmapStage.clientHeight - 24, 400);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    applyMindmapZoomTransform(currentMindmapInstance, svg, previousTransform);
  }, 300);

  window.addEventListener('resize', handleMindmapResize);
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === mindmapStage) {
      mindmapStage.classList.add('fullscreen');
    } else {
      mindmapStage.classList.remove('fullscreen');
    }
  });
}

function extractFencedBlock(markdown, language) {
  const pattern = new RegExp(`\`\`\`${language}\\s*([\\s\\S]*?)\`\`\``, 'i');
  const match = String(markdown || '').match(pattern);
  return match ? match[1].trim() : '';
}

function getMindmapMarkdown(markdown) {
  return extractFencedBlock(markdown, 'markdown') || String(markdown || '').trim();
}

function renderMindmapMessageHtml(markdown) {
  const data = getMindmapMarkdown(markdown);
  if (!data) {
    return '<p class="rh-empty">正在等待思维导图内容...</p>';
  }

  const lines = data.split('\n').map((line) => line.trim()).filter(Boolean);
  const preview = lines.slice(0, 3).join(' / ');
  const headingCount = lines.filter((line) => line.startsWith('#')).length;
  const listCount = lines.filter((line) => /^\s*[-*+]/.test(line)).length;
  const totalNodes = headingCount + listCount;
  const stats = totalNodes > 0 ? `${totalNodes} 个节点` : '';
  const summary = preview || '思维导图内容已准备好，点击按钮在站内查看。';

  return `<div class="rh-mindmap-card" data-markdown="${appRef.escapeHtml(appRef.encodeStructuredData(data))}">
    <div class="rh-mindmap-copy">
      <div class="rh-mindmap-title">思维导图已生成</div>
      <div class="rh-mindmap-summary">${appRef.escapeHtml(summary)}</div>
      ${stats ? `<div class="mindmap-summary-stats">${stats}</div>` : ''}
    </div>
    <button type="button" class="rh-view-mindmap">查看</button>
  </div>`;
}

async function ensureMarkmapReady() {
  if (markmapLoadPromise) return markmapLoadPromise;

  markmapLoadPromise = (async () => {
    if (window.d3 && window.markmap?.Markmap && window.markmap?.Transformer) {
      if (!markmapTransformer) {
        markmapTransformer = new window.markmap.Transformer();
      }
      return window.markmap;
    }

    const loadScript = (src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    await loadScript('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/markmap-lib@0.18.12/dist/browser/index.iife.js');
    await loadScript('https://cdn.jsdelivr.net/npm/markmap-view@0.18.12/dist/browser/index.js');

    if (!markmapTransformer) {
      markmapTransformer = new window.markmap.Transformer();
    }
    return window.markmap;
  })();

  return markmapLoadPromise;
}

function toggleFullscreen(element) {
  if (!document.fullscreenElement) {
    element.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

function getMindmapZoomTransform(svgElement = null) {
  const svg = svgElement || appRef.dom.mindmapStage?.querySelector('svg');
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
    .rh-mindmap-graph .rh-mindmap-node {
      --rh-mindmap-branch-color: ${MINDMAP_BRANCH_COLORS[0]};
      --rh-mindmap-circle-fill: #FFFFFF;
      --rh-mindmap-circle-stroke-width: 1.75;
      --rh-mindmap-text-color: ${MINDMAP_BASE_TEXT_COLOR};
      --rh-mindmap-font-size: 14px;
      --rh-mindmap-font-weight: 520;
      --rh-mindmap-letter-spacing: 0;
    }
    .rh-mindmap-graph .rh-mindmap-node line {
      stroke: var(--rh-mindmap-branch-color);
    }
    .rh-mindmap-graph .rh-mindmap-node circle {
      stroke: var(--rh-mindmap-branch-color);
      stroke-width: var(--rh-mindmap-circle-stroke-width);
      fill: var(--rh-mindmap-circle-fill);
    }
    .rh-mindmap-graph .rh-mindmap-node .markmap-foreign,
    .rh-mindmap-graph .rh-mindmap-node .markmap-foreign > div,
    .rh-mindmap-graph .rh-mindmap-node .markmap-foreign > div > div {
      color: var(--rh-mindmap-text-color) !important;
      font-family: ${MINDMAP_FONT_FAMILY} !important;
      font-size: var(--rh-mindmap-font-size) !important;
      font-weight: var(--rh-mindmap-font-weight) !important;
      letter-spacing: var(--rh-mindmap-letter-spacing) !important;
    }
    .rh-mindmap-graph .rh-mindmap-node .markmap-foreign *,
    .rh-mindmap-graph .rh-mindmap-node .markmap-foreign > div *,
    .rh-mindmap-graph .rh-mindmap-node .markmap-foreign > div > div * {
      color: inherit !important;
      font-family: inherit !important;
      font-size: inherit !important;
      font-weight: inherit !important;
      letter-spacing: inherit !important;
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

function applyMindmapNodeTheme(nodeElement) {
  if (!(nodeElement instanceof Element) || !nodeElement.matches('g.markmap-node')) {
    return;
  }

  const nodeData = nodeElement.__data__ || { dataset: nodeElement.dataset };
  const depth = getMindmapNodeDepth(nodeData);
  const branchColor = getMindmapBranchColor(nodeData);
  const themeKey = `${depth}:${branchColor}`;
  const textStyle = getMindmapTextStyle(depth, branchColor);

  if (nodeElement.dataset.rhMindmapTheme === themeKey) {
    return;
  }

  nodeElement.classList.add('rh-mindmap-node');
  nodeElement.dataset.rhMindmapTheme = themeKey;
  nodeElement.style.setProperty('--rh-mindmap-branch-color', branchColor);
  nodeElement.style.setProperty('--rh-mindmap-circle-fill', depth <= 1 ? MINDMAP_ROOT_FILL : '#FFFFFF');
  nodeElement.style.setProperty('--rh-mindmap-circle-stroke-width', depth <= 1 ? '2.25' : '1.75');
  nodeElement.style.setProperty('--rh-mindmap-text-color', textStyle.color);
  nodeElement.style.setProperty('--rh-mindmap-font-size', textStyle.fontSize);
  nodeElement.style.setProperty('--rh-mindmap-font-weight', textStyle.fontWeight);
  nodeElement.style.setProperty('--rh-mindmap-letter-spacing', textStyle.letterSpacing);
}

function annotateMindmapNodes(rootElement) {
  if (!(rootElement instanceof Element)) {
    return;
  }

  if (rootElement.matches('g.markmap-node')) {
    applyMindmapNodeTheme(rootElement);
  }

  rootElement.querySelectorAll('g.markmap-node').forEach((nodeElement) => {
    applyMindmapNodeTheme(nodeElement);
  });
}

function flushPendingMindmapAnnotations() {
  pendingMindmapAnnotationFrame = 0;
  const roots = Array.from(pendingMindmapAnnotationRoots);
  pendingMindmapAnnotationRoots.clear();
  roots.forEach((rootElement) => annotateMindmapNodes(rootElement));
}

function queueMindmapAnnotation(rootElement) {
  if (!(rootElement instanceof Element)) {
    return;
  }

  pendingMindmapAnnotationRoots.add(rootElement);
  if (pendingMindmapAnnotationFrame) {
    return;
  }

  pendingMindmapAnnotationFrame = window.requestAnimationFrame(() => {
    flushPendingMindmapAnnotations();
  });
}

function disconnectMindmapObserver() {
  if (currentMindmapObserver) {
    currentMindmapObserver.disconnect();
    currentMindmapObserver = null;
  }

  if (pendingMindmapAnnotationFrame) {
    window.cancelAnimationFrame(pendingMindmapAnnotationFrame);
    pendingMindmapAnnotationFrame = 0;
  }

  pendingMindmapAnnotationRoots.clear();
}

function observeMindmapMutations(svg) {
  disconnectMindmapObserver();
  if (!(svg instanceof Element) || typeof MutationObserver !== 'function') {
    return;
  }

  queueMindmapAnnotation(svg);
  currentMindmapObserver = new MutationObserver((mutations) => {
    mutations.forEach(({ addedNodes }) => {
      addedNodes.forEach((node) => {
        if (node instanceof Element) {
          queueMindmapAnnotation(node);
        }
      });
    });
  });
  currentMindmapObserver.observe(svg, {
    childList: true,
    subtree: true
  });
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
    color: (node) => getMindmapBranchColor(node),
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
    const restoreMindmapZoom = () => {
      if (beforeTransform) {
        applyMindmapZoomTransform(instance, svg, beforeTransform);
      }
    };

    requestAnimationFrame(restoreMindmapZoom);
    window.setTimeout(restoreMindmapZoom, transitionDuration + 24);
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
  const root = precomputedRoot || markmapTransformer.transform(content).root;

  const { mindmapStage, mindmapToolbar } = appRef.dom;
  disconnectMindmapObserver();
  mindmapStage.innerHTML = '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const width = Math.max(mindmapStage.clientWidth - 24, 600);
  const height = Math.max(mindmapStage.clientHeight - 24, 400);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.classList.add('rh-mindmap-graph');
  mindmapStage.appendChild(svg);

  currentMindmapInstance = stabilizeMindmapToggleZoom(
    Markmap.create(svg, getMindmapRenderOptions(), root),
    svg
  );
  currentMindmapData = content;
  observeMindmapMutations(svg);
  mindmapToolbar.style.display = 'flex';
}

function closeMindmapModal() {
  const { mindmapModal, mindmapStage, mindmapStatus, mindmapToolbar } = appRef.dom;
  disconnectMindmapObserver();
  mindmapModal.style.display = 'none';
  mindmapStage.innerHTML = '';
  mindmapStatus.textContent = '';
  mindmapToolbar.style.display = 'none';
  currentMindmapInstance = null;
  currentMindmapData = null;

  if (document.fullscreenElement === mindmapStage) {
    document.exitFullscreen();
  }
}

function openMindmapModal(markdown) {
  const content = getMindmapMarkdown(markdown);
  if (!content) {
    appRef.addSystemMessage('思维导图内容为空，无法查看。');
    return;
  }

  const {
    mindmapModal,
    mindmapModalTitle,
    mindmapStatus,
    mindmapStage,
    mindmapToolbar
  } = appRef.dom;

  mindmapModalTitle.textContent = appRef.getCurrentFileName()
    ? `${appRef.getCurrentFileName()} · 思维导图`
    : '文章思维导图';
  mindmapStatus.textContent = '正在渲染思维导图...';
  mindmapStage.innerHTML = '';
  mindmapToolbar.style.display = 'none';
  mindmapModal.style.display = 'flex';

  const cacheKey = appRef.hashString(content);
  requestAnimationFrame(async () => {
    try {
      if (mindmapCache.has(cacheKey)) {
        await renderMindmap(content, mindmapCache.get(cacheKey).root);
      } else {
        await ensureMarkmapReady();
        const { root } = markmapTransformer.transform(content);
        await renderMindmap(content, root);
        mindmapCache.set(cacheKey, { root });
        if (mindmapCache.size > 10) {
          const firstKey = mindmapCache.keys().next().value;
          mindmapCache.delete(firstKey);
        }
      }
      mindmapStatus.textContent = '';
    } catch (error) {
      mindmapStatus.textContent = `思维导图渲染失败: ${error.message}`;
    }
  });
}

function resetState() {
  closeMindmapModal();
}

export {
  setup,
  openMindmapModal,
  resetState
};
