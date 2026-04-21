const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { syncPluginSkillSymlinks } = require('./plugin-takeover');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-switch-plugin-takeover-'));
}

test('syncPluginSkillSymlinks symlinks enabled skills and removes disabled/orphaned plugin symlinks', () => {
  const root = makeTempDir();
  const userSkillsDir = path.join(root, 'claude', 'skills');
  const pluginCacheDir = path.join(root, 'claude', 'plugins', 'cache');
  const pluginRoot = path.join(pluginCacheDir, 'mp', 'writer', '1.0.0');
  const enabledSkillPath = path.join(pluginRoot, 'skills', 'rewrite');
  const disabledSkillPath = path.join(pluginRoot, 'skills', 'brainstorming');

  fs.mkdirSync(enabledSkillPath, { recursive: true });
  fs.mkdirSync(disabledSkillPath, { recursive: true });
  fs.mkdirSync(userSkillsDir, { recursive: true });

  fs.symlinkSync(disabledSkillPath, path.join(userSkillsDir, 'brainstorming'));
  fs.symlinkSync(path.join(pluginRoot, 'skills', 'orphan'), path.join(userSkillsDir, 'orphan'));

  const result = syncPluginSkillSymlinks({
    userSkillsDir,
    pluginCacheDir,
    takenOverPlugins: [
      {
        pluginId: 'writer@mp',
        cachePath: pluginRoot,
        skills: [
          { id: 'rewrite', sourcePath: enabledSkillPath, isEnabled: true },
          { id: 'brainstorming', sourcePath: disabledSkillPath, isEnabled: false },
        ],
      },
    ],
  });

  assert.equal(fs.lstatSync(path.join(userSkillsDir, 'rewrite')).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(path.join(userSkillsDir, 'rewrite')), enabledSkillPath);
  assert.equal(fs.existsSync(path.join(userSkillsDir, 'brainstorming')), false);
  assert.equal(fs.existsSync(path.join(userSkillsDir, 'orphan')), false);
  assert.deepEqual(result.created, ['rewrite']);
  assert.deepEqual(result.removed.sort(), ['brainstorming', 'orphan']);
});

test('syncPluginSkillSymlinks leaves non-plugin user skills untouched', () => {
  const root = makeTempDir();
  const userSkillsDir = path.join(root, 'claude', 'skills');
  const pluginCacheDir = path.join(root, 'claude', 'plugins', 'cache');
  const pluginRoot = path.join(pluginCacheDir, 'mp', 'writer', '1.0.0');
  const enabledSkillPath = path.join(pluginRoot, 'skills', 'rewrite');

  fs.mkdirSync(enabledSkillPath, { recursive: true });
  fs.mkdirSync(path.join(userSkillsDir, 'local-skill'), { recursive: true });

  const result = syncPluginSkillSymlinks({
    userSkillsDir,
    pluginCacheDir,
    takenOverPlugins: [
      {
        pluginId: 'writer@mp',
        cachePath: pluginRoot,
        skills: [{ id: 'rewrite', sourcePath: enabledSkillPath, isEnabled: true }],
      },
    ],
  });

  assert.equal(fs.existsSync(path.join(userSkillsDir, 'local-skill')), true);
  assert.equal(fs.lstatSync(path.join(userSkillsDir, 'rewrite')).isSymbolicLink(), true);
  assert.deepEqual(result.removed, []);
});
