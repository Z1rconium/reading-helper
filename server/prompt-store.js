const { constants: fsConstants } = require('fs');
const fs = require('fs/promises');
const path = require('path');

const { getConfigDir } = require('./config-loader');
const { getUserPromptDir } = require('./user-paths');

const MAX_PROMPT_NAME_LENGTH = 128;

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

  return promptDir;
}

async function listPromptFiles(userId) {
  const promptDir = await syncDefaultPrompts(userId);
  const entries = await fs.readdir(promptDir, { withFileTypes: true });

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isValidPromptName(entry.name)) continue;

    const filePath = path.join(promptDir, entry.name);
    const stat = await fs.stat(filePath);

    files.push({
      name: entry.name,
      updatedAt: stat.mtime.toISOString(),
      size: stat.size
    });
  }

  files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return files;
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
  const stat = await fs.stat(filePath);
  return {
    name: fileName,
    updatedAt: stat.mtime.toISOString(),
    size: stat.size
  };
}

module.exports = {
  listPromptFiles,
  readPromptFile,
  writePromptFile,
  isValidPromptName
};
