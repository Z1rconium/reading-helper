# 前端代码分割实现方案

## 当前状态
- `public/js/app.js`: 3674行单体文件
- 所有功能耦合在一起
- 首次加载需要解析全部代码

## 目标
- 按需加载模块
- 减少首屏加载时间 60%+
- 无需构建工具（使用原生 ES 模块）

---

## 📁 新文件结构

```
public/js/
├── main.js              # 入口 (~300行)
├── core/
│   ├── dom.js          # DOM 元素引用
│   ├── state.js        # 全局状态管理
│   └── auth.js         # 认证逻辑
├── modules/
│   ├── file-manager.js # 文件上传/列表/删除
│   ├── chat.js         # 聊天核心功能
│   ├── text-panel.js   # 文本面板交互
│   ├── prompt.js       # 提示词管理
│   ├── mindmap.js      # 思维导图（懒加载）
│   ├── vocab.js        # 词汇标注（懒加载）
│   └── speech.js       # 朗读功能（懒加载）
└── utils/
    ├── api.js          # API 请求封装
    └── helpers.js      # 工具函数
```

---

## 🔧 实现步骤

### 步骤 1: 修改 HTML 入口

**文件**: `public/index.html`

```html
<!-- 修改第 225 行 -->
<script type="module" src="/js/main.js?v=20260408-1"></script>
```

### 步骤 2: 创建核心模块

#### `public/js/core/dom.js`
导出所有 DOM 元素引用（从 app.js 第 1-50 行提取）

#### `public/js/core/state.js`
导出全局状态变量（从 app.js 第 120-180 行提取）

#### `public/js/core/auth.js`
认证逻辑（登录/登出/会话保持）

### 步骤 3: 拆分功能模块

#### `public/js/modules/file-manager.js`
- 文件上传
- 文件列表刷新
- 文件删除
- 右键菜单

#### `public/js/modules/chat.js`
- 消息发送/接收
- SSE 流式响应
- 对话历史管理
- 清除记录

#### `public/js/modules/text-panel.js`
- 文本选择处理
- 快捷操作按钮
- 字体大小调整
- 面板拖动调整

#### `public/js/modules/prompt.js`
- 提示词列表
- 提示词编辑
- 提示词保存

### 步骤 4: 懒加载模块

#### `public/js/modules/mindmap.js`
仅在用户点击"思维导图"时加载

#### `public/js/modules/vocab.js`
仅在用户点击"词汇标注"时加载

#### `public/js/modules/speech.js`
仅在用户点击"朗读"时加载

### 步骤 5: 工具函数

#### `public/js/utils/api.js`
```javascript
export async function fetchAPI(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'X-CSRF-Token': getCsrfToken(),
      ...options.headers
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

export function getCsrfToken() {
  return document.cookie.split('; ')
    .find(row => row.startsWith('csrf_token='))
    ?.split('=')[1] || '';
}
```

#### `public/js/utils/helpers.js`
```javascript
export function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
  }
  return hash;
}
```

---

## 🚀 主入口示例

**`public/js/main.js`**

```javascript
import * as dom from './core/dom.js';
import * as state from './core/state.js';
import { initAuth } from './core/auth.js';
import { initFileManager } from './modules/file-manager.js';
import { initChat } from './modules/chat.js';
import { initTextPanel } from './modules/text-panel.js';

// 初始化认证
await initAuth();

// 初始化核心模块
initFileManager();
initChat();
initTextPanel();

// 懒加载：思维导图
dom.moreFuncsSelect.addEventListener('change', async (e) => {
  if (e.target.value === 'mindmap') {
    const { openMindmap } = await import('./modules/mindmap.js');
    openMindmap();
  }
});

// 懒加载：词汇标注
dom.moreFuncsSelect.addEventListener('change', async (e) => {
  if (e.target.value === 'annotate-vocab') {
    const { annotateVocab } = await import('./modules/vocab.js');
    annotateVocab();
  }
});

// 懒加载：朗读
dom.readAloudBtn.addEventListener('click', async () => {
  const { readAloud } = await import('./modules/speech.js');
  readAloud();
});
```

---

## 📊 预期效果

| 指标 | 当前 | 优化后 | 提升 |
|------|------|--------|------|
| 首屏 JS 大小 | ~150KB | ~40KB | 73% ↓ |
| 首次解析时间 | ~200ms | ~60ms | 70% ↓ |
| 思维导图加载 | 立即 | 按需 | 节省 ~30KB |
| 词汇标注加载 | 立即 | 按需 | 节省 ~20KB |

---

## ⚠️ 注意事项

1. **浏览器兼容性**: ES 模块需要现代浏览器（Chrome 61+, Firefox 60+, Safari 11+）
2. **MIME 类型**: 确保服务器返回 `.js` 文件的 `Content-Type: application/javascript`
3. **CORS**: 如果使用 CDN，需要配置 CORS 头
4. **缓存策略**: 使用版本号查询参数（如 `?v=20260408-1`）

---

## 🔄 迁移策略

### 阶段 1: 准备（1小时）
- 创建新目录结构
- 提取 DOM 引用到 `core/dom.js`
- 提取全局状态到 `core/state.js`

### 阶段 2: 核心拆分（2小时）
- 拆分认证模块
- 拆分文件管理模块
- 拆分聊天模块

### 阶段 3: 懒加载（1小时）
- 思维导图改为动态导入
- 词汇标注改为动态导入
- 朗读功能改为动态导入

### 阶段 4: 测试（1小时）
- 测试所有功能
- 检查网络请求
- 验证性能提升

**总计**: ~5小时

---

## 🎯 下一步

需要我开始实施吗？我会：
1. 创建新的目录结构
2. 逐步拆分 `app.js`
3. 保持功能完全一致
4. 每个模块独立测试
