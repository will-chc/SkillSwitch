const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPluginInfoMap,
  computePluginSkillState,
  isPluginDisabled,
  isPluginSkillEnabled,
  setPluginDisabled,
  setPluginSkillEnabled,
} = require('./skill-state');

test('computePluginSkillState shows plugin-managed skills as enabled when the plugin is on', () => {
  const pluginInfoMap = buildPluginInfoMap({
    'english-tools@acme': true,
  });

  const enabledState = computePluginSkillState({
    baseName: 'rewrite',
    skillInfo: { name: 'Rewrite', description: 'Rewrite text' },
    skillPath: '/cache/acme/english-tools/1.0.0/skills/rewrite',
    parentPluginName: 'english-tools',
    pluginInfoMap,
    skillSwitchSettings: {},
  });

  assert.equal(enabledState.id, 'rewrite');
  assert.equal(enabledState.name, 'Rewrite');
  assert.equal(enabledState.parentPlugin, 'english-tools@acme');
  assert.equal(enabledState.isEnabled, true);
  assert.equal(enabledState.isPluginEnabled, true);
  assert.equal(enabledState.isManagedByPlugin, true);

  const dormantOverrideState = computePluginSkillState({
    baseName: 'rewrite',
    skillInfo: { name: 'Rewrite', description: 'Rewrite text' },
    skillPath: '/cache/acme/english-tools/1.0.0/skills/rewrite',
    parentPluginName: 'english-tools',
    pluginInfoMap,
    skillSwitchSettings: {
      enabledPluginSkills: {
        'english-tools@acme': {
          rewrite: true,
        },
      },
    },
  });

  assert.equal(dormantOverrideState.isEnabled, true);
  assert.equal(dormantOverrideState.isPluginEnabled, true);
  assert.equal(dormantOverrideState.isManagedByPlugin, true);
});

test('computePluginSkillState only enables individual skills through overrides when the plugin is off', () => {
  const pluginInfoMap = buildPluginInfoMap({
    'english-tools@acme': true,
  });

  const state = computePluginSkillState({
    baseName: 'rewrite',
    skillInfo: { name: 'Rewrite', description: 'Rewrite text' },
    skillPath: '/cache/acme/english-tools/1.0.0/skills/rewrite',
    parentPluginName: 'english-tools',
    pluginInfoMap,
    skillSwitchSettings: {
      disabledPlugins: {
        'english-tools@acme': true,
      },
    },
  });

  assert.equal(state.isEnabled, false);
  assert.equal(state.isPluginEnabled, false);
  assert.equal(state.isManagedByPlugin, false);

  const enabledViaSymlinkState = computePluginSkillState({
    baseName: 'rewrite',
    skillInfo: { name: 'Rewrite', description: 'Rewrite text' },
    skillPath: '/cache/acme/english-tools/1.0.0/skills/rewrite',
    parentPluginName: 'english-tools',
    pluginInfoMap,
    skillSwitchSettings: {
      disabledPlugins: {
        'english-tools@acme': true,
      },
      enabledPluginSkills: {
        'english-tools@acme': {
          rewrite: true,
        },
      },
    },
  });

  assert.equal(enabledViaSymlinkState.isEnabled, true);
  assert.equal(enabledViaSymlinkState.isPluginEnabled, false);
  assert.equal(enabledViaSymlinkState.isManagedByPlugin, false);
});

test('per-skill enable overrides use stable skill ids instead of display names', () => {
  const settings = {
    enabledPluginSkills: {
      'english-tools@acme': {
        rewrite: true,
      },
    },
  };

  assert.equal(isPluginSkillEnabled(settings, 'english-tools@acme', 'rewrite'), true);
  assert.equal(isPluginSkillEnabled(settings, 'english-tools@acme', 'Rewrite'), false);

  setPluginSkillEnabled(settings, 'english-tools@acme', 'summarize', true);
  assert.equal(isPluginSkillEnabled(settings, 'english-tools@acme', 'summarize'), true);

  setPluginSkillEnabled(settings, 'english-tools@acme', 'summarize', false);
  assert.equal(isPluginSkillEnabled(settings, 'english-tools@acme', 'summarize'), false);
});

test('plugin global disables are tracked separately from per-skill enable overrides', () => {
  let settings = {};

  settings = setPluginDisabled(settings, 'english-tools@acme', true);
  assert.equal(isPluginDisabled(settings, 'english-tools@acme'), true);

  settings = setPluginSkillEnabled(settings, 'english-tools@acme', 'rewrite', true);
  assert.equal(isPluginSkillEnabled(settings, 'english-tools@acme', 'rewrite'), true);

  settings = setPluginDisabled(settings, 'english-tools@acme', false);
  assert.equal(isPluginDisabled(settings, 'english-tools@acme'), false);
  assert.equal(isPluginSkillEnabled(settings, 'english-tools@acme', 'rewrite'), true);
});
