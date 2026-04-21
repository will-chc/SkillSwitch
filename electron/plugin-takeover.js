const fs = require('node:fs');
const path = require('node:path');

function createSkillSymlink(sourcePath, symlinkPath) {
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });

  try {
    const stats = fs.lstatSync(symlinkPath);
    if (stats.isSymbolicLink()) {
      const currentTarget = fs.readlinkSync(symlinkPath);
      if (currentTarget === sourcePath) {
        return { success: true, action: 'unchanged' };
      }
      fs.unlinkSync(symlinkPath);
      fs.symlinkSync(sourcePath, symlinkPath);
      return { success: true, action: 'updated' };
    }

    const backupPath = `${symlinkPath}.backup.${Date.now()}`;
    fs.renameSync(symlinkPath, backupPath);
    fs.symlinkSync(sourcePath, symlinkPath);
    return { success: true, action: 'replaced', backupPath };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      return { success: false, action: 'error', error: error.message };
    }
  }

  fs.symlinkSync(sourcePath, symlinkPath);
  return { success: true, action: 'created' };
}

function removeSkillSymlink(symlinkPath) {
  try {
    const stats = fs.lstatSync(symlinkPath);
    if (!stats.isSymbolicLink()) {
      return { success: false, existed: true, error: `Path exists but is not a symlink: ${symlinkPath}` };
    }
    fs.unlinkSync(symlinkPath);
    return { success: true, existed: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: true, existed: false };
    }
    return { success: false, existed: true, error: error.message };
  }
}

function syncPluginSkillSymlinks({ userSkillsDir, pluginCacheDir, takenOverPlugins }) {
  const created = [];
  const removed = [];
  const expected = new Map();

  for (const plugin of takenOverPlugins) {
    for (const skill of plugin.skills) {
      if (!skill.isEnabled) {
        continue;
      }
      expected.set(path.join(userSkillsDir, skill.id), skill.sourcePath);
    }
  }

  for (const [symlinkPath, sourcePath] of expected) {
    const result = createSkillSymlink(sourcePath, symlinkPath);
    if (result.success && result.action === 'created') {
      created.push(path.basename(symlinkPath));
    }
  }

  if (!fs.existsSync(userSkillsDir)) {
    return { created, removed };
  }

  for (const entry of fs.readdirSync(userSkillsDir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) {
      continue;
    }

    const fullPath = path.join(userSkillsDir, entry.name);
    try {
      const target = fs.readlinkSync(fullPath);
      if (target.startsWith(pluginCacheDir) && !expected.has(fullPath)) {
        const result = removeSkillSymlink(fullPath);
        if (result.success) {
          removed.push(entry.name);
        }
      }
    } catch {
      // Ignore broken symlink reads here; the caller can clean them up separately.
    }
  }

  return { created, removed };
}

module.exports = {
  createSkillSymlink,
  removeSkillSymlink,
  syncPluginSkillSymlinks,
};
