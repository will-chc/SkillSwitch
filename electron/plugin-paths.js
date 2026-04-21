const fs = require('node:fs');
const path = require('node:path');

function findPluginVersionPath(cacheDir, pluginName, publisher) {
  const publisherDir = path.join(cacheDir, publisher);
  const pluginDir = path.join(publisherDir, pluginName);

  if (!fs.existsSync(pluginDir)) {
    return null;
  }

  const versions = fs.readdirSync(pluginDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const version of versions) {
    const versionDir = path.join(pluginDir, version);
    if (fs.existsSync(path.join(versionDir, 'skills'))) {
      return versionDir;
    }
  }

  return null;
}

module.exports = {
  findPluginVersionPath,
};
