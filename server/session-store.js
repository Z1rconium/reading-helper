const fs = require('fs/promises');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const { getSessionStoreDir } = require('./user-paths');

const SESSION_DB_FILE = 'reading-helper-sessions.sqlite3';

async function createSessionStore() {
  const dir = getSessionStoreDir();
  await fs.mkdir(dir, { recursive: true });

  return new SQLiteStore({
    dir,
    db: SESSION_DB_FILE,
    table: 'sessions',
    concurrentDb: true,
    createDirIfNotExists: true
  });
}

module.exports = {
  createSessionStore,
  SESSION_DB_FILE
};
