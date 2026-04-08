// API 请求封装
export function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : '';
}

export async function fetchAPI(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            'X-CSRF-Token': getCsrfToken(),
            ...options.headers
        }
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
}

export async function fetchJSON(url, options = {}) {
    const response = await fetchAPI(url, options);
    return response.json();
}
