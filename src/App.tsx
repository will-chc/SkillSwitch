import { useState, useEffect } from 'react';
import './App.css';

interface Skill {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
}

function App() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSkills = async () => {
    try {
      const result = await window.electronAPI.scanSkills();
      if (result.error) {
        setError(result.error);
      } else {
        setSkills(result.skills);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load skills. Make sure the app is running in Electron.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const handleToggle = async (skillId: string, currentEnabled: boolean) => {
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
      alert(`Failed to toggle skill: ${result.error}`);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading skills...</div>
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
          ⚠️ {error}
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
          skills.map(skill => (
            <div key={skill.id} className={`skill-card ${!skill.isEnabled ? 'disabled' : ''}`}>
              <div className="skill-info">
                <h3 className="skill-name">{skill.name}</h3>
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
                />
                <span className="slider"></span>
              </label>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
