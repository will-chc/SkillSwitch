const fs = require('node:fs');
const path = require('node:path');

function buildManagedSkillEntries(cachePath, enabledSkillIds) {
  return enabledSkillIds
    .map((skillId) => ({
      id: skillId,
      isEnabled: true,
      sourcePath: path.join(cachePath, 'skills', skillId),
    }))
    .filter((skill) => {
      try {
        return fs.statSync(skill.sourcePath).isDirectory();
      } catch {
        return false;
      }
    });
}

module.exports = {
  buildManagedSkillEntries,
};
