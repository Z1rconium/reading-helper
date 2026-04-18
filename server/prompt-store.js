const { constants: fsConstants } = require('fs');
const fs = require('fs/promises');
const path = require('path');

const { getConfigDir } = require('./config-loader');
const { getUserPromptDir } = require('./user-paths');

const MAX_PROMPT_NAME_LENGTH = 128;

// 记录已同步过的用户，避免重复检查（限制大小防止内存泄漏）
const syncedUsers = new Set();
const MAX_SYNCED_USERS = 1000;

function getDefaultPromptDir() {
  return path.join(getConfigDir(), 'prompts');
}

function isValidPromptName(fileName) {
  if (typeof fileName !== 'string') return false;
  if (!fileName || fileName.length > MAX_PROMPT_NAME_LENGTH) return false;
  if (fileName.includes('/') || fileName.includes('\\')) return false;
  if (path.extname(fileName).toLowerCase() !== '.md') return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(fileName);
}

function assertValidPromptName(fileName) {
  if (!isValidPromptName(fileName)) {
    const error = new Error('非法提示词文件名');
    error.code = 'INVALID_NAME';
    throw error;
  }
}

async function ensurePromptDir() {
  const promptDir = getDefaultPromptDir();
  await fs.mkdir(promptDir, { recursive: true });
  return promptDir;
}

async function ensureUserPromptDir(userId) {
  const promptDir = getUserPromptDir(userId);
  await fs.mkdir(promptDir, { recursive: true });
  return promptDir;
}

async function syncDefaultPrompts(userId) {
  const promptDir = await ensureUserPromptDir(userId);

  // 如果已经同步过，直接返回
  if (syncedUsers.has(userId)) {
    return promptDir;
  }

  const defaultPromptDir = await ensurePromptDir();
  const entries = await fs.readdir(defaultPromptDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isValidPromptName(entry.name)) continue;

    const sourcePath = path.join(defaultPromptDir, entry.name);
    const targetPath = path.join(promptDir, entry.name);

    try {
      await fs.copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
    } catch (error) {
      if (error && error.code === 'EEXIST') {
        continue;
      }
      throw error;
    }
  }

  // 标记该用户已同步
  syncedUsers.add(userId);
  return promptDir;
}

async function listPromptFiles(userId) {
  const promptDir = await syncDefaultPrompts(userId);
  const entries = await fs.readdir(promptDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isValidPromptName(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

async function readPromptFile(userId, fileName) {
  assertValidPromptName(fileName);
  const promptDir = await syncDefaultPrompts(userId);
  const filePath = path.join(promptDir, fileName);

  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const notFound = new Error('提示词文件不存在');
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }
    throw error;
  }
}

async function writePromptFile(userId, fileName, content) {
  assertValidPromptName(fileName);

  if (typeof content !== 'string') {
    const error = new Error('提示词内容必须是字符串');
    error.code = 'INVALID_CONTENT';
    throw error;
  }

  const promptDir = await syncDefaultPrompts(userId);
  const filePath = path.join(promptDir, fileName);

  try {
    await fs.access(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const notFound = new Error('提示词文件不存在');
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }
    throw error;
  }

  await fs.writeFile(filePath, content, 'utf8');
  return {
    name: fileName
  };
}

function clearUserPromptSyncState(userId) {
  syncedUsers.delete(userId);
}

module.exports = {
  listPromptFiles,
  readPromptFile,
  writePromptFile,
  isValidPromptName,
  clearUserPromptSyncState
};
