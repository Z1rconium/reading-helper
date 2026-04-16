const fs = require('fs/promises');
const path = require('path');
const { getUserUploadDir } = require('./user-paths');

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 2 * 1024 * 1024);
const ALLOWED_EXTENSIONS = new Set(['.txt', '.text', '.md']);

function hasAllowedTextExtension(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

function isValidRequestedName(fileName) {
  if (typeof fileName !== 'string') return false;
  if (!fileName || fileName.length > 255) return false;
  if (fileName.includes('/') || fileName.includes('\\')) return false;
  if (fileName === '.' || fileName === '..') return false;
  if (!hasAllowedTextExtension(fileName)) return false;
  // Allow alphanumeric, Chinese characters, spaces, and common punctuation
  // Exclude only path separators and control characters
  return /^[\w\-. ()\[\]{}!@#$%^&+=,;'`~\u4e00-\u9fa5]+$/.test(fileName);
}

function normalizeUploadName(originalName) {
  const base = path.basename(String(originalName || ''));
  const cleaned = base
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    throw new Error('无效文件名');
  }
  if (!hasAllowedTextExtension(cleaned)) {
    throw new Error('仅支持 .txt、.text 或 .md 文件');
  }
  if (!isValidRequestedName(cleaned)) {
    throw new Error('文件名包含非法字符');
  }

  return cleaned;
}

async function ensureUploadDir(userId) {
  const uploadDir = getUserUploadDir(userId);
  await fs.mkdir(uploadDir, { recursive: true });
  return uploadDir;
}

async function createUniqueName(uploadDir, normalizedName) {
  const ext = path.extname(normalizedName);
  const stem = normalizedName.slice(0, -ext.length);
  let candidate = normalizedName;
  let index = 1;

  while (true) {
    try {
      await fs.access(path.join(uploadDir, candidate));
      candidate = `${stem}-${Date.now()}-${index}${ext}`;
      index += 1;
    } catch {
      return candidate;
    }
  }
}

async function saveUploadedText(userId, originalName, content) {
  const uploadDir = await ensureUploadDir(userId);
  const normalizedName = normalizeUploadName(originalName);
  const safeName = await createUniqueName(uploadDir, normalizedName);
  const filePath = path.join(uploadDir, safeName);

  await fs.writeFile(filePath, content, 'utf8');
  const stat = await fs.stat(filePath);

  return {
    name: safeName,
    updatedAt: stat.mtime.toISOString(),
    size: stat.size
  };
}

async function listUploadedTexts(userId) {
  const uploadDir = await ensureUploadDir(userId);
  const entries = await fs.readdir(uploadDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isValidRequestedName(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

async function readUploadedText(userId, fileName) {
  if (!isValidRequestedName(fileName)) {
    const error = new Error('非法文件名');
    error.code = 'INVALID_NAME';
    throw error;
  }

  const uploadDir = await ensureUploadDir(userId);
  const filePath = path.join(uploadDir, fileName);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const notFound = new Error('文件不存在');
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }
    throw error;
  }
}

async function deleteUploadedText(userId, fileName) {
  if (!isValidRequestedName(fileName)) {
    const error = new Error('非法文件名');
    error.code = 'INVALID_NAME';
    throw error;
  }

  const uploadDir = await ensureUploadDir(userId);
  const filePath = path.join(uploadDir, fileName);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const notFound = new Error('文件不存在');
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }
    throw error;
  }
}

module.exports = {
  MAX_UPLOAD_BYTES,
  hasAllowedTextExtension,
  saveUploadedText,
  listUploadedTexts,
  readUploadedText,
  deleteUploadedText
};
