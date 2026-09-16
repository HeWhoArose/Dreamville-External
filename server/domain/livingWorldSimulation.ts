import { WorldTimestamp } from './types';
import type { GeographyGraph } from './geographyGraph';

export interface EntityPhysiology {
  entityId: string;
  hunger: number; // 0 to 100
  thirst: number; // 0 to 100
  fatigue: number; // 0 to 100
  pain: number; // 0 to 100
  stress: number; // 0 to 100
  morale: number; // 0 to 100
  hungerRatePerHour: number; // Entity specific
  thirstRatePerHour: number;
  fatigueRatePerHour: number;
  lastFedTimestamp: WorldTimestamp;
  lastRestedTimestamp: WorldTimestamp;
  personalityModulation: 'stoic' | 'expressive' | 'complaining' | 'comedic';
}

export type ScheduledEventKind = 'TOURNAMENT' | 'ASTRONOMICAL_SUNRISE' | 'WAR_PROGRESSION' | 'MARKET_DAY';

export interface ScheduledWorldEvent {
  id: string;
  kind: ScheduledEventKind;
  name: string;
  locationId: string;
  triggerTimestamp: WorldTimestamp;
  deadlineTimestamp?: WorldTimestamp;
  isResolved: boolean;
  status: 'pending' | 'active' | 'completed' | 'missed';
  consequenceSummary?: string;
}

export type NpcActivity =
  | 'sleeping'
  | 'working'
  | 'eating'
  | 'patrolling'
  | 'relaxing'
  | 'traveling'
  | 'idle';

export interface DailyScheduleEntry {
  id: string;
  startHour: number; // 0 to 23
  startMinute?: number; // 0 to 59
  endHour: number; // 0 to 23
  endMinute?: number; // 0 to 59
  activity: NpcActivity;
  targetLocationId: string;
  fallbackActivity?: NpcActivity;
  fallbackLocationId?: string;
}

export interface NpcScheduleProfile {
  npcId: string;
  name: string;
  currentLocationId: string;
  currentActivity: NpcActivity;
  entries: DailyScheduleEntry[];
  fallbackActivity: NpcActivity;
  fallbackLocationId: string;
}

export type SimulationTier = 'ACTIVE' | 'NEARBY' | 'DISTANT' | 'OFF_SCREEN';

export interface LivingWorldSimulationSummary {
  elapsedSeconds: number;
  elapsedHours: number;
  currentTimestamp: WorldTimestamp;
  physiologies: EntityPhysiology[];
  npcMovements: {
    npcId: string;
    fromLocationId: string;
    toLocationId: string;
    activity: NpcActivity;
  }[];
  triggeredEvents: ScheduledWorldEvent[];
  missedEvents: ScheduledWorldEvent[];
  completedEvents: ScheduledWorldEvent[];
  simulationTiers: Record<string, SimulationTier>;
}

export interface LivingWorldExportState {
  physiologies: EntityPhysiology[];
  scheduledEvents: ScheduledWorldEvent[];
  npcProfiles: NpcScheduleProfile[];
}

/**
 * Checks if current time is within a schedule window [start, end), handling day rollover (e.g. 22:00 to 06:00).
 */
export function isTimeInScheduleWindow(
  startHour: number,
  startMinute: number = 0,
  endHour: number,
  endMinute: number = 0,
  currentHour: number,
  currentMinute: number = 0
): boolean {
  const startMin = startHour * 60 + startMinute;
  const endMin = endHour * 60 + endMinute;
  const curMin = currentHour * 60 + currentMinute;

  if (startMin <= endMin) {
    return curMin >= startMin && curMin < endMin;
  } else {
    // Crosses midnight, e.g. 22:00 to 06:00
    return curMin >= startMin || curMin < endMin;
  }
}

/**
 * LivingWorldSimulation
 * Implements DreamBook Challenge 10 & §294, §295, §306, §337, §342, §344, §346, §347.
 */
export class LivingWorldSimulation {
  private physiologies: Map<string, EntityPhysiology> = new Map();
  private scheduledEvents: Map<string, ScheduledWorldEvent> = new Map();
  private npcProfiles: Map<string, NpcScheduleProfile> = new Map();

  public registerEntityPhysiology(phys: EntityPhysiology): void {
    this.physiologies.set(phys.entityId, { ...phys });
  }

  public getEntityPhysiology(entityId: string): EntityPhysiology | undefined {
    const p = this.physiologies.get(entityId);
    return p ? JSON.parse(JSON.stringify(p)) : undefined;
  }

  public getAllPhysiologies(): EntityPhysiology[] {
    return Array.from(this.physiologies.values()).map((p) => JSON.parse(JSON.stringify(p)));
  }

  public scheduleEvent(ev: ScheduledWorldEvent): void {
    this.scheduledEvents.set(ev.id, { ...ev });
  }

  public getScheduledEvents(): ScheduledWorldEvent[] {
    return Array.from(this.scheduledEvents.values()).map((e) => ({ ...e }));
  }

  public registerNpcSchedule(profile: NpcScheduleProfile): void {
    this.npcProfiles.set(profile.npcId, {
      ...profile,
      entries: profile.entries.map((e) => ({ ...e })),
    });
  }

  public getNpcSchedule(npcId: string): NpcScheduleProfile | undefined {
    const prof = this.npcProfiles.get(npcId);
    return prof
      ? {
          ...prof,
          entries: prof.entries.map((e) => ({ ...e })),
        }
      : undefined;
  }

  public getAllNpcSchedules(): NpcScheduleProfile[] {
    return Array.from(this.npcProfiles.values()).map((p) => ({
      ...p,
      entries: p.entries.map((e) => ({ ...e })),
    }));
  }

  /**
   * Deterministically determines the active schedule entry for a profile at current time.
   */
  public determineActiveScheduleEntry(
    profile: NpcScheduleProfile,
    hour: number,
    minute: number = 0
  ): DailyScheduleEntry | undefined {
    for (const entry of profile.entries) {
      if (
        isTimeInScheduleWindow(
          entry.startHour,
          entry.startMinute ?? 0,
          entry.endHour,
          entry.endMinute ?? 0,
          hour,
          minute
        )
      ) {
        return { ...entry };
      }
    }
    return undefined;
  }

  /**
   * Evaluates canonical simulation fidelity tier based on player location and GeographyGraph topology (DEF-CH10-02).
   */
  public evaluateSimulationTier(
    entityLocationId: string,
    playerLocationId: string,
    geography: GeographyGraph
  ): SimulationTier {
    if (entityLocationId === playerLocationId) {
      return 'ACTIVE';
    }

    // Check if directly connected by an unblocked route edge
    const outgoing = geography.getOutgoingEdges(playerLocationId);
    const directEdge = outgoing.find((e) => e.toLocationId === entityLocationId && !e.isBlocked);
    if (directEdge) {
      return 'NEARBY';
    }

    // Check if reachable anywhere within canonical topology
    const path = geography.findPath(playerLocationId, entityLocationId);
    if (path.found) {
      return 'DISTANT';
    }

    return 'OFF_SCREEN';
  }

  /**
   * Advances physiology when elapsed hours pass (e.g. travel or rest)
   * Entity-specific rates prevent identical cookie-cutter hunger (DreamBook §294.2)
   */
  public advanceElapsedHours(hours: number, currentClock: WorldTimestamp): void {
    for (const phys of this.physiologies.values()) {
      phys.hunger = Math.min(100, phys.hunger + Math.floor(hours * phys.hungerRatePerHour));
      phys.thirst = Math.min(100, phys.thirst + Math.floor(hours * phys.thirstRatePerHour));
      phys.fatigue = Math.min(100, phys.fatigue + Math.floor(hours * phys.fatigueRatePerHour));
    }

    // Resolve scheduled world events and deadlines against current clock (DreamBook §337, §342, §344)
    for (const ev of this.scheduledEvents.values()) {
      if (ev.isResolved) continue;

      if (currentClock.totalElapsedSeconds >= ev.triggerTimestamp.totalElapsedSeconds) {
        if (ev.deadlineTimestamp && currentClock.totalElapsedSeconds > ev.deadlineTimestamp.totalElapsedSeconds) {
          ev.status = 'missed';
          ev.isResolved = true;
          ev.consequenceSummary = `${ev.name} deadline passed before arrival; event missed.`;
        } else {
          ev.status = 'active';
          ev.consequenceSummary = `${ev.name} triggered at world time.`;
        }
      }
    }
  }

  /**
   * Authoritatively advances the entire living world simulation across an elapsed interval (DEF-CH10-03).
   * Executes physiology decay, NPC daily schedules, autonomous movement via GeographyGraph,
   * scheduled events, deadlines, and calculates simulation fidelity tiers.
   */
  public advanceSimulation(params: {
    elapsedSeconds: number;
    currentClock: WorldTimestamp;
    playerLocationId: string;
    geography: GeographyGraph;
  }): LivingWorldSimulationSummary {
    const elapsedHours = params.elapsedSeconds / 3600;

    // 1. Advance physiology deterministically using entity-specific rates
    for (const phys of this.physiologies.values()) {
      phys.hunger = Math.min(100, phys.hunger + Math.floor(elapsedHours * phys.hungerRatePerHour));
      phys.thirst = Math.min(100, phys.thirst + Math.floor(hoursToAdvanceClamped(elapsedHours, phys.thirstRatePerHour)));
      phys.fatigue = Math.min(100, phys.fatigue + Math.floor(hoursToAdvanceClamped(elapsedHours, phys.fatigueRatePerHour)));
    }

    // 2. Resolve scheduled world events & deadlines deterministically ordered by trigger time
    const triggeredEvents: ScheduledWorldEvent[] = [];
    const missedEvents: ScheduledWorldEvent[] = [];
    const completedEvents: ScheduledWorldEvent[] = [];

    const sortedEvents = Array.from(this.scheduledEvents.values()).sort(
      (a, b) => a.triggerTimestamp.totalElapsedSeconds - b.triggerTimestamp.totalElapsedSeconds
    );

    for (const ev of sortedEvents) {
      if (ev.isResolved) continue;

      if (params.currentClock.totalElapsedSeconds >= ev.triggerTimestamp.totalElapsedSeconds) {
        if (ev.deadlineTimestamp && params.currentClock.totalElapsedSeconds > ev.deadlineTimestamp.totalElapsedSeconds) {
          if (ev.status !== 'missed') {
            ev.status = 'missed';
            ev.isResolved = true;
            ev.consequenceSummary = `${ev.name} deadline passed before arrival; event missed.`;
            missedEvents.push({ ...ev });
          }
        } else {
          if (ev.status !== 'active') {
            ev.status = 'active';
            ev.consequenceSummary = `${ev.name} triggered at world time.`;
            triggeredEvents.push({ ...ev });
          }
        }
      }
    }

    // 3. Autonomous NPC Schedules & Movement across GeographyGraph (DEF-CH10-01, DEF-CH10-06)
    const npcMovements: {
      npcId: string;
      fromLocationId: string;
      toLocationId: string;
      activity: NpcActivity;
    }[] = [];

    for (const profile of this.npcProfiles.values()) {
      const activeEntry = this.determineActiveScheduleEntry(
        profile,
        params.currentClock.hour,
        params.currentClock.minute
      );

      const targetLocationId = activeEntry ? activeEntry.targetLocationId : profile.fallbackLocationId;
      const targetActivity = activeEntry ? activeEntry.activity : profile.fallbackActivity;

      if (profile.currentLocationId !== targetLocationId) {
        // Target location exists in GeographyGraph?
        const destNode = params.geography.getNode(targetLocationId);
        if (!destNode) {
          // Invalid destination; retain location, assign fallback activity
          profile.currentActivity = activeEntry?.fallbackActivity || profile.fallbackActivity || 'idle';
        } else {
          // Valid path exists in GeographyGraph?
          const pathRes = params.geography.findPath(profile.currentLocationId, targetLocationId);
          if (pathRes.found) {
            // Path confirmed. In aggregated milestone catch-up, reposition NPC deterministically
            const oldLoc = profile.currentLocationId;
            profile.currentLocationId = targetLocationId;
            profile.currentActivity = targetActivity;
            npcMovements.push({
              npcId: profile.npcId,
              fromLocationId: oldLoc,
              toLocationId: targetLocationId,
              activity: targetActivity,
            });
          } else {
            // Path is blocked or nonexistent; fallback behavior without topology mutation
            profile.currentActivity = activeEntry?.fallbackActivity || profile.fallbackActivity || 'idle';
          }
        }
      } else {
        // NPC is already at the target location for this time window
        profile.currentActivity = targetActivity;
      }
    }

    // 4. Calculate simulation fidelity tiers for all active entities (DEF-CH10-02)
    const simulationTiers: Record<string, SimulationTier> = {};

    for (const phys of this.physiologies.values()) {
      const npcProf = this.npcProfiles.get(phys.entityId);
      const entityLoc = npcProf ? npcProf.currentLocationId : params.playerLocationId;
      simulationTiers[phys.entityId] = this.evaluateSimulationTier(
        entityLoc,
        params.playerLocationId,
        params.geography
      );
    }

    for (const profile of this.npcProfiles.values()) {
      if (!simulationTiers[profile.npcId]) {
        simulationTiers[profile.npcId] = this.evaluateSimulationTier(
          profile.currentLocationId,
          params.playerLocationId,
          params.geography
        );
      }
    }

    return {
      elapsedSeconds: params.elapsedSeconds,
      elapsedHours,
      currentTimestamp: params.currentClock,
      physiologies: this.getAllPhysiologies(),
      npcMovements,
      triggeredEvents,
      missedEvents,
      completedEvents,
      simulationTiers,
    };
  }

  /**
   * Hunger-to-Narrative Conversion Rules (DreamBook §306)
   * Evaluates if a hunger cue should be surfaced in narrative without spamming every turn.
   */
  public evaluateHungerNarrativeCue(entityId: string): {
    shouldCue: boolean;
    cueStyle?: string;
    narrativePromptHint?: string;
  } {
    const phys = this.physiologies.get(entityId);
    if (!phys || phys.hunger < 75) {
      return { shouldCue: false };
    }

    let cueStyle = 'stomach_rumble';
    let hint = `${entityId}'s stomach grumbles faintly from hunger.`;

    if (phys.personalityModulation === 'stoic') {
      cueStyle = 'silent_endurance';
      hint = `${entityId} presses a hand to their ribs in subtle discomfort, masking hunger.`;
    } else if (phys.personalityModulation === 'comedic') {
      cueStyle = 'joking_complaint';
      hint = `${entityId} jokes wryly about their ribs echoing like an empty barrel.`;
    } else if (phys.personalityModulation === 'complaining') {
      cueStyle = 'vocal_grumble';
      hint = `${entityId} mutters bitterly about an empty belly and missed provisions.`;
    } else if (phys.personalityModulation === 'expressive') {
      cueStyle = 'dramatic_yearning';
      hint = `${entityId} groans dramatically, declaring their soul is as starved as their stomach.`;
    }

    return {
      shouldCue: true,
      cueStyle,
      narrativePromptHint: hint,
    };
  }

  /**
   * Werewolf Sunrise Transformation Evaluation (DreamBook §344 Golden Test)
   * Resolves transformation when world clock crosses local sunrise.
   */
  public evaluateSunriseCurse(params: {
    currentSeconds: number;
    sunriseSeconds: number;
    hasWerewolfCurse: boolean;
  }): {
    revertedToHuman: boolean;
    narrativeFact: string;
  } {
    if (params.hasWerewolfCurse && params.currentSeconds >= params.sunriseSeconds) {
      return {
        revertedToHuman: true,
        narrativeFact: 'The first ray of dawn crests the eastern crest; lupine features recede back into mortal human form.',
      };
    }
    return {
      revertedToHuman: false,
      narrativeFact: 'No transformation triggered; night remains unbroken.',
    };
  }

  /**
   * Lossless Campaign Archive Export (DEF-CH10-04)
   */
  public exportState(): LivingWorldExportState {
    return {
      physiologies: Array.from(this.physiologies.values()).map((p) => ({ ...p })),
      scheduledEvents: Array.from(this.scheduledEvents.values()).map((e) => ({ ...e })),
      npcProfiles: Array.from(this.npcProfiles.values()).map((p) => ({
        ...p,
        entries: p.entries.map((e) => ({ ...e })),
      })),
    };
  }

  /**
   * Lossless Campaign Archive Restore (DEF-CH10-04)
   */
  public importState(state: LivingWorldExportState): void {
    if (!state) return;
    this.physiologies.clear();
    this.scheduledEvents.clear();
    this.npcProfiles.clear();

    if (Array.isArray(state.physiologies)) {
      for (const p of state.physiologies) {
        this.physiologies.set(p.entityId, { ...p });
      }
    }
    if (Array.isArray(state.scheduledEvents)) {
      for (const e of state.scheduledEvents) {
        this.scheduledEvents.set(e.id, { ...e });
      }
    }
    if (Array.isArray(state.npcProfiles)) {
      for (const prof of state.npcProfiles) {
        this.npcProfiles.set(prof.npcId, {
          ...prof,
          entries: Array.isArray(prof.entries) ? prof.entries.map((e) => ({ ...e })) : [],
        });
      }
    }
  }
}

function hoursToAdvanceClamped(hours: number, rate: number): number {
  return hours * rate;
}

