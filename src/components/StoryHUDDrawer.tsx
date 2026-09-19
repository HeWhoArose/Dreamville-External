import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  Package,
  Sparkles,
  Scroll,
  BookOpen,
  Compass,
  Users,
  Activity,
  X,
  ChevronRight,
  Info,
  AlertTriangle,
  Zap,
  Heart,
  ExternalLink,
} from 'lucide-react';

interface StoryHUDDrawerProps {
  storyId?: string;
  onSelectFreeformTab?: () => void;
}

export const StoryHUDDrawer: React.FC<StoryHUDDrawerProps> = ({ storyId, onSelectFreeformTab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'character' | 'equipment' | 'inventory' | 'skills' | 'quests' | 'memory' | 'codex' | 'relationships'
  >('character');
  const [runState, setRunState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEffect, setSelectedEffect] = useState<any>(null);

  const fetchRunState = async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (storyId) {
        headers['X-Story-ID'] = storyId;
      }
      const res = await fetch(`/api/game/run-canonical-state${storyId ? `?storyId=${storyId}` : ''}`, {
        headers,
      });
      const data = await res.json();
      if (data && !data.error) {
        setRunState(data);
      }
    } catch (err) {
      console.error('Failed to fetch run canonical state:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRunState();
    }
  }, [isOpen, storyId]);

  const protagonist = runState?.protagonist || {};
  const health = protagonist.health || { current: 100, max: 100 };
  const resource = protagonist.resource || { current: 50, max: 50, name: 'Energy' };
  const healthPercent = Math.max(0, Math.min(100, (health.current / (health.max || 100)) * 100));

  return (
    <>
      {/* Top adaptive RPG HUD bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-stone-900/90 backdrop-blur border-b border-stone-800 text-stone-200 text-xs sm:text-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveTab('character');
              setIsOpen(true);
            }}
            className="flex items-center gap-2 hover:text-amber-400 transition-colors focus:outline-none focus:ring-1 focus:ring-amber-400 rounded px-1.5 py-1"
            title="Open Character Sheet"
          >
            <span className="font-medium text-stone-100">{protagonist.name || 'Protagonist'}</span>
            <div className="w-20 bg-stone-800 h-2 rounded-full overflow-hidden border border-stone-700">
              <div
                className={`h-full transition-all duration-300 ${
                  healthPercent < 30 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
                }`}
                style={{ width: `${healthPercent}%` }}
              />
            </div>
            <span className="text-stone-400">{health.current}/{health.max}</span>
          </button>

          {/* Quick status indicators */}
          {protagonist.injuries?.length > 0 && (
            <span className="hidden md:inline-flex items-center gap-1 text-red-400 bg-red-950/50 px-2 py-0.5 rounded border border-red-900">
              <AlertTriangle className="w-3 h-3" /> {protagonist.injuries.length} Injury
            </span>
          )}
          {protagonist.activeEffects?.length > 0 && (
            <span className="hidden md:inline-flex items-center gap-1 text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-900">
              <Zap className="w-3 h-3" /> {protagonist.activeEffects.length} Effect
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => {
              setActiveTab('character');
              setIsOpen(true);
            }}
            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors flex items-center gap-1"
          >
            <User className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Character</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('equipment');
              setIsOpen(true);
            }}
            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors flex items-center gap-1"
          >
            <Shield className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Equipment</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('inventory');
              setIsOpen(true);
            }}
            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors flex items-center gap-1"
          >
            <Package className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Inventory</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('skills');
              setIsOpen(true);
            }}
            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Skills</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('quests');
              setIsOpen(true);
            }}
            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors flex items-center gap-1"
          >
            <Scroll className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Quests</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('codex');
              setIsOpen(true);
            }}
            className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors flex items-center gap-1"
          >
            <Compass className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Codex</span>
          </button>
        </div>
      </div>

      {/* Slide-over Drawer / Modal for RPG State */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl bg-stone-900 border-l border-stone-800 h-full flex flex-col shadow-2xl text-stone-100">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/60">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-serif font-semibold tracking-wide">Character & World Journal</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-100 rounded-lg hover:bg-stone-800 transition-colors"
                aria-label="Close Character Drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex overflow-x-auto border-b border-stone-800 bg-stone-950/40 px-4 py-2 gap-1.5">
              {[
                { id: 'character', label: 'Character', icon: User },
                { id: 'equipment', label: 'Equipment', icon: Shield },
                { id: 'inventory', label: 'Inventory', icon: Package },
                { id: 'skills', label: 'Skills & Powers', icon: Sparkles },
                { id: 'quests', label: 'Quests', icon: Scroll },
                { id: 'memory', label: 'Memory / Journal', icon: BookOpen },
                { id: 'codex', label: 'World Codex', icon: Compass },
                { id: 'relationships', label: 'Relationships', icon: Users },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                      active
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Drawer Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoading && !runState ? (
                <div className="flex items-center justify-center py-20 text-stone-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mr-3" />
                  Loading canonical state...
                </div>
              ) : !runState ? (
                <div className="text-center py-20 text-stone-500">Failed to load run state.</div>
              ) : (
                <>
                  {/* CHARACTER TAB */}
                  {activeTab === 'character' && (
                    <div className="space-y-6">
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-stone-800/50 border border-stone-700/60">
                        <div className="w-16 h-16 rounded-lg bg-stone-700 flex items-center justify-center text-stone-400 font-serif text-2xl border border-stone-600">
                          {protagonist.portraitUrl ? (
                            <img src={protagonist.portraitUrl} alt={protagonist.name} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            protagonist.name?.[0] || 'A'
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-serif font-bold text-stone-100">{protagonist.name}</h3>
                          <p className="text-sm text-amber-400 font-medium">{protagonist.role}</p>
                          <p className="text-xs text-stone-400 mt-1">Story Mode: <span className="text-stone-200 uppercase">{runState.storyMode}</span></p>
                        </div>
                      </div>

                      {/* Vitals & State */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-stone-800/40 border border-stone-700/60 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-stone-300 flex items-center gap-1.5"><Heart className="w-4 h-4 text-emerald-400" /> Health</span>
                            <span className="font-semibold">{health.current} / {health.max}</span>
                          </div>
                          <div className="w-full bg-stone-700 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.min(100, (health.current / health.max) * 100)}%` }} />
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-stone-800/40 border border-stone-700/60 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-stone-300 flex items-center gap-1.5"><Zap className="w-4 h-4 text-cyan-400" /> {resource.name || 'Energy'}</span>
                            <span className="font-semibold">{resource.current} / {resource.max}</span>
                          </div>
                          <div className="w-full bg-stone-700 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-cyan-500 h-full transition-all" style={{ width: `${Math.min(100, (resource.current / resource.max) * 100)}%` }} />
                          </div>
                        </div>
                      </div>

                      {/* Conditions, Buffs, Debuffs, Injuries */}
                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-stone-400">Conditions & Active Effects</h4>
                        <div className="flex flex-wrap gap-2">
                          {protagonist.conditions?.length === 0 && protagonist.activeEffects?.length === 0 && protagonist.injuries?.length === 0 ? (
                            <p className="text-sm text-stone-500 italic">No active conditions, buffs, or injuries.</p>
                          ) : (
                            <>
                              {protagonist.injuries?.map((inj: any, idx: number) => (
                                <button
                                  key={`inj_${idx}`}
                                  onClick={() => setSelectedEffect({ name: inj.name || 'Injury', type: 'Injury', description: inj.description || 'Physical trauma.', severity: inj.severity })}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-900 text-red-300 text-xs font-medium hover:bg-red-900/60 transition-colors"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                  {inj.name || 'Injury'}
                                </button>
                              ))}
                              {protagonist.activeEffects?.map((eff: any, idx: number) => (
                                <button
                                  key={`eff_${idx}`}
                                  onClick={() => setSelectedEffect(eff)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-900 text-amber-300 text-xs font-medium hover:bg-amber-900/60 transition-colors"
                                >
                                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                                  {eff.name || 'Effect'}
                                </button>
                              ))}
                              {protagonist.conditions?.map((cond: any, idx: number) => (
                                <button
                                  key={`cond_${idx}`}
                                  onClick={() => setSelectedEffect(cond)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 border border-stone-700 text-stone-300 text-xs font-medium hover:bg-stone-700 transition-colors"
                                >
                                  <Info className="w-3.5 h-3.5 text-stone-400" />
                                  {typeof cond === 'string' ? cond : cond.name}
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* EQUIPMENT TAB */}
                  {activeTab === 'equipment' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-serif font-semibold">Equipped Gear & Paper Doll</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {runState.equipment?.equippedItems?.length === 0 ? (
                          <p className="text-sm text-stone-500 italic">No equipment currently equipped.</p>
                        ) : (
                          runState.equipment.equippedItems.map((item: any, idx: number) => (
                            <div key={idx} className="p-4 rounded-xl bg-stone-800/40 border border-stone-700 flex items-center justify-between">
                              <div>
                                <h4 className="font-medium text-stone-200">{item.name || item.definitionId}</h4>
                                <p className="text-xs text-stone-400 mt-0.5">Slot: <span className="text-amber-400 uppercase">{item.equippedSlot || 'Equipped'}</span></p>
                              </div>
                              <Shield className="w-5 h-5 text-amber-500/60" />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* INVENTORY TAB */}
                  {activeTab === 'inventory' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-serif font-semibold">Canonical Inventory</h3>
                      <div className="space-y-2">
                        {runState.inventory?.items?.length === 0 ? (
                          <p className="text-sm text-stone-500 italic">Inventory is empty.</p>
                        ) : (
                          runState.inventory.items.map((item: any, idx: number) => (
                            <div key={idx} className="p-3.5 rounded-xl bg-stone-800/40 border border-stone-700/80 flex items-center justify-between">
                              <div>
                                <h4 className="font-medium text-stone-200 text-sm">{item.name || item.definitionId}</h4>
                                <p className="text-xs text-stone-400">{item.description || 'Canonical item instance.'}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-stone-700 text-stone-300">Qty: {item.quantity || 1}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* SKILLS TAB */}
                  {activeTab === 'skills' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-serif font-semibold">Capabilities & Techniques</h3>
                        {onSelectFreeformTab && (
                          <button
                            onClick={() => {
                              setIsOpen(false);
                              onSelectFreeformTab();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
                          >
                            <span>FREEFORM / ATTEMPT SOMETHING ELSE</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Core Capabilities</h4>
                        <div className="grid grid-cols-1 gap-3">
                          {runState.capabilities?.coreCapabilities?.map((cap: any, idx: number) => (
                            <div key={idx} className="p-4 rounded-xl bg-stone-800/40 border border-stone-700/80 space-y-1">
                              <div className="flex justify-between items-center">
                                <h5 className="font-medium text-stone-200 text-sm">{cap.name}</h5>
                                <span className="text-xs px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-900">{cap.powerTier || 'Core'}</span>
                              </div>
                              <p className="text-xs text-stone-400">{cap.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Generated Techniques & Skills</h4>
                        <div className="grid grid-cols-1 gap-3">
                          {runState.capabilities?.generatedTechniques?.length === 0 ? (
                            <p className="text-xs text-stone-500 italic">No specialized techniques generated yet.</p>
                          ) : (
                            runState.capabilities.generatedTechniques.map((tech: any, idx: number) => (
                              <div key={idx} className="p-4 rounded-xl bg-stone-800/40 border border-stone-700/80 space-y-1">
                                <h5 className="font-medium text-stone-200 text-sm">{tech.name || tech.capabilityId}</h5>
                                <p className="text-xs text-stone-400">{tech.description || 'Learned tactical technique.'}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* QUESTS TAB */}
                  {activeTab === 'quests' && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-serif font-semibold">Canonical Quests & Story Events</h3>
                      
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Active / Planned Quests</h4>
                        {runState.quests?.active?.length === 0 ? (
                          <p className="text-xs text-stone-500 italic">No active quests currently tracked.</p>
                        ) : (
                          runState.quests.active.map((q: any, idx: number) => (
                            <div key={idx} className="p-4 rounded-xl bg-stone-800/40 border border-stone-700 space-y-1">
                              <h5 className="font-medium text-stone-200 text-sm">{q.title}</h5>
                              <p className="text-xs text-stone-400">{q.description}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Completed Quests</h4>
                        {runState.quests?.completed?.length === 0 ? (
                          <p className="text-xs text-stone-500 italic">No completed quests yet.</p>
                        ) : (
                          runState.quests.completed.map((q: any, idx: number) => (
                            <div key={idx} className="p-4 rounded-xl bg-stone-800/30 border border-stone-800 space-y-1 opacity-80">
                              <h5 className="font-medium text-stone-300 text-sm line-through">{q.title}</h5>
                              <p className="text-xs text-stone-500">{q.description}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* MEMORY TAB */}
                  {activeTab === 'memory' && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-serif font-semibold">Canonical Memory & Historical Evidence</h3>
                      <div className="space-y-3">
                        {runState.memory?.evidence?.length === 0 && runState.memory?.facts?.length === 0 ? (
                          <p className="text-xs text-stone-500 italic">No recorded memories or historical evidence yet.</p>
                        ) : (
                          <>
                            {runState.memory?.evidence?.map((ev: any, idx: number) => (
                              <div key={`ev_${idx}`} className="p-4 rounded-xl bg-stone-800/40 border border-stone-700 space-y-1">
                                <div className="flex justify-between items-center">
                                  <h5 className="font-medium text-stone-200 text-sm">{ev.summary}</h5>
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-stone-700 text-stone-300 uppercase">{ev.category}</span>
                                </div>
                                <p className="text-xs text-stone-400">{ev.details}</p>
                              </div>
                            ))}
                            {runState.memory?.facts?.map((fact: any, idx: number) => (
                              <div key={`fact_${idx}`} className="p-4 rounded-xl bg-stone-800/40 border border-stone-700 space-y-1">
                                <h5 className="font-medium text-stone-200 text-sm">{fact.predicate}: {fact.objectValue}</h5>
                                <p className="text-xs text-stone-400">{fact.provenanceSummary || 'Discovered fact.'}</p>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CODEX TAB */}
                  {activeTab === 'codex' && (
                    <div className="space-y-6">
                      <h3 className="text-lg font-serif font-semibold">World Codex & Epistemic Map</h3>
                      
                      <div className="p-4 rounded-xl bg-stone-800/40 border border-stone-700 space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Current Location</h4>
                        <p className="font-medium text-stone-100">{runState.worldCodex?.currentLocation?.name || 'Unknown Location'}</p>
                        <p className="text-xs text-stone-400">{runState.worldCodex?.currentLocation?.description}</p>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Discovered Regions & Places</h4>
                        {runState.worldCodex?.discoveredLocations?.map((loc: any, idx: number) => (
                          <div key={idx} className="p-3.5 rounded-xl bg-stone-800/30 border border-stone-800">
                            <h5 className="font-medium text-stone-200 text-sm">{loc.name}</h5>
                            <p className="text-xs text-stone-400">{loc.description}</p>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">World Factions & Lore</h4>
                        {runState.worldCodex?.factions?.map((fac: any, idx: number) => (
                          <div key={idx} className="p-3.5 rounded-xl bg-stone-800/30 border border-stone-800">
                            <h5 className="font-medium text-stone-200 text-sm">{fac.name}</h5>
                            <p className="text-xs text-stone-400">{fac.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* RELATIONSHIPS TAB */}
                  {activeTab === 'relationships' && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-serif font-semibold">Known Relationships</h3>
                      {runState.relationships?.length === 0 ? (
                        <p className="text-sm text-stone-500 italic">No significant relationships established yet.</p>
                      ) : (
                        runState.relationships.map((rel: any, idx: number) => (
                          <div key={idx} className="p-4 rounded-xl bg-stone-800/40 border border-stone-700 flex justify-between items-center">
                            <div>
                              <h4 className="font-medium text-stone-200">{rel.targetName || rel.targetId}</h4>
                              <p className="text-xs text-stone-400">Disposition: <span className="text-amber-400">{rel.disposition || 'Neutral'}</span></p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Effect / Condition Detail Modal */}
      {selectedEffect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-stone-900 border border-stone-700 rounded-2xl p-6 space-y-4 shadow-2xl text-stone-100">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-lg font-serif font-semibold text-amber-400">{selectedEffect.name || 'Condition Detail'}</h3>
              <button onClick={() => setSelectedEffect(null)} className="text-stone-400 hover:text-stone-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-stone-300">
              <p><strong className="text-stone-400">Type:</strong> <span className="uppercase">{selectedEffect.type || 'Active Effect'}</span></p>
              <p><strong className="text-stone-400">Description:</strong> {selectedEffect.description || 'No additional description available.'}</p>
              {selectedEffect.duration && <p><strong className="text-stone-400">Duration:</strong> {selectedEffect.duration}</p>}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedEffect(null)}
                className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
