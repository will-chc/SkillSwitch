const path = require('path');

function buildPluginInfoMap(enabledPlugins = {}) {
  const pluginInfoMap = new Map();

  for (const [pluginId, isEnabled] of Object.entries(enabledPlugins)) {
    const pluginName = pluginId.split('@')[0];
    const publisher = pluginId.split('@').slice(1).join('@');
    pluginInfoMap.set(pluginName, { pluginId, isEnabled: isEnabled === true, publisher });
  }

  return pluginInfoMap;
}

function normalizeSkillSwitchSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { disabledPlugins: {}, enabledPluginSkills: {} };
  }

  const disabledPlugins = settings.disabledPlugins;
  const enabledPluginSkills = settings.enabledPluginSkills;

  return {
    disabledPlugins: disabledPlugins && typeof disabledPlugins === 'object' ? disabledPlugins : {},
    enabledPluginSkills: enabledPluginSkills && typeof enabledPluginSkills === 'object' ? enabledPluginSkills : {},
  };
}

function isPluginDisabled(skillSwitchSettings, pluginId) {
  const settings = normalizeSkillSwitchSettings(skillSwitchSettings);
  return settings.disabledPlugins?.[pluginId] === true;
}

function setPluginDisabled(skillSwitchSettings, pluginId, disabled) {
  const settings = normalizeSkillSwitchSettings(skillSwitchSettings);

  if (disabled) {
    settings.disabledPlugins[pluginId] = true;
    return settings;
  }

  delete settings.disabledPlugins[pluginId];
  return settings;
}

function hasAnyEnabledPluginSkills(skillSwitchSettings, pluginId) {
  const settings = normalizeSkillSwitchSettings(skillSwitchSettings);
  return Object.keys(settings.enabledPluginSkills?.[pluginId] || {}).length > 0;
}

function isPluginSkillEnabled(skillSwitchSettings, pluginId, skillId) {
  const settings = normalizeSkillSwitchSettings(skillSwitchSettings);
  return settings.enabledPluginSkills?.[pluginId]?.[skillId] === true;
}

function setPluginSkillEnabled(skillSwitchSettings, pluginId, skillId, enabled) {
  const settings = normalizeSkillSwitchSettings(skillSwitchSettings);

  if (!settings.enabledPluginSkills[pluginId]) {
    settings.enabledPluginSkills[pluginId] = {};
  }

  if (enabled) {
    settings.enabledPluginSkills[pluginId][skillId] = true;
    return settings;
  }

  delete settings.enabledPluginSkills[pluginId][skillId];
  if (Object.keys(settings.enabledPluginSkills[pluginId]).length === 0) {
    delete settings.enabledPluginSkills[pluginId];
  }

  return settings;
}

function computePluginSkillState({
  baseName,
  skillInfo,
  skillPath,
  parentPluginName,
  pluginInfoMap,
  skillSwitchSettings,
}) {
  const pluginInfo = parentPluginName ? pluginInfoMap.get(parentPluginName) : null;
  const parentPlugin = pluginInfo ? pluginInfo.pluginId : parentPluginName || null;
  const isPluginEnabled = parentPlugin ? !isPluginDisabled(skillSwitchSettings, parentPlugin) : true;
  const isSkillEnabledViaSymlink = parentPlugin
    ? isPluginSkillEnabled(skillSwitchSettings, parentPlugin, baseName)
    : false;
  const isManagedByPlugin = isPluginEnabled;

  return {
    id: baseName,
    name: skillInfo.name || baseName,
    description: skillInfo.description || '',
    isEnabled: isManagedByPlugin ? true : isSkillEnabledViaSymlink,
    isPluginEnabled,
    isManagedByPlugin,
    isExplicitlyDisabled: !isManagedByPlugin && !isSkillEnabledViaSymlink,
    sourcePath: skillPath,
    parentPlugin,
    parentPluginName: parentPluginName || 'Unknown',
  };
}

function extractPluginNameFromPath(skillDir) {
  const parts = skillDir.split(path.sep);
  const skillsIndex = parts.lastIndexOf('skills');
  if (skillsIndex <= 0) {
    return null;
  }

  const beforeSkills = parts.slice(0, skillsIndex);
  for (let i = beforeSkills.length - 1; i >= 0; i -= 1) {
    const part = beforeSkills[i];
    if (/^(\d+\.)?\d+\.\d+$/.test(part) || part === 'latest' || part === 'unknown') {
      continue;
    }
    if (part.includes('cache')) {
      return null;
    }
    return part;
  }

  return null;
}

module.exports = {
  buildPluginInfoMap,
  computePluginSkillState,
  extractPluginNameFromPath,
  hasAnyEnabledPluginSkills,
  isPluginDisabled,
  isPluginSkillEnabled,
  normalizeSkillSwitchSettings,
  setPluginDisabled,
  setPluginSkillEnabled,
};
