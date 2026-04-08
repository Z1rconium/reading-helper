// 工具函数
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
    }
    return hash;
}

export function encodeStructuredData(data) {
    return btoa(encodeURIComponent(JSON.stringify(data)));
}

export function decodeStructuredData(encoded) {
    try {
        return JSON.parse(decodeURIComponent(atob(encoded)));
    } catch {
        return null;
    }
}
