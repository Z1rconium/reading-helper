const fs = require('fs/promises');
const path = require('path');
const { getUserDataRoot } = require('./user-paths');

// 限制缓存大小防止内存泄漏
const ensuredDirs = new Set();
const MAX_ENSURED_DIRS = 1000;
const DEFAULT_PREFERENCES = Object.freeze({
  speechRate: 0.9,
  speechVolume: 1.0,
  speechPitch: 1.0
});
const preferenceCache = new Map();

async function getPreferencesPath(userId) {
  const userDir = getUserDataRoot(userId);
  if (!ensuredDirs.has(userDir)) {
    await fs.mkdir(userDir, { recursive: true });
    ensuredDirs.add(userDir);
  }
  return path.join(userDir, 'preferences.json');
}

function normalizePreferenceNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePreferences(preferences) {
  const source = preferences && typeof preferences === 'object' ? preferences : {};
  return {
    speechRate: normalizePreferenceNumber(source.speechRate, DEFAULT_PREFERENCES.speechRate),
    speechVolume: normalizePreferenceNumber(source.speechVolume, DEFAULT_PREFERENCES.speechVolume),
    speechPitch: normalizePreferenceNumber(source.speechPitch, DEFAULT_PREFERENCES.speechPitch)
  };
}

async function getPreferences(userId) {
  const prefsPath = await getPreferencesPath(userId);
  try {
    const content = await fs.readFile(prefsPath, 'utf8');
    const preferences = normalizePreferences(JSON.parse(content));
    preferenceCache.set(userId, JSON.stringify(preferences, null, 2));
    return preferences;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ...DEFAULT_PREFERENCES };
    }
    throw error;
  }
}

async function savePreferences(userId, preferences) {
  const prefsPath = await getPreferencesPath(userId);
  const normalizedPreferences = normalizePreferences(preferences);
  const serialized = JSON.stringify(normalizedPreferences, null, 2);
  let previousSerialized = preferenceCache.get(userId);

  if (previousSerialized === undefined) {
    try {
      const currentContent = await fs.readFile(prefsPath, 'utf8');
      const currentPreferences = normalizePreferences(JSON.parse(currentContent));
      previousSerialized = JSON.stringify(currentPreferences, null, 2);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
      previousSerialized = '';
    }
  }

  if (previousSerialized === serialized) {
    preferenceCache.set(userId, serialized);
    return normalizedPreferences;
  }

  await fs.writeFile(prefsPath, serialized, 'utf8');
  preferenceCache.set(userId, serialized);
  return normalizedPreferences;
}

function clearUserPreferencesCache(userId) {
  const userDir = getUserDataRoot(userId);
  ensuredDirs.delete(userDir);
  preferenceCache.delete(userId);
}

module.exports = {
  getPreferences,
  savePreferences,
  clearUserPreferencesCache
};
