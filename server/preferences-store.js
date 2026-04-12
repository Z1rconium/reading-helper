const fs = require('fs/promises');
const path = require('path');
const { getUserDataRoot } = require('./user-paths');

async function getPreferencesPath(userId) {
  const userDir = getUserDataRoot(userId);
  await fs.mkdir(userDir, { recursive: true });
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
