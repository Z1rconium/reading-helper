// 主入口文件 - 仅作为懒加载入口，不干预原有 app.js 逻辑
import * as dom from './core/dom.js';

// 懒加载：思维导图
let mindmapModule = null;
dom.moreFuncsSelect.addEventListener('change', async (e) => {
    if (e.target.value === 'mindmap') {
        if (!mindmapModule) {
            console.log('🔄 懒加载：思维导图模块');
            mindmapModule = await import('./modules/mindmap.js');
        }
    }
});

// 懒加载：词汇标注
let vocabModule = null;
dom.moreFuncsSelect.addEventListener('change', async (e) => {
    if (e.target.value === 'annotate-vocab') {
        if (!vocabModule) {
            console.log('🔄 懒加载：词汇标注模块');
            vocabModule = await import('./modules/vocab.js');
        }
    }
});

// 懒加载：朗读功能
let speechModule = null;
dom.readAloudBtn.addEventListener('click', async () => {
    if (!speechModule) {
        console.log('🔄 懒加载：朗读模块');
        speechModule = await import('./modules/speech.js');
    }
}, { once: true });

console.log('✅ 模块化入口已加载');
