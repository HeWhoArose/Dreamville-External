import React, { useState, useEffect } from 'react';
import {
  CombatStateResponse,
  BattlefieldParticipant,
  DynamicHazardZone,
  BattleEvent,
  CapabilityDefinition,
  PowerState,
} from '../types';
import { apiClient } from '../services/apiClient';
import {
  Swords,
  Shield,
  Zap,
  RotateCcw,
  ChevronRight,
  Flame,
  Skull,
  Trophy,
  Activity,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

interface TacticalCombatViewProps {
  onRefreshWorldState?: () => void;
}

export const TacticalCombatView: React.FC<TacticalCombatViewProps> = ({ onRefreshWorldState }) => {
  const [combatState, setCombatState] = useState<CombatStateResponse | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityDefinition[]>([]);
  const [powerState, setPowerState] = useState<PowerState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string>('');
  const [moveCoord, setMoveCoord] = useState<{ x: number; y: number }>({ x: 1, y: 1 });

  const fetchCombatData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const state = await apiClient.getCombatState();
      setCombatState(state);

      // Fetch capabilities for combat casting
      const capData = await apiClient.getCapabilities();
      if (capData.capabilities) {
        setCapabilities(capData.capabilities);
        if (capData.capabilities.length > 0 && !selectedCapabilityId) {
          setSelectedCapabilityId(capData.capabilities[0].id);
        }
      }
      if (capData.powerState) {
        setPowerState(capData.powerState);
      }

      // Auto-select first alive enemy target if none selected
      const firstEnemy = state.participants.find((p) => p.team === 'enemies' && !p.isDead);
      if (firstEnemy && !selectedTargetId) {
        setSelectedTargetId(firstEnemy.id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load combat encounter.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCombatData();
  }, []);

  const handleStartEncounter = async () => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await apiClient.startCombatEncounter();
      setCombatState(res.combatState);
      const firstEnemy = res.combatState.participants.find((p) => p.team === 'enemies' && !p.isDead);
      if (firstEnemy) setSelectedTargetId(firstEnemy.id);
      onRefreshWorldState?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start encounter.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMove = async (targetX: number, targetY: number) => {
    if (!combatState?.currentActor) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await apiClient.moveCombatActor({
        actorId: combatState.currentActor.id,
        targetX,
        targetY,
      });
      setCombatState(res.combatState);
    } catch (err: any) {
      setErrorMsg(err.message || 'Movement failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAttack = async () => {
    if (!selectedTargetId) {
      setErrorMsg('Please select a target to attack.');
      return;
    }
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await apiClient.executeCombatAttack({
        targetId: selectedTargetId,
      });
      setCombatState(res.combatState);
      onRefreshWorldState?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Attack failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCastCapability = async () => {
    if (!selectedTargetId) {
      setErrorMsg('Please select a target for capability invocation.');
      return;
    }
    if (!selectedCapabilityId) {
      setErrorMsg('Please select a capability to cast.');
      return;
    }
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await apiClient.castCombatCapability({
        targetId: selectedTargetId,
        capabilityId: selectedCapabilityId,
        requestedScale: 'Local',
      });
      setCombatState(res.combatState);
      if (res.powerState) {
        setPowerState(res.powerState);
      }
      onRefreshWorldState?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Capability cast rejected.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndTurn = async () => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await apiClient.endCombatTurn();
      setCombatState(res.combatState);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to advance turn.');
    } finally {
      setActionLoading(false);
    }
  };

  const currentActor = combatState?.currentActor;
  const isPlayerTurn = combatState?.isPlayerTurn ?? false;
  const turnResources = combatState?.viewerTurnResources;
  const actionAvailable = turnResources?.actionAvailable ?? true;
  const movementRemaining = turnResources?.movementRemainingCells ?? 0;

  // Grid constants (8x8)
  const gridSize = 8;
  const gridCells = [];
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      gridCells.push({ x, y });
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-stone-900/90 border border-stone-800 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-red-950/60 border border-red-800/40 flex items-center justify-center text-red-400">
            <Swords className="w-5 h-5" />
          </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl">
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500">Action</span>
            <div className={`mt-1 font-mono text-sm font-bold ${actionAvailable ? 'text-emerald-300' : 'text-stone-500'}`}>
              {actionAvailable ? 'Available' : 'Spent'}
            </div>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl">
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500">Bonus Action</span>
            <div className={`mt-1 font-mono text-sm font-bold ${turnResources?.bonusActionAvailable ? 'text-emerald-300' : 'text-stone-500'}`}>
              {turnResources?.bonusActionAvailable ? 'Available' : 'Spent'}
            </div>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl">
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500">Reaction</span>
            <div className={`mt-1 font-mono text-sm font-bold ${turnResources?.reactionAvailable ? 'text-emerald-300' : 'text-stone-500'}`}>
              {turnResources?.reactionAvailable ? 'Available' : 'Spent'}
            </div>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl">
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500">Movement</span>
            <div className="mt-1 font-mono text-sm font-bold text-blue-300">
              {movementRemaining.toFixed(1)} / {turnResources?.movementMaxCells ?? currentActor?.speedCells ?? 0} cells
            </div>
          </div>
        </div>
        </>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-serif font-bold text-stone-100">Tactical Combat Workstation</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                D&D SRD 5.2.1
              </span>
            </div>
            <p className="text-xs text-stone-400">
              Deterministic 2D grid ruleset adapter with canonical inventory and lifecycle synchronization.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="start-encounter-btn"
            onClick={handleStartEncounter}
            disabled={actionLoading}
            className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset / Seed Encounter</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Combat State Banner */}
      {combatState && (
        <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl">
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500">Battle Round</span>
            <div className="text-lg font-bold font-serif text-amber-300 mt-0.5">Round {combatState.currentRound}</div>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl">
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500">Active Actor</span>
            <div className="text-sm font-semibold text-stone-200 mt-0.5 truncate">
              {currentActor ? currentActor.name : 'None'}
            </div>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl">
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500">Turn Status</span>
            <div className="text-xs font-semibold mt-1">
              {combatState.victory ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> Victory
                </span>
              ) : combatState.defeat ? (
                <span className="text-red-400 flex items-center gap-1">
                  <Skull className="w-3.5 h-3.5" /> Defeat
                </span>
              ) : isPlayerTurn ? (
                <span className="text-amber-400 font-mono">Player Turn (Active)</span>
              ) : (
                <span className="text-stone-400 font-mono">Enemy Turn</span>
              )}
            </div>
          </div>
          <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl">
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500">Player Power Mana</span>
            <div className="text-sm font-bold text-cyan-400 mt-0.5 font-mono">
              {powerState ? `${powerState.magicalEnergy} / 100` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Main Tactical Grid and Controls Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 2D Interactive Battlefield Grid */}
        <div className="lg:col-span-7 bg-stone-900/90 border border-stone-800 rounded-xl p-4 flex flex-col items-center">
          <div className="w-full flex items-center justify-between pb-3 border-b border-stone-800 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-serif font-bold text-stone-300">Tactical Grid (8 × 8 Cells)</span>
              <span className="text-[10px] text-stone-500 font-mono">Euclidean Movement Validated</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-stone-400">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Ally
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Enemy
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-orange-500/40 border border-orange-500 inline-block" /> Hazard
              </span>
            </div>
          </div>

          {/* Grid View */}
          <div className="grid grid-cols-8 gap-1.5 bg-stone-950 p-3 rounded-xl border border-stone-800 shadow-inner w-full max-w-[480px] aspect-square">
            {gridCells.map(({ x, y }) => {
              const participant = combatState?.participants.find((p) => p.x === x && p.y === y && !p.isDead);
              const hazard = combatState?.hazards.find(
                (h) => Math.hypot(x - h.x, y - h.y) <= h.radiusCells
              );
              const isCurrentActorCell = currentActor?.x === x && currentActor?.y === y;
              const isSelectedTargetCell = selectedTargetId && participant?.id === selectedTargetId;

              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => {
                    if (isPlayerTurn && currentActor && !participant && movementRemaining > 0 && !actionLoading) {
                      handleMove(x, y);
                    } else if (participant && participant.team === 'enemies') {
                      setSelectedTargetId(participant.id);
                    }
                  }}
                  className={`relative rounded flex flex-col items-center justify-center cursor-pointer transition select-none ${
                    hazard
                      ? 'bg-orange-950/40 border border-orange-600/40'
                      : 'bg-stone-900/60 border border-stone-800/80 hover:border-amber-500/40'
                  } ${isCurrentActorCell ? 'ring-2 ring-amber-400' : ''} ${
                    isSelectedTargetCell ? 'ring-2 ring-red-500' : ''
                  }`}
                  title={`Cell (${x}, ${y})${hazard ? ` - Hazard: ${hazard.type}` : ''}`}
                >
                  <span className="absolute top-0.5 left-1 text-[8px] text-stone-600 font-mono">
                    {x},{y}
                  </span>

                  {hazard && (
                    <Flame className="w-3 h-3 text-orange-500/50 absolute bottom-0.5 right-0.5" />
                  )}

                  {participant && (
                    <div className="flex flex-col items-center justify-center z-10">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow ${
                          participant.team === 'player_allies'
                            ? 'bg-blue-600 text-white ring-1 ring-blue-400'
                            : 'bg-red-600 text-white ring-1 ring-red-400'
                        }`}
                      >
                        {participant.name.charAt(0)}
                      </div>
                      <div className="w-6 bg-stone-950 h-1 rounded-full mt-0.5 overflow-hidden border border-stone-700">
                        <div
                          className={`h-full ${
                            participant.team === 'player_allies' ? 'bg-emerald-400' : 'bg-red-400'
                          }`}
                          style={{
                            width: `${Math.max(0, Math.min(100, (participant.hpCurrent / participant.hpMax) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Turn Queue Bar */}
          {combatState && (
            <div className="w-full mt-4 pt-3 border-t border-stone-800 flex items-center gap-2 overflow-x-auto">
              <span className="text-[10px] uppercase font-mono text-stone-500 shrink-0">Initiative:</span>
              {combatState.turnQueue.map((actorId, idx) => {
                const p = combatState.participants.find((part) => part.id === actorId);
                if (!p) return null;
                const isCurrent = idx === combatState.currentTurnIndex;
                return (
                  <div
                    key={actorId}
                    className={`px-2 py-1 rounded text-xs flex items-center gap-1.5 shrink-0 border ${
                      p.isDead
                        ? 'bg-stone-950 text-stone-600 border-stone-800 line-through'
                        : isCurrent
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-medium shadow-sm'
                        : 'bg-stone-900 text-stone-400 border-stone-800'
                    }`}
                  >
                    <span className="font-mono text-[10px]">d20:{p.initiative}</span>
                    <span>{p.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Actions, Target Selection, & Battle Log */}
        <div className="lg:col-span-5 space-y-4">
          {/* Active Combatant Stats Card */}
          {currentActor && (
            <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400/90">
                    Active Turn Participant
                  </span>
                  <h3 className="text-sm font-bold text-stone-100">{currentActor.name}</h3>
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                    currentActor.team === 'player_allies'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}
                >
                  {currentActor.team === 'player_allies' ? 'Player Allies' : 'Enemies'}
                </span>
              </div>

              {/* Health Bar */}
              <div>
                <div className="flex justify-between text-xs text-stone-400 mb-1">
                  <span>Health (HP)</span>
                  <span className="font-mono text-stone-200">
                    {currentActor.hpCurrent} / {currentActor.hpMax}
                  </span>
                </div>
                <div className="w-full bg-stone-950 h-2 rounded-full overflow-hidden border border-stone-800">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${Math.max(0, Math.min(100, (currentActor.hpCurrent / currentActor.hpMax) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-stone-950 rounded-lg border border-stone-800">
                  <span className="text-[10px] text-stone-500 block">Armor Class</span>
                  <span className="font-mono font-bold text-amber-300">AC {currentActor.armorClass}</span>
                </div>
                <div className="p-2 bg-stone-950 rounded-lg border border-stone-800">
                  <span className="text-[10px] text-stone-500 block">Speed</span>
                  <span className="font-mono font-bold text-blue-300">{currentActor.speedCells} Cells</span>
                </div>
                <div className="p-2 bg-stone-950 rounded-lg border border-stone-800">
                  <span className="text-[10px] text-stone-500 block">Weapon Dmg</span>
                  <span className="font-mono font-bold text-emerald-300">{currentActor.damageFormula}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Execution Panel */}
          <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-serif font-bold text-stone-200 border-b border-stone-800 pb-2">
              Tactical Actions (Canonical Authority)
            </h4>

            {/* Target Selector */}
            <div className="space-y-1">
              <label className="text-[11px] text-stone-400 block font-medium">Designated Target</label>
              <select
                id="combat-target-select"
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="w-full px-3 py-1.5 bg-stone-950 border border-stone-700 rounded-lg text-xs text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
              >
                <option value="">-- Select Combat Target --</option>
                {combatState?.participants.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.isDead}>
                    {p.name} ({p.team}) — HP: {p.hpCurrent}/{p.hpMax} {p.isDead ? '[DEAD]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Standard Attack Button */}
            <div className="pt-1">
              <button
                id="combat-attack-btn"
                onClick={handleAttack}
                disabled={actionLoading || !isPlayerTurn || !actionAvailable || combatState?.victory || combatState?.defeat}
                className="w-full py-2 px-3 rounded-lg bg-red-900/80 hover:bg-red-800 text-red-100 text-xs font-semibold flex items-center justify-center gap-2 border border-red-700 transition disabled:opacity-50"
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Execute Weapon Strike ({currentActor?.damageFormula || '1d8+3'})</span>
              </button>
            </div>

            {/* Capability Cast Section (CH6/CH7 Integration) */}
            <div className="space-y-2 pt-2 border-t border-stone-800">
              <label className="text-[11px] text-cyan-300 font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Cast Capability (CapabilityEngine Adjudication)</span>
              </label>
              <select
                id="combat-capability-select"
                value={selectedCapabilityId}
                onChange={(e) => setSelectedCapabilityId(e.target.value)}
                className="w-full px-3 py-1.5 bg-stone-950 border border-cyan-800/40 rounded-lg text-xs text-cyan-200 focus:outline-none focus:border-cyan-500 font-mono"
              >
                {capabilities.map((cap) => (
                  <option key={cap.id} value={cap.id}>
                    {cap.name} [{cap.powerTier} Tier] — Energy: {cap.baseEnergyCost}
                  </option>
                ))}
              </select>

              <button
                id="combat-cast-btn"
                onClick={handleCastCapability}
                disabled={actionLoading || !isPlayerTurn || !actionAvailable || combatState?.victory || combatState?.defeat}
                className="w-full py-2 px-3 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-100 text-xs font-semibold flex items-center justify-center gap-2 border border-cyan-700/60 transition disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Cast Power In Combat</span>
              </button>
            </div>

            {/* End Turn Button */}
            <div className="pt-2 border-t border-stone-800">
              <button
                id="combat-end-turn-btn"
                onClick={handleEndTurn}
                disabled={actionLoading || combatState?.victory || combatState?.defeat}
                className="w-full py-2 px-3 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 text-xs font-medium flex items-center justify-center gap-1.5 border border-stone-700 transition"
              >
                <span>End Current Turn</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Battle Event Log */}
          <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-serif font-bold text-stone-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>Structured Battle Event Log</span>
            </h4>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 text-xs">
              {combatState?.eventLog && combatState.eventLog.length > 0 ? (
                combatState.eventLog
                  .slice()
                  .reverse()
                  .map((evt, index) => (
                    <div
                      key={index}
                      className="p-2 bg-stone-950 rounded border border-stone-850 text-stone-300 font-mono text-[11px]"
                    >
                      <div className="flex items-center justify-between text-[10px] text-stone-500 mb-0.5">
                        <span className="font-bold text-amber-400/80">R{evt.turnNumber} • {evt.actionType}</span>
                        {evt.rollRecord && (
                          <span className="text-stone-400">
                            d20:{evt.rollRecord.individualDice.join('+')}{evt.rollRecord.modifier >= 0 ? `+${evt.rollRecord.modifier}` : evt.rollRecord.modifier} = {evt.rollRecord.total}
                            {evt.rollRecord.isCriticalSuccess ? ' [CRIT!]' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-stone-200">{evt.headline}</p>
                    </div>
                  ))
              ) : (
                <div className="text-stone-500 italic text-center py-4">No battle events recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
