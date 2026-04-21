const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildManagedSkillEntries } = require('./manual-mode');

test('buildManagedSkillEntries derives symlink targets directly from cache and enabled ids', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-switch-manual-mode-'));
  const cachePath = path.join(root, 'plugins', 'cache', 'mp', 'writer', '1.0.0');
  const rewritePath = path.join(cachePath, 'skills', 'rewrite');

  fs.mkdirSync(rewritePath, { recursive: true });

  const skills = buildManagedSkillEntries(cachePath, ['rewrite', 'missing']);

  assert.deepEqual(skills, [
    {
      id: 'rewrite',
      isEnabled: true,
      sourcePath: rewritePath,
    },
  ]);
});
