import { useState, useEffect } from 'react';
import './App.css';

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
  installCount?: number;
  version?: string;
  sourcePath: string;
}

type TabType = 'skills' | 'plugins';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('skills');
  const [userSkills, setUserSkills] = useState<Skill[]>([]);
  const [pluginSkills, setPluginSkills] = useState<Skill[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSkills = async () => {
    if (!window.electronAPI) {
      setError('Not running in Electron. Please launch the app with "npm run electron:dev"');
      setLoading(false);
      return;
    }

    try {
      const result = await window.electronAPI.scanSkills();
      if (result.error) {
        setError(result.error);
      } else {
        setUserSkills(result.userSkills);
        setPluginSkills(result.pluginSkills);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load skills.');
    } finally {
      setLoading(false);
    }
  };

  const loadPlugins = async () => {
    if (!window.electronAPI) {
      setError('Not running in Electron. Please launch the app with "npm run electron:dev"');
      return;
    }

    try {
      const result = await window.electronAPI.scanPlugins();
      if (result.error) {
        setError(result.error);
      } else {
        setPlugins(result.plugins);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load plugins.');
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  useEffect(() => {
    if (activeTab === 'plugins') {
      loadPlugins();
    }
  }, [activeTab]);

  const handleToggleSkill = async (skillId: string, parentPlugin: string | null | undefined, currentEnabled: boolean) => {
    if (!window.electronAPI) {
      alert('Electron API not available');
      return;
    }

    if (!parentPlugin) {
      alert('This skill is not linked to a plugin');
      return;
    }

    const targetSkill = pluginSkills.find(s => s.id === skillId && s.parentPlugin === parentPlugin);
    if (targetSkill?.isPluginEnabled) {
      alert('Disable the plugin first to manage its skills via symlinks');
      return;
    }

    const newEnabled = !currentEnabled;

    // Optimistic update
    setPluginSkills(prev =>
      prev.map(s => (
        s.id === skillId && s.parentPlugin === parentPlugin
          ? {
              ...s,
              isEnabled: newEnabled,
              isExplicitlyDisabled: !newEnabled,
            }
          : s
      ))
    );

    const result = await window.electronAPI.toggleSkill(skillId, parentPlugin, newEnabled);

    if (!result.success) {
      // Revert on failure
      setPluginSkills(prev =>
        prev.map(s => (
          s.id === skillId && s.parentPlugin === parentPlugin
            ? {
                ...s,
                isEnabled: currentEnabled,
                isExplicitlyDisabled: !currentEnabled,
              }
            : s
        ))
      );
      alert(`Failed to toggle skill: ${result.error}`);
      return;
    }

    loadSkills();
    if (activeTab === 'plugins') {
      loadPlugins();
    }
  };

  const handleTogglePlugin = async (pluginId: string, currentEnabled: boolean) => {
    if (!window.electronAPI) {
      alert('Electron API not available');
      return;
    }

    const newEnabled = !currentEnabled;

    // Optimistic update
    setPlugins(prev =>
      prev.map(p => (p.id === pluginId ? { ...p, isEnabled: newEnabled } : p))
    );
    setPluginSkills(prev =>
      prev.map(skill => (
        skill.parentPlugin === pluginId
          ? {
              ...skill,
              isPluginEnabled: newEnabled,
              isEnabled: newEnabled && !skill.isExplicitlyDisabled,
            }
          : skill
      ))
    );

    const result = await window.electronAPI.togglePlugin(pluginId, newEnabled);

    if (!result.success) {
      // Revert on failure
      setPlugins(prev =>
        prev.map(p => (p.id === pluginId ? { ...p, isEnabled: currentEnabled } : p))
      );
      setPluginSkills(prev =>
        prev.map(skill => (
          skill.parentPlugin === pluginId
            ? {
                ...skill,
                isPluginEnabled: currentEnabled,
                isEnabled: currentEnabled && !skill.isExplicitlyDisabled,
              }
            : skill
        ))
      );
      alert(`Failed to toggle plugin: ${result.error}`);
      return;
    }

    loadSkills();
    loadPlugins();
  };

  const totalSkills = userSkills.length + pluginSkills.length;
  const enabledCount = pluginSkills.filter(s => s.isEnabled).length + userSkills.length;
  const disabledCount = pluginSkills.filter(s => !s.isEnabled).length;

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading skills</div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <h1>SkillSwitch</h1>
        <p className="subtitle">Visual skill manager for AI agents</p>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'skills' ? 'active' : ''}`}
          onClick={() => setActiveTab('skills')}
        >
          Skills
          <span className="tab-count">{totalSkills}</span>
        </button>
        <button
          className={`tab ${activeTab === 'plugins' ? 'active' : ''}`}
          onClick={() => setActiveTab('plugins')}
        >
          Plugins
          <span className="tab-count">{plugins.length}</span>
        </button>
      </div>

      {/* Skills Tab */}
      {activeTab === 'skills' && (
        <>
          <div className="stats">
            <span className="stat">
              <strong>{enabledCount}</strong> enabled
            </span>
            <span className="stat-divider">•</span>
            <span className="stat">
              <strong>{disabledCount}</strong> disabled
            </span>
            <span className="stat-divider">•</span>
            <span className="stat">
              <strong>{totalSkills}</strong> total
            </span>
          </div>

          {/* User Skills Section */}
          <section className="skill-section">
            <h2 className="section-title">
              <span className="section-icon">👤</span>
              User Skills
              <span className="section-count">{userSkills.length}</span>
            </h2>
            {userSkills.length === 0 ? (
              <div className="empty-state">
                <p>No user skills found</p>
                <p className="empty-hint">Add skills to ~/.claude/skills/</p>
              </div>
            ) : (
              <div className="skills-list">
                {userSkills.map((skill, index) => (
                  <div
                    key={skill.id}
                    className="skill-card user-skill"
                    style={{
                      animation: `fadeSlideIn 0.5s ease forwards`,
                      animationDelay: `${index * 0.08}s`,
                      opacity: 0,
                    }}
                  >
                    <div className="skill-info">
                      <h3 className="skill-name">{skill.name}</h3>
                      <p className="skill-id">{skill.id}</p>
                      {skill.description && (
                        <p className="skill-description">{skill.description}</p>
                      )}
                    </div>
                    <span className="badge">User</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Plugin Skills Section */}
          <section className="skill-section">
            <h2 className="section-title">
              <span className="section-icon">🔌</span>
              Plugin Skills
              <span className="section-count">{pluginSkills.length}</span>
            </h2>
            {pluginSkills.length === 0 ? (
              <div className="empty-state">
                <p>No plugin skills found</p>
                <p className="empty-hint">Install plugins to see their skills</p>
              </div>
            ) : (
              <>
                {Array.from(new Set(pluginSkills.map(s => s.parentPluginName || 'Unknown'))).map((pluginName) => (
                  <div key={pluginName} className="plugin-skill-group">
                    <h3 className="plugin-skill-group-title">{pluginName}</h3>
                    <div className="skills-list">
                      {pluginSkills
                        .filter(s => s.parentPluginName === pluginName)
                        .map((skill, index) => (
                          <div
                            key={skill.id}
                            className={`skill-card ${!skill.isEnabled ? 'disabled' : ''}`}
                            style={{
                              animation: `fadeSlideIn 0.5s ease forwards`,
                              animationDelay: `${index * 0.08}s`,
                              opacity: 0,
                            }}
                          >
                            <div className="skill-info">
                              <h3 className="skill-name">{skill.name}</h3>
                              <p className="skill-id">{skill.id}</p>
                              {skill.description && (
                                <p className="skill-description">{skill.description}</p>
                              )}
                              {skill.isPluginEnabled && (
                                <p className="skill-status skill-status-plugin">Managed by plugin</p>
                              )}
                              {!skill.isPluginEnabled && skill.isEnabled && (
                                <p className="skill-status skill-status-skill">Enabled via symlink</p>
                              )}
                              {!skill.isPluginEnabled && !skill.isEnabled && (
                                <p className="skill-status skill-status-skill">Disabled in manual mode</p>
                              )}
                            </div>
                            <label className="toggle">
                              <input
                                type="checkbox"
                                checked={skill.isEnabled}
                                disabled={skill.isPluginEnabled}
                                onChange={() => handleToggleSkill(skill.id, skill.parentPlugin, skill.isEnabled)}
                              />
                              <span className="slider"></span>
                            </label>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>
        </>
      )}

      {/* Plugins Tab */}
      {activeTab === 'plugins' && (
        <section className="plugin-section">
          <div className="plugin-stats">
            <span className="stat">
              <strong>{plugins.filter(p => p.isEnabled).length}</strong> enabled
            </span>
            <span className="stat-divider">•</span>
            <span className="stat">
              <strong>{plugins.filter(p => !p.isEnabled).length}</strong> disabled
            </span>
            <span className="stat-divider">•</span>
            <span className="stat">
              <strong>{plugins.length}</strong> total
            </span>
          </div>

          <div className="plugins-list">
            {plugins.length === 0 ? (
              <div className="empty-state">
                <p>No plugins found</p>
                <p className="empty-hint">Plugins are located in ~/.claude/plugins/cache/</p>
              </div>
            ) : (
              plugins.map((plugin, index) => (
                <div
                  key={plugin.id}
                  className={`plugin-card ${!plugin.isEnabled ? 'disabled' : ''}`}
                  style={{
                    animation: `fadeSlideIn 0.5s ease forwards`,
                    animationDelay: `${index * 0.08}s`,
                    opacity: 0,
                  }}
                >
                  <div className="plugin-info">
                    <h3 className="plugin-name">{plugin.name}</h3>
                    <p className="plugin-author">{plugin.author}</p>
                    {plugin.description && (
                      <p className="plugin-description">{plugin.description}</p>
                    )}
                    {plugin.isManualMode && (
                      <p className="plugin-description">Manual mode: skill symlinks are managed individually.</p>
                    )}
                    <div className="plugin-meta">
                      {plugin.version && (
                        <span className="plugin-version">v{plugin.version}</span>
                      )}
                      {plugin.installCount !== undefined && (
                        <span className="plugin-installs">
                          {plugin.installCount.toLocaleString()} installs
                        </span>
                      )}
                    </div>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={plugin.isEnabled}
                      onChange={() => handleTogglePlugin(plugin.id, plugin.isEnabled)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px) translateX(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0) translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

export default App;
