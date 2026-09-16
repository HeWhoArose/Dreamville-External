import { WorldTimestamp } from './types';

export type CharacterRole =
  | 'ally'
  | 'enemy'
  | 'neutral'
  | 'faction_member'
  | 'leader'
  | 'prisoner'
  | 'antagonist'
  | 'protector'
  | 'rival'
  | 'companion';

export type MotivationType =
  | 'moral_conviction'
  | 'greater_good'
  | 'self_preservation'
  | 'loyalty_to_kin'
  | 'ideological_duty'
  | 'ambition'
  | 'vengeance'
  | 'coerced';

export interface CharacterRelationship {
  actorId: string;
  targetId: string;
  trustScore: number; // 0 to 100
  affectionScore: number; // 0 to 100
  respectScore: number; // 0 to 100
  fearScore: number; // 0 to 100
}

export interface CharacterAlignmentProfile {
  characterId: string;
  name: string;
  currentRole: CharacterRole;
  currentFactionId: string;
  underlyingMotivation: MotivationType;
  isCoerced: boolean;
  coercionSource?: string;
  isCurrentlyOpposingPlayer: boolean;
  roleHistory: {
    fromRole: CharacterRole;
    toRole: CharacterRole;
    cause: string;
    timestamp: WorldTimestamp;
  }[];
  surfaceBehaviorDescription: string;
  canonicalGoal: string;
}

/**
 * CharacterAlignmentEngine
 * Implements DreamBook Amendment V10.8.35 (Dynamic Character Alignment, Motivation & Role Transformation).
 *
 * Core Principles:
 * - Relationships remain distinct from current opposition: an NPC may oppose the player while retaining affection, loyalty, or respect.
 * - Roles are mutable states, not immutable character types (ally -> enemy -> reluctant ally -> rival).
 * - Coercion is strictly separated from voluntary belief.
 * - AI narration cannot manufacture transformations; deterministic causes are required.
 */
export class CharacterAlignmentEngine {
  private profiles: Map<string, CharacterAlignmentProfile> = new Map();
  private relationships: Map<string, CharacterRelationship> = new Map(); // `${actorId}:${targetId}` -> CharacterRelationship

  public registerProfile(profile: CharacterAlignmentProfile): void {
    this.profiles.set(profile.characterId, { ...profile });
  }

  public setRelationship(rel: CharacterRelationship): void {
    const key = `${rel.actorId}:${rel.targetId}`;
    this.relationships.set(key, { ...rel });
  }

  public getProfile(characterId: string): CharacterAlignmentProfile | undefined {
    const p = this.profiles.get(characterId);
    return p ? JSON.parse(JSON.stringify(p)) : undefined;
  }

  public getRelationship(actorId: string, targetId: string): CharacterRelationship | undefined {
    const key = `${actorId}:${targetId}`;
    const r = this.relationships.get(key);
    return r ? JSON.parse(JSON.stringify(r)) : undefined;
  }

  /**
   * Applies a dynamic role transformation with causal justification (V10.8.35)
   */
  public transformRole(params: {
    characterId: string;
    newRole: CharacterRole;
    cause: string;
    timestamp: WorldTimestamp;
    isCoerced?: boolean;
    coercionSource?: string;
    newMotivation?: MotivationType;
  }): {
    success: boolean;
    errorReason?: string;
    updatedProfile?: CharacterAlignmentProfile;
  } {
    const profile = this.profiles.get(params.characterId);
    if (!profile) return { success: false, errorReason: 'Character profile not found.' };

    if (!params.cause || params.cause.trim().length === 0) {
      return { success: false, errorReason: 'Role transformation requires canonical cause.' };
    }

    const oldRole = profile.currentRole;
    profile.currentRole = params.newRole;
    if (params.isCoerced !== undefined) profile.isCoerced = params.isCoerced;
    if (params.coercionSource !== undefined) profile.coercionSource = params.coercionSource;
    if (params.newMotivation) profile.underlyingMotivation = params.newMotivation;

    profile.roleHistory.push({
      fromRole: oldRole,
      toRole: params.newRole,
      cause: params.cause,
      timestamp: params.timestamp,
    });

    // Update player opposition flag
    profile.isCurrentlyOpposingPlayer = params.newRole === 'enemy' || params.newRole === 'antagonist' || params.newRole === 'rival';

    return { success: true, updatedProfile: JSON.parse(JSON.stringify(profile)) };
  }

  /**
   * Evaluates Epistemic Character Expression (V10.8.35 Knowledge & Opposition Boundary)
   * A coerced or loving opponent opposes the player without hatred.
   */
  public getDialogueGuidance(characterId: string, playerId: string): {
    role: CharacterRole;
    opposesPlayer: boolean;
    affectionRetained: boolean;
    isCoerced: boolean;
    guidanceText: string;
  } {
    const profile = this.profiles.get(characterId);
    if (!profile) throw new Error(`Character ${characterId} not found.`);

    const rel = this.getRelationship(characterId, playerId);
    const hasAffection = rel ? rel.affectionScore >= 50 || rel.respectScore >= 50 : false;

    let guidance = `Character speaks as a ${profile.currentRole}.`;
    if (profile.isCurrentlyOpposingPlayer && hasAffection) {
      guidance = `Character opposes the player due to ${profile.underlyingMotivation}, but retains high personal respect/affection (${rel?.respectScore}/100). Express sorrow, reluctance, or duty—NOT blind hatred.`;
    } else if (profile.isCoerced) {
      guidance = `Character is coerced by ${profile.coercionSource || 'threat'}. Surface behavior opposes player, but internal intent seeks rescue or regret.`;
    }

    return {
      role: profile.currentRole,
      opposesPlayer: profile.isCurrentlyOpposingPlayer,
      affectionRetained: hasAffection,
      isCoerced: profile.isCoerced,
      guidanceText: guidance,
    };
  }

  /**
   * Lossless Campaign Archive Export
   */
  public exportState(): {
    profiles: CharacterAlignmentProfile[];
    relationships: CharacterRelationship[];
  } {
    return {
      profiles: Array.from(this.profiles.values()).map((p) => JSON.parse(JSON.stringify(p))),
      relationships: Array.from(this.relationships.values()).map((r) => JSON.parse(JSON.stringify(r))),
    };
  }

  /**
   * Lossless Campaign Archive Restore
   */
  public importState(state: {
    profiles?: CharacterAlignmentProfile[];
    relationships?: CharacterRelationship[];
  }): void {
    if (!state) return;
    this.profiles.clear();
    this.relationships.clear();

    if (Array.isArray(state.profiles)) {
      for (const p of state.profiles) {
        this.registerProfile(p);
      }
    }
    if (Array.isArray(state.relationships)) {
      for (const r of state.relationships) {
        this.setRelationship(r);
      }
    }
  }
}
