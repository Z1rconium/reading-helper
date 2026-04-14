const path = require('path');

const DEFAULT_DATA_ROOT = path.join(__dirname, '..', 'data', 'users');
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function assertValidUserId(userId) {
  if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId)) {
    const error = new Error('非法用户 ID');
    error.code = 'INVALID_USER_ID';
    throw error;
  }

  return userId;
}

function getDataRoot() {
  if (process.env.USER_DATA_ROOT) {
    return process.env.USER_DATA_ROOT;
  }

  if (process.env.DATA_DIR) {
    return path.join(path.dirname(process.env.DATA_DIR), 'users');
  }

  return DEFAULT_DATA_ROOT;
}

function getRuntimeDataRoot() {
  return path.dirname(getDataRoot());
}

function getSessionStoreDir() {
  if (process.env.SESSION_STORE_DIR) {
    return process.env.SESSION_STORE_DIR;
  }

  return path.join(getRuntimeDataRoot(), 'sessions');
}

function getUserDataRoot(userId) {
  return path.join(getDataRoot(), assertValidUserId(userId));
}

function getUserUploadDir(userId) {
  return path.join(getUserDataRoot(userId), 'uploads');
}

function getUserChatDir(userId) {
  return path.join(getUserDataRoot(userId), 'chats');
}

function getUserPromptDir(userId) {
  return path.join(getUserDataRoot(userId), 'prompts');
}

module.exports = {
  assertValidUserId,
  getDataRoot,
  getRuntimeDataRoot,
  getSessionStoreDir,
  getUserDataRoot,
  getUserUploadDir,
  getUserChatDir,
  getUserPromptDir
};
