const fs = require('fs/promises');
const path = require('path');
const { getDataRoot } = require('./user-paths');

/**
 * 删除不在配置文件中的用户数据目录
 * @param {string[]} validUserIds - 当前配置文件中的有效用户 ID 列表
 */
async function cleanupOrphanedUsers(validUserIds) {
  const dataRoot = getDataRoot();
  const validUserIdSet = new Set(validUserIds);

  try {
    await fs.access(dataRoot);
  } catch {
    console.log(`[Cleanup] 用户数据目录不存在: ${dataRoot}`);
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(dataRoot, { withFileTypes: true });
  } catch (error) {
    console.error(`[Cleanup] 无法读取用户数据目录: ${error.message}`);
    return;
  }

  const orphanedEntries = entries.filter((entry) => !validUserIdSet.has(entry.name));

  if (orphanedEntries.length === 0) {
    console.log('[Cleanup] 没有需要清理的孤立用户数据');
    return;
  }

  console.log(`[Cleanup] 发现 ${orphanedEntries.length} 个孤立用户数据项，开始清理...`);

  for (const entry of orphanedEntries) {
    const entryPath = path.join(dataRoot, entry.name);
    try {
      if (entry.isDirectory()) {
        await fs.rm(entryPath, { recursive: true, force: true });
        console.log(`[Cleanup] 已删除目录: ${entry.name}`);
      } else {
        await fs.unlink(entryPath);
        console.log(`[Cleanup] 已删除文件: ${entry.name}`);
      }
    } catch (error) {
      console.error(`[Cleanup] 删除失败 ${entry.name}: ${error.message}`);
    }
  }

  console.log('[Cleanup] 用户数据清理完成');
}

module.exports = { cleanupOrphanedUsers };
