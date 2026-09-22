import React, { useState, useEffect } from 'react';
import {
  CombatStateResponse,
  BattlefieldParticipant,
  DynamicHazardZone,
  BattleEvent,
  CapabilityDefinition,
  PowerState,
  CombatEffectDefinition,
} from '../types';
import { apiClient } from '../services/apiClient';
import { CombatAnimationLayer } from './combat/CombatAnimationLayer';
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
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string>('');
  const [moveCoord, setMoveCoord] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const [advancedEffectOpen, setAdvancedEffectOpen] = useState<boolean>(false);
  const [effectMode, setEffectMode] = useState<CombatEffectDefinition['resolutionMode']>('MULTI_INSTANCE');
  const [effectCount, setEffectCount] = useState<number>(5);
  const [effectAttackFormula, setEffectAttackFormula] = useState<string>('1d20');
  const [effectDamageFormula, setEffectDamageFormula] = useState<string>('1d8');
  const [effectDamageType, setEffectDamageType] = useState<string>('radiant');
  const [effectTargetingMode, setEffectTargetingMode] = useState<CombatEffectDefinition['targetingMode']>('ONE_TARGET');
  const [effectActionCost, setEffectActionCost] = useState<CombatEffectDefinition['actionCost']>('ACTION');
  const [effectScale, setEffectScale] = useState<CombatEffectDefinition['scale']>('PERSON');
  const [effectSaveAbility, setEffectSaveAbility] = useState<string>('DEX');
  const [effectDifficultyClass, setEffectDifficultyClass] = useState<number>(15);
  const [effectOutcome, setEffectOutcome] = useState<CombatEffectDefinition['outcome']>('INSTANT_DEFEAT');
  const [effectRangeCells, setEffectRangeCells] = useState<number>(8);
  const [effectResult, setEffectResult] = useState<any>(null);
  const [effectSimulation, setEffectSimulation] = useState<any>(null);
  const [presentationMode, setPresentationMode] = useState<'FULL' | 'FAST' | 'TEXT' | 'LOG'>('FULL');
  const [combatReplays, setCombatReplays] = useState<any[]>([]);
  const [selectedReplayId, setSelectedReplayId] = useState<string>('');
  const [replayResult, setReplayResult] = useState<any>(null);
  const [replayLoading, setReplayLoading] = useState<boolean>(false);

  const fetchCombatData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const state = await apiClient.getCombatState();
      setCombatState(state);
      if (state.storyId) {
        try {
          const replayData = await apiClient.getCombatReplays(state.storyId);
          setCombatReplays(Array.isArray(replayData?.replays) ? replayData.replays : []);
        } catch {
          setCombatReplays([]);
        }
      }

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
        setSelectedTargetIds([firstEnemy.id]);
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
      if (firstEnemy) {
        setSelectedTargetId(firstEnemy.id);
        setSelectedTargetIds([firstEnemy.id]);
      }
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

  const handleCoreCombatAction = async (action: 'DASH' | 'DODGE' | 'DISENGAGE') => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await apiClient.executeCombatAction({
        action,
      });
      setCombatState(res.combatState);
      onRefreshWorldState?.();
    } catch (err: any) {
      setErrorMsg(err.message || `${action} failed.`);
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
    if (!selectedCapabilityId) {
      setErrorMsg('Please select a capability to cast.');
      return;
    }

    const selectedCapability = capabilities.find((item) => item.id === selectedCapabilityId);
    const canonicalEffect = selectedCapability?.effectDefinition;

    // Phase 8.5: all structured capabilities use the canonical effect pipeline.
    // The legacy cast endpoint remains available only for pre-8.5 capabilities
    // that have not yet been authored with a CombatEffectDefinition.
    if (canonicalEffect) {
      await handleStructuredEffect();
      return;
    }

    if (!selectedTargetId) {
      setErrorMsg('Please select a target for legacy capability invocation.');
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

  const handleStructuredEffect = async () => {
    if (!selectedCapabilityId || !combatState?.storyId) {
      setErrorMsg('Select an authoritative capability and active combat state first.');
      return;
    }

    const capability = capabilities.find((item) => item.id === selectedCapabilityId);
    const canonicalDefinition = capability?.effectDefinition;

    if (!canonicalDefinition) {
      setErrorMsg('This capability has no structured combat definition yet. Use the capability authoring flow to create one before live execution.');
      return;
    }

    const structuredTargetMode = canonicalDefinition.targetingMode || 'ONE_TARGET';
    const multiTargetMode = ['MULTI_TARGET', 'PER_INSTANCE', 'CHAIN', 'ALL_IN_AREA'].includes(structuredTargetMode);
    const resolvedTargetIds = multiTargetMode
      ? Array.from(new Set([...(selectedTargetIds.length ? selectedTargetIds : selectedTargetId ? [selectedTargetId] : [])]))
      : (selectedTargetId ? [selectedTargetId] : []);
    const requiresTarget =
      canonicalDefinition.resolutionMode !== 'WORLD_EFFECT' &&
      structuredTargetMode !== 'SELF';

    if (requiresTarget && resolvedTargetIds.length === 0) {
      setErrorMsg('This capability requires at least one target.');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);

      const validation = await apiClient.validateCombatEffect(
        combatState.storyId,
        canonicalDefinition
      );
      if (!validation.success) {
        throw new Error(validation.errorReason || 'Authoritative combat effect failed validation.');
      }

      const result = await apiClient.executeCombatEffect(
        combatState.storyId,
        canonicalDefinition,
        resolvedTargetIds,
        { capabilityId: selectedCapabilityId }
      );

      setEffectResult(result?.effectResult || null);
      setCombatState(result?.combatState || combatState);

      const events = result?.effectResult?.instances || [];
      const plan = await apiClient.generateCombatAnimationPlan(
        combatState.storyId,
        canonicalDefinition,
        events as any
      );

      if (plan?.plan) {
        setEffectResult((previous: any) => ({
          ...(typeof previous === 'object' ? previous : {}),
          animationPlan: plan.plan,
        }));

        const assetRefs = Array.isArray(plan.plan.assetRefs)
          ? plan.plan.assetRefs.map(String).filter(Boolean)
          : [];

        if (assetRefs.length) {
          const assetResults = await Promise.all(
            assetRefs.map(async (assetId: string) => {
              try {
                const ensured = await apiClient.ensureCombatAsset(
                  combatState.storyId!,
                  canonicalDefinition.id,
                  'Dreamville combat visual asset for ' +
                    canonicalDefinition.name +
                    '. Visual reference: ' +
                    assetId +
                    '. Style: ' +
                    String(plan.plan.style || canonicalDefinition.damageType || canonicalDefinition.name) +
                    '.',
                  assetId,
                );
                return typeof ensured?.asset?.imageUrl === 'string'
                  ? ensured.asset.imageUrl
                  : undefined;
              } catch {
                return undefined;
              }
            }),
          );
          const assetUrls = assetResults.filter(
            (value): value is string => typeof value === 'string' && value.length > 0
          );
          plan.plan.assetUrls = assetUrls;
        }
      }

      onRefreshWorldState?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Structured combat effect failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulateStructuredEffect = async () => {
    if (!selectedCapabilityId || !combatState?.storyId) return;

    const capability = capabilities.find((item) => item.id === selectedCapabilityId);
    const capabilityEffect = capability?.effectDefinition;

    const definition: CombatEffectDefinition = capabilityEffect
      ? {
          ...JSON.parse(JSON.stringify(capabilityEffect)),
          id: selectedCapabilityId + '_simulation',
          provenance: 'TACTICAL_COMBAT_SANDBOX',
        }
      : {
          id: selectedCapabilityId + '_simulation',
          name: capability?.name || 'Simulation',
          resolutionMode: effectMode,
          scale: effectScale,
          actionCost: effectActionCost,
          targetingMode: effectTargetingMode,
          instanceCount:
            effectMode === 'MULTI_INSTANCE' || effectTargetingMode === 'PER_INSTANCE'
              ? effectCount
              : undefined,
          attackFormula: effectAttackFormula,
          saveFormula: effectAttackFormula,
          damageFormula: effectDamageFormula,
          damageType: effectDamageType,
          savingThrowAbility: effectSaveAbility,
          difficultyClass: effectDifficultyClass,
          halfDamageOnSave: true,
          rangeCells: effectRangeCells,
          requiresLineOfSight: true,
          outcome:
            effectMode === 'OUTCOME' || effectMode === 'WORLD_EFFECT'
              ? effectOutcome
              : undefined,
          outcomePayload:
            effectMode === 'WORLD_EFFECT'
              ? { scopeId: combatState.storyId }
              : undefined,
          provenance: 'TACTICAL_COMBAT_SANDBOX',
        };

    try {
      setActionLoading(true);
      setErrorMsg(null);
      const simulation = await apiClient.simulateCombatEffect(
        combatState.storyId,
        definition,
        selectedTargetId ? [selectedTargetId] : [],
        { seeds: [101, 202, 303, 404, 505], capabilityId: selectedCapabilityId || undefined }
      );
      setEffectSimulation(simulation);
    } catch (err: any) {
      setErrorMsg(err.message || 'Combat simulation failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReplay = async () => {
    if (!combatState?.storyId || !selectedReplayId) return;
    try {
      setReplayLoading(true);
      setErrorMsg(null);
      const result = await apiClient.replayCombatAction(combatState.storyId, selectedReplayId);
      setReplayResult(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Combat replay failed.');
    } finally {
      setReplayLoading(false);
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
  const actorCanAct = Boolean(
    currentActor &&
    !currentActor.isDead &&
    currentActor.hpCurrent > 0 &&
    !currentActor.conditions.includes('Unconscious')
  );

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

          {currentActor?.usesDeathSaves && currentActor.hpCurrent <= 0 && !currentActor.isDead && (
            <div className="col-span-2 sm:col-span-4 p-3 bg-red-950/20 border border-red-900/40 rounded-xl">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase font-mono tracking-wider text-red-300">Death Saves</span>
                <span className="text-xs font-mono text-stone-300">
                  {currentActor.deathSaveState?.successes ?? 0} successes • {currentActor.deathSaveState?.failures ?? 0} failures
                </span>
              </div>
              <div className="mt-1 text-[11px] text-stone-400">
                {currentActor.deathSaveState?.stable
                  ? 'Stable at 0 HP. Healing is required to regain consciousness.'
                  : 'Unconscious at 0 HP. A death save is resolved at the start of the character’s turn.'}
              </div>
            </div>
          )}

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
                    if (isPlayerTurn && actorCanAct && currentActor && !participant && movementRemaining > 0 && !actionLoading) {
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

          {effectResult?.animationPlan && (
            <div className="w-full max-w-[480px]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-stone-500">Presentation</span>
                <div className="flex gap-1 overflow-x-auto">
                  {(['FULL', 'FAST', 'TEXT', 'LOG'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPresentationMode(mode)}
                      className={
                        'shrink-0 rounded border px-2 py-1 text-[9px] font-mono ' +
                        (presentationMode === mode
                          ? 'border-violet-500/60 bg-violet-500/10 text-violet-200'
                          : 'border-stone-800 bg-stone-950 text-stone-500')
                      }
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <CombatAnimationLayer
                key={effectResult.animationPlan.id}
                plan={effectResult.animationPlan}
                instances={effectResult.instances || []}
                presentationMode={presentationMode}
              />
            </div>
          )}

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
                onChange={(e) => {
                  const next = e.target.value;
                  setSelectedTargetId(next);
                  setSelectedTargetIds(next ? [next] : []);
                }}
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

            {(() => {
              const selectedCapability = capabilities.find((item) => item.id === selectedCapabilityId);
              const mode = selectedCapability?.effectDefinition?.targetingMode;
              const needsMultipleTargets = mode === 'MULTI_TARGET' || mode === 'PER_INSTANCE' || mode === 'CHAIN' || mode === 'ALL_IN_AREA';
              if (!needsMultipleTargets) return null;
              return (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-violet-300 font-mono">
                    Effect Targets
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {combatState?.participants.map((participant) => {
                      const checked = selectedTargetIds.includes(participant.id);
                      return (
                        <label key={participant.id} className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-950/60 px-2 py-1.5 text-[10px] text-stone-300">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={participant.isDead}
                            onChange={(event) => {
                              setSelectedTargetIds((current) => {
                                const next = event.target.checked
                                  ? Array.from(new Set([...current, participant.id]))
                                  : current.filter((id) => id !== participant.id);
                                if (participant.id === selectedTargetId && !event.target.checked) {
                                  setSelectedTargetId(next[0] || '');
                                } else if (!selectedTargetId && next[0]) {
                                  setSelectedTargetId(next[0]);
                                }
                                return next;
                              });
                            }}
                            className="accent-violet-500"
                          />
                          <span className="truncate">{participant.name}</span>
                          <span className="ml-auto text-stone-500 font-mono">{participant.hpCurrent}/{participant.hpMax}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Core D&D Actions */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                id="combat-dash-btn"
                onClick={() => handleCoreCombatAction('DASH')}
                disabled={actionLoading || !isPlayerTurn || !actorCanAct || !actionAvailable || combatState?.victory || combatState?.defeat}
                className="py-2 px-2 rounded-lg bg-amber-950/70 hover:bg-amber-900 text-amber-100 text-[11px] font-semibold border border-amber-800/60 transition disabled:opacity-50"
                title="Dash: spend your Action to gain additional movement equal to Speed."
              >
                Dash
              </button>
              <button
                id="combat-dodge-btn"
                onClick={() => handleCoreCombatAction('DODGE')}
                disabled={actionLoading || !isPlayerTurn || !actorCanAct || !actionAvailable || combatState?.victory || combatState?.defeat}
                className="py-2 px-2 rounded-lg bg-blue-950/70 hover:bg-blue-900 text-blue-100 text-[11px] font-semibold border border-blue-800/60 transition disabled:opacity-50"
                title="Dodge: attacks against you have disadvantage and your Dexterity saves have advantage."
              >
                Dodge
              </button>
              <button
                id="combat-disengage-btn"
                onClick={() => handleCoreCombatAction('DISENGAGE')}
                disabled={actionLoading || !isPlayerTurn || !actorCanAct || !actionAvailable || combatState?.victory || combatState?.defeat}
                className="py-2 px-2 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 text-[11px] font-semibold border border-stone-700 transition disabled:opacity-50"
                title="Disengage: prevents opportunity attacks from your movement."
              >
                Disengage
              </button>
            </div>

            {/* Standard Attack Button */}
            <div className="pt-1">
              <button
                id="combat-attack-btn"
                onClick={handleAttack}
                disabled={actionLoading || !isPlayerTurn || !actorCanAct || !actionAvailable || combatState?.victory || combatState?.defeat}
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
                disabled={actionLoading || !isPlayerTurn || !actorCanAct || (
                  (selectedCapability?.effectDefinition?.actionCost === 'BONUS_ACTION'
                    ? !turnResources?.bonusActionAvailable
                    : selectedCapability?.effectDefinition?.actionCost === 'REACTION'
                      ? !turnResources?.reactionAvailable
                      : selectedCapability?.effectDefinition?.actionCost === 'FREE'
                        ? false
                        : !actionAvailable)
                ) || combatState?.victory || combatState?.defeat}
                className="w-full py-2 px-3 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-100 text-xs font-semibold flex items-center justify-center gap-2 border border-cyan-700/60 transition disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>Cast Power In Combat</span>
              </button>
            </div>

            <div className="space-y-3 pt-2 border-t border-stone-800">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-medium text-violet-300">Combat Effect Sandbox</div>
                  <div className="text-[10px] text-stone-500">Live execution uses the capability's authoritative definition; advanced fields are simulation-only.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancedEffectOpen((open) => !open)}
                  className="px-2 py-1 rounded border border-violet-800/60 bg-violet-950/30 text-[10px] text-violet-200"
                >
                  {advancedEffectOpen ? 'Hide' : 'Open'}
                </button>
              </div>
              {effectSimulation && advancedEffectOpen && (
                <div className="space-y-2 p-3 bg-violet-950/20 rounded-lg border border-violet-900/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-violet-300">Sandbox Result</span>
                    <span className={
                      'text-[10px] font-mono ' +
                      (effectSimulation.success ? 'text-emerald-300' : 'text-red-300')
                    }>
                      {effectSimulation.success ? 'SIMULATED' : 'REJECTED'}
                    </span>
                  </div>
                  {effectSimulation.authority && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[9px] font-mono">
                      {[
                        ['Schema', effectSimulation.authority.structurallyValid],
                        ['Rules', effectSimulation.authority.rulesLegal],
                        ['Source', effectSimulation.authority.sourceAuthorized],
                        ['World', effectSimulation.authority.worldAuthorized],
                        ['Safe', effectSimulation.authority.simulatable],
                      ].map(([label, ok]) => (
                        <div key={String(label)} className="px-2 py-1 rounded bg-stone-950 border border-stone-800 text-stone-400">
                          <span className={ok ? 'text-emerald-300' : 'text-red-300'}>{String(label)}</span>
                          <span className="ml-1">{ok ? '✓' : '✕'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {effectSimulation.presentation?.summary && (
                    <p className="text-[10px] text-stone-400">{effectSimulation.presentation.summary}</p>
                  )}
                  {effectSimulation.errorReason && (
                    <p className="text-[10px] text-red-300">{effectSimulation.errorReason}</p>
                  )}
                </div>
              )}

              {advancedEffectOpen && (
                <div className="space-y-2 p-3 bg-stone-950/70 rounded-lg border border-stone-800">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] text-stone-500">Resolution
                      <select value={effectMode} onChange={(e) => setEffectMode(e.target.value as CombatEffectDefinition['resolutionMode'])} className="mt-1 w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200">
                        <option value="SINGLE_ATTACK">Single Attack</option>
                        <option value="MULTI_INSTANCE">Multi-Instance</option>
                        <option value="SAVE">Saving Throw</option>
                        <option value="AREA">Area Effect</option>
                        <option value="CHAIN">Chain</option>
                        <option value="SEQUENCE">Sequence</option>
                        <option value="OUTCOME">Semantic Outcome</option>
                        <option value="WORLD_EFFECT">World Effect</option>
                      </select>
                    </label>
                    <label className="text-[10px] text-stone-500">Instances
                      <input type="number" min={1} max={50} value={effectCount} onChange={(e) => setEffectCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="mt-1 w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="text-[10px] text-stone-500">Targeting
                      <select value={effectTargetingMode} onChange={(e) => setEffectTargetingMode(e.target.value as CombatEffectDefinition['targetingMode'])} className="mt-1 w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200">
                        <option value="ONE_TARGET">One Target</option>
                        <option value="MULTI_TARGET">Multiple Targets</option>
                        <option value="PER_INSTANCE">Per Instance</option>
                        <option value="ALL_IN_AREA">Area</option>
                        <option value="CHAIN">Chain</option>
                      </select>
                    </label>
                    <label className="text-[10px] text-stone-500">Action Cost
                      <select value={effectActionCost} onChange={(e) => setEffectActionCost(e.target.value as CombatEffectDefinition['actionCost'])} className="mt-1 w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200">
                        <option value="ACTION">Action</option>
                        <option value="BONUS_ACTION">Bonus Action</option>
                        <option value="REACTION">Reaction</option>
                        <option value="FREE">Free</option>
                      </select>
                    </label>
                    <label className="text-[10px] text-stone-500">Scale
                      <select value={effectScale} onChange={(e) => setEffectScale(e.target.value as CombatEffectDefinition['scale'])} className="mt-1 w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200">
                        <option value="PERSON">Person</option>
                        <option value="GROUP">Group</option>
                        <option value="ENCOUNTER">Encounter</option>
                        <option value="STRUCTURE">Structure</option>
                        <option value="DISTRICT">District</option>
                        <option value="CITY">City</option>
                        <option value="REGION">Region</option>
                        <option value="PLANET">Planet</option>
                        <option value="COSMIC">Cosmic</option>
                      </select>
                    </label>
                    <label className="text-[10px] text-stone-500">Range
                      <input type="number" min={0} max={1000} value={effectRangeCells} onChange={(e) => setEffectRangeCells(Math.max(0, Number(e.target.value) || 0))} className="mt-1 w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200" />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input aria-label="Attack formula" value={effectAttackFormula} onChange={(e) => setEffectAttackFormula(e.target.value)} className="px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200 font-mono" placeholder="1d20" />
                    <input aria-label="Damage formula" value={effectDamageFormula} onChange={(e) => setEffectDamageFormula(e.target.value)} className="px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200 font-mono" placeholder="1d8" />
                    <input aria-label="Damage type" value={effectDamageType} onChange={(e) => setEffectDamageType(e.target.value)} className="px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200" placeholder="radiant" />
                  </div>
                  {(effectMode === 'SAVE' || effectMode === 'AREA') && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-stone-500">Save
                        <select value={effectSaveAbility} onChange={(e) => setEffectSaveAbility(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200">
                          <option>STR</option><option>DEX</option><option>CON</option><option>INT</option><option>WIS</option><option>CHA</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-stone-500">DC
                        <input type="number" min={1} max={60} value={effectDifficultyClass} onChange={(e) => setEffectDifficultyClass(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} className="mt-1 w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200" />
                      </label>
                    </div>
                  )}
                  {(effectMode === 'OUTCOME' || effectMode === 'WORLD_EFFECT') && (
                    <label className="text-[10px] text-stone-500 block">Semantic Outcome
                      <select value={effectOutcome || 'INSTANT_DEFEAT'} onChange={(e) => setEffectOutcome(e.target.value as CombatEffectDefinition['outcome'])} className="mt-1 w-full px-2 py-1.5 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-200">
                        <option value="INSTANT_DEFEAT">Instant Defeat</option>
                        <option value="ERASE_FROM_WORLD">Erase From World</option>
                        <option value="DOWNED">Downed</option>
                        <option value="BANISHED">Banished</option>
                        <option value="TELEPORTED">Teleported</option>
                        <option value="TRANSFORMED">Transformed</option>
                        <option value="SEALED">Sealed</option>
                        <option value="SUMMONED">Summoned</option>
                        <option value="RESOURCE_GRANTED">Resource Granted</option>
                        <option value="RESOURCE_REMOVED">Resource Removed</option>
                        <option value="WORLD_STATE_CHANGED">World State Changed</option>
                      </select>
                    </label>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={handleStructuredEffect} disabled={actionLoading || !isPlayerTurn || !actorCanAct || !actionAvailable || (((effectTargetingMode === 'ONE_TARGET' || effectTargetingMode === 'PER_INSTANCE') && !selectedTargetId)) || !selectedCapabilityId} className="py-2 px-2 rounded bg-violet-900/70 hover:bg-violet-800 text-violet-100 border border-violet-700 text-[11px] font-semibold disabled:opacity-50">Resolve Effect</button>
                    <button type="button" onClick={handleSimulateStructuredEffect} disabled={actionLoading || (((effectTargetingMode === 'ONE_TARGET' || effectTargetingMode === 'PER_INSTANCE') && !selectedTargetId)) || !selectedCapabilityId} className="py-2 px-2 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-[11px] font-semibold disabled:opacity-50">Simulate</button>
                  </div>
                  {effectResult && (
                    <div className="p-2 rounded bg-stone-900 border border-stone-800 text-[10px] text-stone-300 space-y-1">
                      <div className="text-violet-300 font-semibold">Last Effect</div>
                      <div>Instances: {effectResult.instances?.length ?? 0} • Damage: {effectResult.totalDamage ?? 0}</div>
                      {effectResult.animationPlan && <div>Animation: <span className="text-stone-400">{effectResult.animationPlan.composition}</span></div>}
                    </div>
                  )}
                  {effectSimulation?.summary && (
                    <div className="p-2 rounded bg-stone-900 border border-stone-800 text-[10px] text-stone-400">
                      Simulation — avg {Number(effectSimulation.summary.averageDamage || 0).toFixed(1)} • min {effectSimulation.summary.minDamage} • max {effectSimulation.summary.maxDamage}
                    </div>
                  )}
                </div>
              )}
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

          {/* Canonical Replay Browser */}
          <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-serif font-bold text-stone-200">Canonical Combat Replay</h4>
                <p className="text-[10px] text-stone-500">
                  Replays resolve from the stored canonical state and never mutate the live encounter.
                </p>
              </div>
              <span className="text-[9px] font-mono text-stone-600">{combatReplays.length} stored</span>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedReplayId}
                onChange={(e) => {
                  setSelectedReplayId(e.target.value);
                  setReplayResult(null);
                }}
                disabled={!combatReplays.length || replayLoading}
                className="min-w-0 flex-1 px-2 py-1.5 bg-stone-950 border border-stone-700 rounded-lg text-[10px] text-stone-300 font-mono"
              >
                <option value="">-- Select recorded action --</option>
                {combatReplays.slice().reverse().map((replay) => (
                  <option key={replay.id} value={replay.id}>
                    R{replay.turnNumber} • {replay.definition?.name || replay.actionId} • {replay.resultSignature?.instanceCount ?? 0} instance(s)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleReplay}
                disabled={!selectedReplayId || replayLoading}
                className="px-3 py-1.5 rounded-lg bg-violet-900/70 hover:bg-violet-800 text-violet-100 border border-violet-700 text-[10px] font-semibold disabled:opacity-50"
              >
                {replayLoading ? 'Replaying…' : 'Replay'}
              </button>
            </div>
            {replayResult && (
              <div className="rounded-lg border border-stone-800 bg-stone-950 p-2 text-[10px] font-mono">
                <span className={replayResult.identical ? 'text-emerald-300' : 'text-red-300'}>
                  {replayResult.identical ? '✓ Deterministic match' : '✕ Replay mismatch'}
                </span>
                {replayResult.errorReason && <span className="ml-2 text-red-300">{replayResult.errorReason}</span>}
              </div>
            )}
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
