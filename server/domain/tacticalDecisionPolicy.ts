import type { RulesProfile } from '../../src/types';
import { BattlefieldParticipant, CombatPerceptionOptions, DynamicHazardZone, TacticalCombatEngine } from './combatEngine';
import { rulesProfileEngine } from './rulesProfileEngine';
import { CapabilityEngine } from './capabilityEngine';

export type TacticalActionType = 'MOVE' | 'ATTACK' | 'CAST' | 'RETREAT' | 'DEFEND_ALLY' | 'END_TURN';

export type TacticalRole = 'VANGUARD' | 'REARGUARD' | 'SKIRMISHER' | 'SUPPORT';

export interface TacticalGroupMember {
  actorId: string;
  role: TacticalRole;
  priorityOrder?: number;
}

export interface TacticalGroupContext {
  groupId: string;
  team: 'player_allies' | 'enemies' | 'neutral';
  members: TacticalGroupMember[];
  focusTargetId?: string;
  groupObjective?: 'ASSAULT' | 'PROTECT_VIP' | 'RETREAT' | 'HOLD_LINE';
  vipActorId?: string;
}

export interface TacticalActionProposal {
  actorId: string;
  actionType: TacticalActionType;
  targetId?: string;
  targetPosition?: { x: number; y: number };
  capabilityId?: string;
  reason: string;
  role?: TacticalRole;
  priorityScore: number;
}

export interface TacticalExecutionResult {
  success: boolean;
  proposal: TacticalActionProposal;
  errorReason?: string;
  combatOutcome?: Record<string, unknown>;
}

/**
 * NpcTacticalDecisionPolicy
 * Production-ready CH3 Autonomous NPC Tactical Decision & Group Coordination Policy.
 * Evaluates current canonical state (health, position, threats, group roles, capabilities, epistemic perception).
 * Produces structured tactical action proposals without mutating combat state directly or inventing facts.
 */
export class NpcTacticalDecisionPolicy {
  /**
   * Evaluates canonical combat state and returns a deterministic TacticalActionProposal for an actor.
   */
  public static decide(params: {
    actorId: string;
    combatEngine: TacticalCombatEngine;
    capabilityEngine?: CapabilityEngine;
    groupContext?: TacticalGroupContext;
    perceptionOptions?: CombatPerceptionOptions;
  }): TacticalActionProposal {
    const { actorId, combatEngine, capabilityEngine, groupContext, perceptionOptions } = params;
    const actor = combatEngine.getParticipant(actorId);

    if (!actor || actor.isDead) {
      return {
        actorId,
        actionType: 'END_TURN',
        reason: 'Actor is not active or is deceased.',
        priorityScore: 0,
      };
    }

    // Incapacitating conditions check
    const incapacitating = ['Dead', 'Incapacitated', 'Paralyzed', 'Stunned', 'Asleep', 'Unconscious'];
    if (actor.conditions && actor.conditions.some((c) => incapacitating.includes(c))) {
      return {
        actorId,
        actionType: 'END_TURN',
        reason: `Actor is under incapacitating condition (${actor.conditions.join(', ')}).`,
        priorityScore: 0,
      };
    }

    // 1. Epistemic Target Acquisition: only consider living participants known to the actor
    const allParticipants = combatEngine.getParticipants();
    const isKnown = (p: BattlefieldParticipant) =>
      combatEngine.isParticipantKnownToActor(actorId, p, perceptionOptions);

    const knownParticipants = allParticipants.filter((p) => !p.isDead && isKnown(p));
    const knownAllies = knownParticipants.filter((p) => p.team === actor.team && p.id !== actorId);
    const knownEnemies = knownParticipants.filter(
      (p) => p.team !== actor.team && p.team !== 'neutral'
    );

    // If no hostile enemies are legitimately known, actor holds ground
    if (knownEnemies.length === 0) {
      return {
        actorId,
        actionType: 'END_TURN',
        reason: 'No hostile targets currently perceived within epistemic horizon.',
        priorityScore: 10,
      };
    }

    // 2. State & Threat Calculation
    const hpRatio = actor.hpCurrent / Math.max(1, actor.hpMax);
    const enemiesWithDistance = knownEnemies.map((enemy) => ({
      enemy,
      dist: Math.hypot(enemy.x - actor.x, enemy.y - actor.y),
    }));

    // Deterministic sort: closest distance ascending, then lower HP current, then deterministic ID
    enemiesWithDistance.sort((a, b) => {
      if (Math.abs(a.dist - b.dist) > 0.001) return a.dist - b.dist;
      if (a.enemy.hpCurrent !== b.enemy.hpCurrent) return a.enemy.hpCurrent - b.enemy.hpCurrent;
      return a.enemy.id.localeCompare(b.enemy.id);
    });

    const closestThreat = enemiesWithDistance[0];
    const threatDist = closestThreat ? closestThreat.dist : Infinity;

    // 3. Determine Group Role
    let assignedRole: TacticalRole = 'SKIRMISHER';
    if (groupContext) {
      const memberConfig = groupContext.members.find((m) => m.actorId === actorId);
      if (memberConfig) {
        assignedRole = memberConfig.role;
      }
    } else {
      // Emergent default role
      if (actor.hpMax >= 25 && actor.armorClass >= 14) {
        assignedRole = 'VANGUARD';
      } else if (actor.speedCells >= 5) {
        assignedRole = 'SKIRMISHER';
      } else {
        assignedRole = 'REARGUARD';
      }
    }

    // 4. Critical Health / Threat Condition (State-Driven Adaptation)
    // Low health (< 35%) and under direct threat
    if (hpRatio <= 0.35 && threatDist <= 3) {
      // Calculate safe retreat coordinates moving away from closest threat
      const retreatPos = this.calculateRetreatPosition(actor, closestThreat.enemy, allParticipants, combatEngine.getHazards());
      if (retreatPos && (retreatPos.x !== actor.x || retreatPos.y !== actor.y)) {
        return {
          actorId,
          actionType: 'RETREAT',
          targetPosition: retreatPos,
          role: assignedRole,
          reason: `Critical health condition (${actor.hpCurrent}/${actor.hpMax} HP, ${(hpRatio * 100).toFixed(0)}%); disengaging from ${closestThreat.enemy.name}.`,
          priorityScore: 90,
        };
      }
    }

    // 5. Group Role Coordination: REARGUARD / PROTECTOR guarding vulnerable ally or VIP
    if (assignedRole === 'REARGUARD' || groupContext?.groupObjective === 'PROTECT_VIP') {
      const vipId = groupContext?.vipActorId;
      const vulnerableAlly = knownAllies.find((ally) => (vipId ? ally.id === vipId : ally.hpCurrent / Math.max(1, ally.hpMax) <= 0.35));

      if (vulnerableAlly) {
        // Find enemy closest to vulnerable ally
        const enemiesNearAlly = knownEnemies.map((e) => ({
          enemy: e,
          distToAlly: Math.hypot(e.x - vulnerableAlly.x, e.y - vulnerableAlly.y),
          distToActor: Math.hypot(e.x - actor.x, e.y - actor.y),
        }));
        enemiesNearAlly.sort((a, b) => a.distToAlly - b.distToAlly || a.distToActor - b.distToActor || a.enemy.id.localeCompare(b.enemy.id));

        const targetThreat = enemiesNearAlly[0];
        if (targetThreat) {
          // If in melee range of target threat, attack it to peel
          if (targetThreat.distToActor <= 1.5) {
            return {
              actorId,
              actionType: 'ATTACK',
              targetId: targetThreat.enemy.id,
              role: assignedRole,
              reason: `Protecting vulnerable ally ${vulnerableAlly.name}; intercepting threat ${targetThreat.enemy.name}.`,
              priorityScore: 85,
            };
          }

          // Otherwise, reposition between vulnerable ally and threat
          const interceptPos = this.calculateInterceptPosition(actor, vulnerableAlly, targetThreat.enemy, allParticipants);
          if (interceptPos) {
            return {
              actorId,
              actionType: 'DEFEND_ALLY',
              targetId: vulnerableAlly.id,
              targetPosition: interceptPos,
              role: assignedRole,
              reason: `Establishing defensive guard position to shield ${vulnerableAlly.name} from ${targetThreat.enemy.name}.`,
              priorityScore: 80,
            };
          }
        }
      }
    }

    // 6. Target Selection (Group Focus Target or Priority Target)
    let selectedTarget = closestThreat.enemy;
    if (groupContext?.focusTargetId) {
      const focusEnemy = knownEnemies.find((e) => e.id === groupContext.focusTargetId);
      if (focusEnemy) {
        selectedTarget = focusEnemy;
      }
    } else if (assignedRole === 'SKIRMISHER') {
      // Skirmishers prioritize lowest current HP enemy in range
      const lowestHpEnemy = [...knownEnemies].sort((a, b) => a.hpCurrent - b.hpCurrent || a.id.localeCompare(b.id))[0];
      if (lowestHpEnemy) {
        selectedTarget = lowestHpEnemy;
      }
    }

    const distToTarget = Math.hypot(selectedTarget.x - actor.x, selectedTarget.y - actor.y);

    // 7. Check Available Capabilities (Canonical Resource Check)
    if (capabilityEngine) {
      const actorCaps = capabilityEngine.getActorCapabilities(actorId);
      const offensiveCap = actorCaps.find((c) => c.category === 'Combat' || c.category === 'Magic');
      const powerState = capabilityEngine.getPowerState(actorId);

      if (offensiveCap && powerState && (powerState.magicalEnergy ?? 0) >= 10 && (powerState.physicalStrain ?? 0) < 80) {
        // Range check for capability
        if (distToTarget <= 4.0) {
          return {
            actorId,
            actionType: 'CAST',
            targetId: selectedTarget.id,
            capabilityId: offensiveCap.id,
            role: assignedRole,
            reason: `Unleashing canonical capability ${offensiveCap.name} against prioritized target ${selectedTarget.name}.`,
            priorityScore: 75,
          };
        }
      }
    }

    // 8. Melee Attack Check
    if (distToTarget <= 1.5) {
      return {
        actorId,
        actionType: 'ATTACK',
        targetId: selectedTarget.id,
        role: assignedRole,
        reason: `Executing melee strike on adjacent target ${selectedTarget.name} (${selectedTarget.hpCurrent}/${selectedTarget.hpMax} HP).`,
        priorityScore: 70,
      };
    }

    // 9. Movement / Repositioning towards target within speed allowance
    const approachPos = this.calculateApproachPosition(actor, selectedTarget, allParticipants, combatEngine.getHazards());
    if (approachPos && (approachPos.x !== actor.x || approachPos.y !== actor.y)) {
      return {
        actorId,
        actionType: 'MOVE',
        targetPosition: approachPos,
        role: assignedRole,
        reason: `Advancing to engage target ${selectedTarget.name} (distance ${distToTarget.toFixed(1)} -> closing in).`,
        priorityScore: 60,
      };
    }

    // Fallback: End Turn
    return {
      actorId,
      actionType: 'END_TURN',
      role: assignedRole,
      reason: 'No valid movement or attack vectors available this round.',
      priorityScore: 10,
    };
  }

  /**
   * Executes a verified tactical proposal against canonical domain authorities.
   */
  public static executeDecidedAction(
    proposal: TacticalActionProposal,
    combatEngine: TacticalCombatEngine,
    capabilityEngine?: CapabilityEngine,
    rulesProfile?: RulesProfile
  ): TacticalExecutionResult {
    if (
      rulesProfile &&
      !rulesProfileEngine.allowsDndTacticalCombat(rulesProfile)
    ) {
      return {
        success: false,
        proposal,
        errorReason: 'The active rules profile does not permit the legacy D&D tactical combat engine.',
      };
    }

    switch (proposal.actionType) {
      case 'MOVE':
      case 'RETREAT':
      case 'DEFEND_ALLY': {
        if (!proposal.targetPosition) {
          return { success: false, proposal, errorReason: 'Target position missing for movement.' };
        }
        const moveRes = combatEngine.moveActor(proposal.actorId, proposal.targetPosition.x, proposal.targetPosition.y);
        return {
          success: moveRes.success,
          proposal,
          errorReason: moveRes.errorReason,
          combatOutcome: { movedTo: proposal.targetPosition },
        };
      }

      case 'ATTACK': {
        if (!proposal.targetId) {
          return { success: false, proposal, errorReason: 'Target ID missing for attack.' };
        }
        try {
          const attackRes = combatEngine.executeAttack(proposal.actorId, proposal.targetId);
          return {
            success: attackRes.success,
            proposal,
            errorReason: attackRes.errorReason,
            combatOutcome: attackRes,
          };
        } catch (err: unknown) {
          return {
            success: false,
            proposal,
            errorReason: err instanceof Error ? err.message : String(err),
          };
        }
      }

      case 'CAST': {
        if (!proposal.targetId || !proposal.capabilityId) {
          return { success: false, proposal, errorReason: 'Target ID or Capability ID missing for cast.' };
        }
        const cap = capabilityEngine?.getCapability(proposal.capabilityId);
        if (!cap) {
          return { success: false, proposal, errorReason: `Capability ${proposal.capabilityId} not recognized.` };
        }

        // Adjudicate resource cost
        const adj = capabilityEngine?.adjudicate({
          actorId: proposal.actorId,
          intendedCapabilityId: proposal.capabilityId,
          requestedScale: 'Local',
          actionDescription: `Tactical NPC cast of ${cap.name}`,
        });

        if (adj && !adj.approved) {
          return { success: false, proposal, errorReason: `Capability invocation denied: ${adj.rejectionReason}` };
        }

        const castRes = combatEngine.executeCapabilityCast({
          actorId: proposal.actorId,
          targetId: proposal.targetId,
          capabilityName: cap.name,
          powerTier: cap.powerTier,
          category: cap.category,
          actionType: cap.actionType || 'action',
        });

        return {
          success: castRes.success,
          proposal,
          errorReason: castRes.success ? undefined : castRes.headline,
          combatOutcome: castRes,
        };
      }

      case 'END_TURN':
      default: {
        return {
          success: true,
          proposal,
          combatOutcome: { turnEnded: true },
        };
      }
    }
  }

  // --- Helper Spatial Path & Positioning Algorithms ---

  private static calculateRetreatPosition(
    actor: BattlefieldParticipant,
    threat: BattlefieldParticipant,
    allParticipants: BattlefieldParticipant[],
    hazards: DynamicHazardZone[]
  ): { x: number; y: number } | null {
    const dx = actor.x - threat.x;
    const dy = actor.y - threat.y;
    const len = Math.hypot(dx, dy) || 1;
    const stepX = Math.round((dx / len) * Math.min(actor.speedCells, 3));
    const stepY = Math.round((dy / len) * Math.min(actor.speedCells, 3));

    const candidateX = Math.max(0, actor.x + stepX);
    const candidateY = Math.max(0, actor.y + stepY);

    if (this.isCellValid(candidateX, candidateY, actor.id, allParticipants, hazards)) {
      return { x: candidateX, y: candidateY };
    }

    // Try adjacent candidate offsets
    const offsets = [
      { x: stepX, y: 0 },
      { x: 0, y: stepY },
      { x: stepX > 0 ? stepX - 1 : stepX + 1, y: stepY },
      { x: stepX, y: stepY > 0 ? stepY - 1 : stepY + 1 },
    ];

    for (const off of offsets) {
      const cx = Math.max(0, actor.x + off.x);
      const cy = Math.max(0, actor.y + off.y);
      if (this.isCellValid(cx, cy, actor.id, allParticipants, hazards)) {
        return { x: cx, y: cy };
      }
    }

    return null;
  }

  private static calculateApproachPosition(
    actor: BattlefieldParticipant,
    target: BattlefieldParticipant,
    allParticipants: BattlefieldParticipant[],
    hazards: DynamicHazardZone[]
  ): { x: number; y: number } | null {
    const dx = target.x - actor.x;
    const dy = target.y - actor.y;
    const totalDist = Math.hypot(dx, dy);

    if (totalDist <= 1.5) return { x: actor.x, y: actor.y };

    const maxMove = Math.min(actor.speedCells, Math.max(1, Math.floor(totalDist - 1)));
    const stepX = Math.round((dx / totalDist) * maxMove);
    const stepY = Math.round((dy / totalDist) * maxMove);

    const targetX = actor.x + stepX;
    const targetY = actor.y + stepY;

    if (this.isCellValid(targetX, targetY, actor.id, allParticipants, hazards)) {
      return { x: targetX, y: targetY };
    }

    // Fallback: search surrounding cells
    for (let radius = 1; radius <= actor.speedCells; radius++) {
      for (let ox = -radius; ox <= radius; ox++) {
        for (let oy = -radius; oy <= radius; oy++) {
          if (Math.hypot(ox, oy) <= actor.speedCells) {
            const cx = actor.x + ox;
            const cy = actor.y + oy;
            if (this.isCellValid(cx, cy, actor.id, allParticipants, hazards)) {
              // Pick candidate that minimizes distance to target
              const newDist = Math.hypot(target.x - cx, target.y - cy);
              if (newDist < totalDist) {
                return { x: cx, y: cy };
              }
            }
          }
        }
      }
    }

    return null;
  }

  private static calculateInterceptPosition(
    actor: BattlefieldParticipant,
    ally: BattlefieldParticipant,
    threat: BattlefieldParticipant,
    allParticipants: BattlefieldParticipant[]
  ): { x: number; y: number } | null {
    const midX = Math.round((ally.x + threat.x) / 2);
    const midY = Math.round((ally.y + threat.y) / 2);

    const distToMid = Math.hypot(midX - actor.x, midY - actor.y);
    if (distToMid <= actor.speedCells && this.isCellValid(midX, midY, actor.id, allParticipants, [])) {
      return { x: midX, y: midY };
    }

    return null;
  }

  private static isCellValid(
    x: number,
    y: number,
    actorId: string,
    allParticipants: BattlefieldParticipant[],
    hazards: DynamicHazardZone[]
  ): boolean {
    if (x < 0 || y < 0) return false;

    // Cell occupancy
    const occupied = allParticipants.some((p) => p.id !== actorId && !p.isDead && p.x === x && p.y === y);
    if (occupied) return false;

    // Hazard zone penalty
    const inHazard = hazards.some((h) => Math.hypot(x - h.x, y - h.y) <= h.radiusCells);
    if (inHazard) return false;

    return true;
  }
}
