const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { findPluginVersionPath } = require('./plugin-paths');

test('findPluginVersionPath returns the version directory that contains skills', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-switch-plugin-paths-'));
  const cacheDir = path.join(root, 'cache');
  const pluginVersionDir = path.join(cacheDir, 'claude-plugins-official', 'superpowers', '5.0.7');
  fs.mkdirSync(path.join(pluginVersionDir, 'skills', 'brainstorming'), { recursive: true });

  const result = findPluginVersionPath(cacheDir, 'superpowers', 'claude-plugins-official');

  assert.equal(result, pluginVersionDir);
});
