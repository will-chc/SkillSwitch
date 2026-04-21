import { useState, useEffect } from 'react';
import './App.css';

interface Skill {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  isPluginLocked?: boolean;
  source?: string;
}

function App() {
  const [skills, setSkills] = useState<Skill[]>([]);
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
        setSkills(result.skills);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load skills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const handleToggle = async (skillId: string, currentEnabled: boolean) => {
    if (!window.electronAPI) {
      alert('Electron API not available');
      return;
    }

    const newEnabled = !currentEnabled;

    // Optimistic update
    setSkills(prev =>
      prev.map(s => (s.id === skillId ? { ...s, isEnabled: newEnabled } : s))
    );

    const result = await window.electronAPI.toggleSkill(skillId, newEnabled);

    if (!result.success) {
      // Revert on failure
      setSkills(prev =>
        prev.map(s => (s.id === skillId ? { ...s, isEnabled: currentEnabled } : s))
      );
      // Show toast for plugin-locked skills
      if (result.error?.includes('locked')) {
        // Plugin-locked skill - just show a subtle message
        console.log('Skill is managed by a plugin and cannot be toggled manually');
      } else {
        alert(`Failed to toggle skill: ${result.error}`);
      }
    }
  };

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

      <div className="stats">
        <span className="stat">
          <strong>{skills.filter(s => s.isEnabled).length}</strong> enabled
        </span>
        <span className="stat-divider">•</span>
        <span className="stat">
          <strong>{skills.filter(s => !s.isEnabled).length}</strong> disabled
        </span>
        <span className="stat-divider">•</span>
        <span className="stat">
          <strong>{skills.length}</strong> total
        </span>
      </div>

      <div className="skills-list">
        {skills.length === 0 ? (
          <div className="empty-state">
            <p>No skills found</p>
            <p className="empty-hint">Skills should be in ~/.claude/skills/</p>
          </div>
        ) : (
          skills.map((skill, index) => (
            <div
              key={skill.id}
              className={`skill-card ${!skill.isEnabled ? 'disabled' : ''} ${skill.isPluginLocked ? 'plugin-locked' : ''}`}
              style={{
                animation: `fadeSlideIn 0.5s ease forwards`,
                animationDelay: `${index * 0.08}s`,
                opacity: 0,
              }}
            >
              <div className="skill-info">
                <div className="skill-name-row">
                  <h3 className="skill-name">{skill.name}</h3>
                  {skill.isPluginLocked && (
                    <span className="lock-badge" title="Locked by plugin">
                      🔒
                    </span>
                  )}
                  {skill.source && (
                    <span className="source-badge">{skill.source}</span>
                  )}
                </div>
                <p className="skill-id">{skill.id}</p>
                {skill.description && (
                  <p className="skill-description">{skill.description}</p>
                )}
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={skill.isEnabled}
                  onChange={() => handleToggle(skill.id, skill.isEnabled)}
                  disabled={skill.isPluginLocked}
                />
                <span className="slider"></span>
              </label>
            </div>
          ))
        )}
      </div>

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
