const crypto = require('crypto');

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function setCsrfCookie(res, token) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: 'strict',
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

function csrfProtection(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const cookieToken = getCsrfTokenFromCookie(req);
  const headerToken = getCsrfTokenFromHeader(req);

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ error: 'CSRF token 缺失' });
  }

  if (cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF token 验证失败' });
  }

  next();
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
  CSRF_COOKIE_NAME
};
