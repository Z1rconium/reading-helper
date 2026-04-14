const fs = require('fs/promises');
const path = require('path');
const { getUserDataRoot } = require('./user-paths');

// 限制缓存大小防止内存泄漏
const ensuredDirs = new Set();
const MAX_ENSURED_DIRS = 1000;

async function getPreferencesPath(userId) {
  const userDir = getUserDataRoot(userId);
  if (!ensuredDirs.has(userDir)) {
    await fs.mkdir(userDir, { recursive: true });
    ensuredDirs.add(userDir);
  }
  return path.join(userDir, 'preferences.json');
}

async function getPreferences(userId) {
  const prefsPath = await getPreferencesPath(userId);
  try {
    const content = await fs.readFile(prefsPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { speechRate: 0.9, speechVolume: 1.0, speechPitch: 1.0 };
    }
    throw error;
  }
}

async function savePreferences(userId, preferences) {
  const prefsPath = await getPreferencesPath(userId);
  await fs.writeFile(prefsPath, JSON.stringify(preferences, null, 2), 'utf8');
  return preferences;
}

module.exports = { getPreferences, savePreferences };
