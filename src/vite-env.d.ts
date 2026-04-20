/// <reference types="vite/client" />

interface Skill {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  path: string;
}

interface ElectronAPI {
  scanSkills: () => Promise<{ skills: Skill[]; error: string | null }>;
  toggleSkill: (skillId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
