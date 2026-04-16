let appRef = null;
let initialized = false;
let markmapLoadPromise = null;
let markmapTransformer = null;
let currentMindmapInstance = null;
let currentMindmapData = null;
const mindmapCache = new Map();

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
  if (!label || !textStyle) return;
  label.style.setProperty('color', textStyle.color, 'important');
  label.style.setProperty('font-family', textStyle.fontFamily, 'important');
  label.style.setProperty('font-size', textStyle.fontSize, 'important');
  label.style.setProperty('font-weight', textStyle.fontWeight, 'important');
  label.style.setProperty('letter-spacing', textStyle.letterSpacing, 'important');
}

function applyMindmapVisualStyles() {
  const nodes = appRef.dom.mindmapStage.querySelectorAll('g.markmap-node');
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
  const root = precomputedRoot || markmapTransformer.transform(content).root;

  const { mindmapStage, mindmapToolbar } = appRef.dom;
  mindmapStage.innerHTML = '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const width = Math.max(mindmapStage.clientWidth - 24, 600);
  const height = Math.max(mindmapStage.clientHeight - 24, 400);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.width = '100%';
  svg.style.height = '100%';
  mindmapStage.appendChild(svg);

  currentMindmapInstance = stabilizeMindmapToggleZoom(
    Markmap.create(svg, getMindmapRenderOptions(), root),
    svg
  );
  currentMindmapData = content;
  scheduleMindmapVisualStyles();
  mindmapToolbar.style.display = 'flex';
}

function closeMindmapModal() {
  const { mindmapModal, mindmapStage, mindmapStatus, mindmapToolbar } = appRef.dom;
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
