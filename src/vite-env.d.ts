/// <reference types="vite/client" />

interface Skill {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  isPluginEnabled?: boolean;
  isManagedByPlugin?: boolean;
  isExplicitlyDisabled?: boolean;
  sourcePath: string;
  parentPlugin?: string | null;
  parentPluginName?: string;
}

interface Plugin {
  id: string;
  name: string;
  author: string;
  description: string;
  isEnabled: boolean;
  isManualMode?: boolean;
  hasEnabledSkills?: boolean;
  version?: string;
  installCount?: number;
  sourcePath: string;
}

interface ElectronAPI {
  scanSkills: () => Promise<{ userSkills: Skill[]; pluginSkills: Skill[]; error: string | null }>;
  toggleSkill: (skillId: string, parentPlugin: string | null | undefined, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  scanPlugins: () => Promise<{ plugins: Plugin[]; error: string | null }>;
  togglePlugin: (pluginId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
}

interface Window {
  electronAPI: ElectronAPI;
}
