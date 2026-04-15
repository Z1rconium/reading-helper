const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function setCsrfCookie(res, token) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function getCsrfTokenFromCookie(req) {
  return req.cookies?.[CSRF_COOKIE_NAME] || '';
}

function getCsrfTokenFromHeader(req) {
  return req.get(CSRF_HEADER_NAME) || '';
}

function getRequestOrigin(req) {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost ? forwardedHost.split(',')[0].trim() : req.get('host');
  if (!protocol || !host) {
    return '';
  }
  return `${protocol}://${host}`;
}

function parseOriginLikeHeader(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function isSameOriginRequest(req) {
  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin) {
    return false;
  }

  const secFetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase();
  if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite)) {
    return false;
  }

  const origin = parseOriginLikeHeader(req.get('origin'));
  if (origin) {
    return origin === requestOrigin;
  }

  const refererOrigin = parseOriginLikeHeader(req.get('referer'));
  if (refererOrigin) {
    return refererOrigin === requestOrigin;
  }

  return secFetchSite === 'same-origin' || secFetchSite === 'same-site' || secFetchSite === 'none';
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const cookieToken = getCsrfTokenFromCookie(req);
  const headerToken = getCsrfTokenFromHeader(req);

  if (cookieToken && headerToken && cookieToken === headerToken) {
    return next();
  }

  if (isSameOriginRequest(req)) {
    return next();
  }

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token 缺失' });
  }

  return res.status(403).json({ error: 'CSRF token 验证失败' });
}

function ensureCsrfToken(req, res, next) {
  let token = getCsrfTokenFromCookie(req);

  if (!token) {
    token = generateCsrfToken();
    setCsrfCookie(res, token);
  }

  next();
}

module.exports = {
  csrfProtection,
  ensureCsrfToken,
  generateCsrfToken,
  setCsrfCookie,
  CSRF_COOKIE_NAME,
  getRequestOrigin,
  isSameOriginRequest
};
