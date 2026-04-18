const app = window.readingHelperApp;

if (!app) {
  throw new Error('readingHelperApp 未初始化');
}

const MODULE_VERSION = '20260418-3';

app.registerFeatureLoader('articleRenderer', () => import(`./modules/article-renderer.js?v=${MODULE_VERSION}`));
app.registerFeatureLoader('speech', () => import(`./modules/speech.js?v=${MODULE_VERSION}`));
app.registerFeatureLoader('mindmap', () => import(`./modules/mindmap.js?v=${MODULE_VERSION}`));
app.registerFeatureLoader('quiz', () => import(`./modules/quiz.js?v=${MODULE_VERSION}`));
app.registerFeatureLoader('promptManager', () => import(`./modules/prompt-manager.js?v=${MODULE_VERSION}`));
app.registerFeatureLoader('adminPanel', () => import(`./modules/admin-panel.js?v=${MODULE_VERSION}`));

function primeFeatureOnIntent(element, featureName) {
  if (!element) return;

  const preload = () => {
    void app.loadFeatureModule(featureName);
  };

  element.addEventListener('pointerenter', preload, { once: true });
  element.addEventListener('focus', preload, { once: true });
}

primeFeatureOnIntent(app.dom.readAloudBtn, 'speech');
primeFeatureOnIntent(app.dom.editPromptsBtn, 'promptManager');
primeFeatureOnIntent(app.dom.fileList, 'articleRenderer');

console.log('✅ 主入口已注册按需模块');
