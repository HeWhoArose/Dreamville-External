import React from 'react';
import { WorldTime, Location } from '../types';
import { ShieldCheck, Clock, Compass, BookOpen, Eye, Layers, Archive } from 'lucide-react';

interface HeaderProps {
  worldTime: WorldTime;
  activeLocation: Location;
  activeTab: 'story' | 'characters' | 'inventory' | 'capabilities' | 'combat' | 'map' | 'chronicle';
  onTabChange: (tab: 'story' | 'characters' | 'inventory' | 'capabilities' | 'combat' | 'map' | 'chronicle') => void;
  onOpenEpistemicModal: () => void;
  onOpenContextModal?: () => void;
  onOpenArchiveModal?: () => void;
  pendingRequestsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  worldTime,
  activeLocation,
  activeTab,
  onTabChange,
  onOpenEpistemicModal,
  onOpenContextModal,
  onOpenArchiveModal,
  pendingRequestsCount,
}) => {
  return (
    <header className="border-b border-stone-800 bg-stone-900/90 backdrop-blur-md sticky top-0 z-40">
      {/* Top authoritative bar */}
      <div className="border-b border-stone-850 bg-stone-950/60 px-4 py-1.5 text-xs text-stone-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-550/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            MOCK CONTRACT v0.1 • DOWNSTREAM CLIENT
          </span>
          <span className="hidden sm:inline text-stone-600">|</span>
          <span className="text-stone-400 font-mono hidden sm:inline">
            Epistemic Boundary: Enforced
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-mono text-stone-300 mr-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Cycle {worldTime.cycle}</span>
            <span className="text-stone-500">•</span>
            <span className="text-amber-300/90 font-medium">{worldTime.period}</span>
          </div>
          <button
            id="epistemic-bounds-btn"
            onClick={onOpenEpistemicModal}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-amber-200 border border-stone-700 transition text-[11px] font-medium"
            title="Inspect Epistemic Separation Model"
          >
            <Eye className="w-3 h-3 text-amber-400" />
            <span>Epistemic Model</span>
          </button>
          {onOpenContextModal && (
            <button
              id="context-inspect-btn"
              onClick={onOpenContextModal}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-amber-200 border border-stone-700 transition text-[11px] font-medium"
              title="Inspect Working Context & Token Budget"
            >
              <Layers className="w-3 h-3 text-amber-400" />
              <span>Context Budget</span>
            </button>
          )}
          {onOpenArchiveModal && (
            <button
              id="archive-modal-btn"
              onClick={onOpenArchiveModal}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-amber-200 border border-stone-700 transition text-[11px] font-medium"
              title="Lossless Campaign Archive (.dreamarchive)"
            >
              <Archive className="w-3 h-3 text-amber-400" />
              <span>Archive</span>
            </button>
          )}
        </div>
      </div>

      {/* Main navigation & location header */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-stone-800 border border-amber-500/30 flex items-center justify-center shadow-inner">
            <span className="text-xl">🌌</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-serif font-bold tracking-tight text-stone-100">
                Dreamville External
              </h1>
              <span className="text-[10px] uppercase font-mono tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/90 border border-amber-500/20">
                Presentation Layer
              </span>
            </div>
            <p className="text-xs text-stone-400 flex items-center gap-1.5 mt-0.5">
              <Compass className="w-3 h-3 text-amber-400" />
              <span className="font-medium text-stone-200">{activeLocation.name}</span>
              <span className="text-stone-600">—</span>
              <span className="text-stone-400">{activeLocation.region}</span>
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <nav className="flex items-center gap-1 p-1 bg-stone-950 rounded-xl border border-stone-800 self-start md:self-auto overflow-x-auto max-w-full">
          <button
            id="nav-tab-story"
            onClick={() => onTabChange('story')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'story'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            <span>📜</span>
            <span>Scene & Dialogue</span>
          </button>
          <button
            id="nav-tab-characters"
            onClick={() => onTabChange('characters')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'characters'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            <span>👥</span>
            <span>Characters</span>
          </button>
          <button
            id="nav-tab-inventory"
            onClick={() => onTabChange('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'inventory'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            <span>🎒</span>
            <span>Inventory & Gear</span>
          </button>
          <button
            id="nav-tab-capabilities"
            onClick={() => onTabChange('capabilities')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'capabilities'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            <span>✨</span>
            <span>Powers & Workshop</span>
          </button>
          <button
            id="nav-tab-combat"
            onClick={() => onTabChange('combat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'combat'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            <span>⚔️</span>
            <span>Tactical Combat</span>
          </button>
          <button
            id="nav-tab-map"
            onClick={() => onTabChange('map')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'map'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            <span>🗺️</span>
            <span>World Map</span>
          </button>
          <button
            id="nav-tab-chronicle"
            onClick={() => onTabChange('chronicle')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'chronicle'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Chronicle & State</span>
            {pendingRequestsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-stone-950 font-bold text-[10px]">
                {pendingRequestsCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
};
