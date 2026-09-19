import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export interface OnboardingPreferences {
  narrativeDepth: 'cinematic' | 'balanced' | 'concise';
  rulesMode: 'grounded' | 'dynamic' | 'freeform';
  discoveryGenres: string[];
}

export interface OnboardingViewProps {
  onComplete: (prefs: OnboardingPreferences) => void;
  onSkip?: () => void;
}

export const ONBOARDING_STORAGE_KEY = 'dreambook_onboarding_completed';
export const ONBOARDING_PREFS_KEY = 'dreambook_user_preferences';
export const DISCOVERY_PREFS_STORAGE_KEY = 'dreambook_discovery_preferences';

export const DISCOVERY_GENRES = [
  'Dark Fantasy',
  'Cyberpunk',
  'Cosmic Horror',
  'Space Opera',
  'Post-Apocalyptic',
  'Mystery & Noir',
  'Mythic Historical',
  'Solarpunk',
  'Urban Fantasy',
  'Gothic Supernatural',
];

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete, onSkip }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preferences, setPreferences] = useState<OnboardingPreferences>(() => {
    let narrativeDepth: 'cinematic' | 'balanced' | 'concise' = 'cinematic';
    let rulesMode: 'grounded' | 'dynamic' | 'freeform' = 'grounded';
    let discoveryGenres = ['Dark Fantasy', 'Mystery & Noir', 'Space Opera'];

    try {
      const savedUser = localStorage.getItem(ONBOARDING_PREFS_KEY);
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed.narrativeDepth) narrativeDepth = parsed.narrativeDepth;
        if (parsed.rulesMode) rulesMode = parsed.rulesMode;
      }
      const savedDiscovery = localStorage.getItem(DISCOVERY_PREFS_STORAGE_KEY);
      if (savedDiscovery) {
        discoveryGenres = JSON.parse(savedDiscovery);
      }
    } catch {
      // ignore
    }

    return {
      narrativeDepth,
      rulesMode,
      discoveryGenres,
    };
  });

  const toggleGenre = (genre: string) => {
    setPreferences((prev) => {
      const exists = prev.discoveryGenres.includes(genre);
      const updated = exists
        ? prev.discoveryGenres.filter((g) => g !== genre)
        : [...prev.discoveryGenres, genre];
      return { ...prev, discoveryGenres: updated };
    });
  };

  const handleFinish = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      localStorage.setItem(
        ONBOARDING_PREFS_KEY,
        JSON.stringify({
          narrativeDepth: preferences.narrativeDepth,
          rulesMode: preferences.rulesMode,
        })
      );
      localStorage.setItem(DISCOVERY_PREFS_STORAGE_KEY, JSON.stringify(preferences.discoveryGenres));
    } catch {
      // LocalStorage fallback
    }
    onComplete(preferences);
  };

  const handleSkip = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      localStorage.setItem(
        ONBOARDING_PREFS_KEY,
        JSON.stringify({
          narrativeDepth: preferences.narrativeDepth,
          rulesMode: preferences.rulesMode,
        })
      );
      localStorage.setItem(DISCOVERY_PREFS_STORAGE_KEY, JSON.stringify(preferences.discoveryGenres));
    } catch {
      // LocalStorage fallback
    }
    if (onSkip) onSkip();
    else onComplete(preferences);
  };

  return (
    <div className="min-h-screen bg-[var(--db-bg-canvas)] flex flex-col items-center justify-center p-4 sm:p-6 dreambook-subtle-glow select-none">
      <div className="w-full max-w-xl animate-in fade-in duration-300">
        {/* Top Stepper Indicator */}
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--db-gold-500)]" />
            <span className="text-xs font-medium text-[var(--db-text-secondary)] uppercase tracking-wider">
              Step {step} of 3
            </span>
          </div>
          <div className="flex gap-1.5">
            <div className={`w-8 h-1 rounded-full ${step >= 1 ? 'bg-[var(--db-gold-500)]' : 'bg-[var(--db-border-default)]'}`} />
            <div className={`w-8 h-1 rounded-full ${step >= 2 ? 'bg-[var(--db-gold-500)]' : 'bg-[var(--db-border-default)]'}`} />
            <div className={`w-8 h-1 rounded-full ${step >= 3 ? 'bg-[var(--db-gold-500)]' : 'bg-[var(--db-border-default)]'}`} />
          </div>
        </div>

        {/* Step 1: Welcome & Overview */}
        {step === 1 && (
          <Card variant="raised" className="p-6 sm:p-8">
            <div className="w-12 h-12 rounded-2xl bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/40 flex items-center justify-center text-[var(--db-gold-400)] mb-6 shadow-[var(--db-shadow-glow-purple)]">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <Badge variant="purple" size="sm" className="mb-3">
              Welcome to DreamBook
            </Badge>
            <h2 className="text-2xl font-serif font-bold text-[var(--db-text-primary)] mb-3">
              Your Personal AI Story Engine
            </h2>
            <p className="text-sm text-[var(--db-text-secondary)] leading-relaxed mb-6">
              DreamBook creates living, persistent world simulations where your decisions hold permanent causal consequence. Every character remembers your deeds, geography shifts with time, and every choice branches the chronicle.
            </p>
            <div className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] mb-8 space-y-2 text-xs text-[var(--db-text-secondary)]">
              <div className="flex items-center gap-2 text-[var(--db-text-primary)] font-medium">
                <span className="text-[var(--db-gold-400)]">✦</span> Server-Authoritative World Simulator
              </div>
              <div className="flex items-center gap-2 text-[var(--db-text-primary)] font-medium">
                <span className="text-[var(--db-blue-300)]">✦</span> Lossless Chronicle & Epistemic Tracking
              </div>
              <div className="flex items-center gap-2 text-[var(--db-text-primary)] font-medium">
                <span className="text-[var(--db-purple-300)]">✦</span> Multimodal Narrative & Voice Synthesis
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="ghost" size="md" onClick={handleSkip}>
                Skip Setup
              </Button>
              <Button variant="primary" size="md" onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Storytelling Style Preferences */}
        {step === 2 && (
          <Card variant="raised" className="p-6 sm:p-8">
            <Badge variant="blue" size="sm" className="mb-2">
              Engine Preferences
            </Badge>
            <h2 className="text-xl font-serif font-bold text-[var(--db-text-primary)] mb-2">
              Storytelling Style & Simulation Rules
            </h2>
            <p className="text-xs text-[var(--db-text-secondary)] mb-6">
              Configure how the story engine formats scene prose and handles tactical rulings across your sessions.
            </p>

            {/* Narrative Depth */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-[var(--db-text-primary)] mb-2 block uppercase tracking-wider">
                Narrative Style
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['cinematic', 'balanced', 'concise'] as const).map((depth) => (
                  <button
                    key={depth}
                    type="button"
                    onClick={() => setPreferences((p) => ({ ...p, narrativeDepth: depth }))}
                    className={`p-3.5 rounded-[var(--db-radius-md)] text-left border transition-all cursor-pointer ${
                      preferences.narrativeDepth === depth
                        ? 'bg-[var(--db-surface-purple)] border-[var(--db-purple-500)] text-[var(--db-purple-300)] shadow-[var(--db-shadow-glow-purple)]'
                        : 'bg-[var(--db-bg-card)] border-[var(--db-border-default)] text-[var(--db-text-secondary)] hover:border-[var(--db-border-purple)]'
                    }`}
                  >
                    <div className="text-xs font-semibold capitalize text-[var(--db-text-primary)] mb-1">
                      {depth}
                    </div>
                    <div className="text-[11px] text-[var(--db-text-muted)] leading-tight">
                      {depth === 'cinematic' ? 'Rich sensory descriptions & deep atmosphere' : depth === 'balanced' ? 'Standard novel prose rhythm' : 'Fast-paced, action-oriented pacing'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Rules Mode */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-[var(--db-text-primary)] mb-2 block uppercase tracking-wider">
                Simulation Strictness
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['grounded', 'dynamic', 'freeform'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPreferences((p) => ({ ...p, rulesMode: mode }))}
                    className={`p-3.5 rounded-[var(--db-radius-md)] text-left border transition-all cursor-pointer ${
                      preferences.rulesMode === mode
                        ? 'bg-[var(--db-surface-blue)] border-[var(--db-blue-500)] text-[var(--db-blue-300)] shadow-[var(--db-shadow-glow-blue)]'
                        : 'bg-[var(--db-bg-card)] border-[var(--db-border-default)] text-[var(--db-text-secondary)] hover:border-[var(--db-border-blue)]'
                    }`}
                  >
                    <div className="text-xs font-semibold capitalize text-[var(--db-text-primary)] mb-1">
                      {mode}
                    </div>
                    <div className="text-[11px] text-[var(--db-text-muted)] leading-tight">
                      {mode === 'grounded' ? 'Strict inventory & resource bounds' : mode === 'dynamic' ? 'Adaptive tactical flexibility' : 'Pure narrative freedom'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="subtle" size="md" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="primary" size="md" onClick={() => setStep(3)}>
                Next: Discovery
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Repositioned Discovery Preferences */}
        {step === 3 && (
          <Card variant="raised" className="p-6 sm:p-8">
            <Badge variant="gold" size="sm" className="mb-2">
              Discovery Preferences
            </Badge>
            <h2 className="text-xl font-serif font-bold text-[var(--db-text-primary)] mb-2">
              Which worlds would you like DreamBook to show you more often?
            </h2>
            <p className="text-xs text-[var(--db-text-secondary)] mb-6 leading-relaxed">
              Set your browsing & discovery interests. DreamBook will highlight worlds matching these genres in your library. (You can explore all worlds anytime, and each new world you create has its own distinct genre).
            </p>

            <div className="flex flex-wrap gap-2 mb-8">
              {DISCOVERY_GENRES.map((genre) => {
                const isSelected = preferences.discoveryGenres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleGenre(genre)}
                    className={`px-3.5 py-2 rounded-[var(--db-radius-full)] text-xs font-medium border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--db-surface-purple)] border-[var(--db-purple-500)] text-[var(--db-purple-300)] shadow-[var(--db-shadow-glow-purple)]'
                        : 'bg-[var(--db-bg-card)] border-[var(--db-border-default)] text-[var(--db-text-secondary)] hover:border-[var(--db-border-purple)]'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {genre}
                  </button>
                );
              })}
            </div>

            <div className="p-4 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-default)] mb-8 flex items-center gap-3">
              <span className="text-lg text-[var(--db-gold-400)]">✦</span>
              <p className="text-xs text-[var(--db-text-secondary)]">
                Setup is complete! You can start playing immediately or browse curated worlds from the Dashboard.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button variant="subtle" size="md" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="primary" size="md" onClick={handleFinish}>
                Enter DreamBook
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
