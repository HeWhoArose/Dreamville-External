export type CombatActionResource = 'ACTION' | 'BONUS_ACTION' | 'REACTION';

export interface ReadyActionState {
  actionDescription: string;
  triggerDescription: string;
  expiresOnTurnStart: boolean;
}

export interface CombatTurnResources {
  actorId: string;
  round: number;
  movementRemainingCells: number;
  movementMaxCells: number;
  actionAvailable: boolean;
  bonusActionAvailable: boolean;
  reactionAvailable: boolean;
  objectInteractionAvailable: boolean;
  dashMovementBonusCells: number;
  disengaging: boolean;
  dodging: boolean;
  readyAction?: ReadyActionState;
}

export interface CombatTurnResourceSnapshot {
  actorId: string;
  round: number;
  movementRemainingCells: number;
  movementMaxCells: number;
  actionAvailable: boolean;
  bonusActionAvailable: boolean;
  reactionAvailable: boolean;
  objectInteractionAvailable: boolean;
  dashMovementBonusCells: number;
  disengaging: boolean;
  dodging: boolean;
  readyAction?: ReadyActionState;
}

/**
 * Canonical turn-economy ledger for tactical combat.
 *
 * The ledger deliberately does not decide whether an action is semantically
 * legal for a particular condition, spell, feat, or capability. Those rules
 * remain in the combat/capability/condition authorities. This engine only
 * owns per-turn resource accounting and persistence.
 */
export class CombatActionEconomy {
  private resources = new Map<string, CombatTurnResources>();

  public clear(): void {
    this.resources.clear();
  }

  public registerActor(actorId: string, movementMaxCells: number, round = 1): void {
    const existing = this.resources.get(actorId);
    if (existing) {
      existing.movementMaxCells = Math.max(0, movementMaxCells);
      if (existing.round !== round) {
        this.beginTurn(actorId, movementMaxCells, round);
      }
      return;
    }

    this.resources.set(actorId, this.createTurnResources(actorId, movementMaxCells, round, true));
  }

  public beginTurn(actorId: string, movementMaxCells: number, round: number): CombatTurnResources {
    const current = this.resources.get(actorId);
    const preservedReaction = current?.reactionAvailable ?? true;
    const next = this.createTurnResources(actorId, movementMaxCells, round, preservedReaction);
    next.reactionAvailable = true;
    next.readyAction = undefined;
    this.resources.set(actorId, next);
    return this.clone(next);
  }

  public endTurn(actorId: string): void {
    const current = this.resources.get(actorId);
    if (!current) return;

    current.readyAction = undefined;
    current.dodging = false;
    current.disengaging = false;
  }

  public get(actorId: string): CombatTurnResources | undefined {
    const current = this.resources.get(actorId);
    return current ? this.clone(current) : undefined;
  }

  public getAll(): CombatTurnResources[] {
    return Array.from(this.resources.values()).map((resource) => this.clone(resource));
  }

  public canConsume(actorId: string, resource: CombatActionResource): boolean {
    const current = this.resources.get(actorId);
    if (!current) return false;

    switch (resource) {
      case 'ACTION':
        return current.actionAvailable;
      case 'BONUS_ACTION':
        return current.bonusActionAvailable;
      case 'REACTION':
        return current.reactionAvailable;
    }
  }

  public consume(actorId: string, resource: CombatActionResource): { success: boolean; errorReason?: string } {
    const current = this.resources.get(actorId);
    if (!current) {
      return { success: false, errorReason: 'Combat turn resources are not initialized for this actor.' };
    }

    if (!this.canConsume(actorId, resource)) {
      return {
        success: false,
        errorReason: resource === 'ACTION'
          ? 'Action already used this turn.'
          : resource === 'BONUS_ACTION'
            ? 'Bonus Action already used this turn.'
            : 'Reaction already used since the start of this turn.',
      };
    }

    switch (resource) {
      case 'ACTION':
        current.actionAvailable = false;
        break;
      case 'BONUS_ACTION':
        current.bonusActionAvailable = false;
        break;
      case 'REACTION':
        current.reactionAvailable = false;
        break;
    }

    return { success: true };
  }

  public consumeMovement(actorId: string, distanceCells: number): { success: boolean; errorReason?: string } {
    const current = this.resources.get(actorId);
    if (!current) {
      return { success: false, errorReason: 'Combat turn resources are not initialized for this actor.' };
    }

    if (!Number.isFinite(distanceCells) || distanceCells < 0) {
      return { success: false, errorReason: 'Movement distance must be a non-negative finite number.' };
    }

    if (distanceCells > current.movementRemainingCells + 1e-9) {
      return {
        success: false,
        errorReason: `Movement exceeds remaining movement: requested ${distanceCells.toFixed(1)}, remaining ${current.movementRemainingCells.toFixed(1)}.`,
      };
    }

    current.movementRemainingCells = Math.max(0, current.movementRemainingCells - distanceCells);
    return { success: true };
  }

  public grantDash(actorId: string, movementCells?: number): { success: boolean; errorReason?: string } {
    const current = this.resources.get(actorId);
    if (!current) {
      return { success: false, errorReason: 'Combat turn resources are not initialized for this actor.' };
    }

    const result = this.consume(actorId, 'ACTION');
    if (!result.success) return result;

    const bonus = Number.isFinite(movementCells) ? Math.max(0, movementCells as number) : current.movementMaxCells;
    current.dashMovementBonusCells += bonus;
    current.movementRemainingCells += bonus;
    return { success: true };
  }

  public setDisengaging(actorId: string): { success: boolean; errorReason?: string } {
    const result = this.consume(actorId, 'ACTION');
    if (!result.success) return result;
    const current = this.resources.get(actorId)!;
    current.disengaging = true;
    return { success: true };
  }

  public setDodging(actorId: string): { success: boolean; errorReason?: string } {
    const result = this.consume(actorId, 'ACTION');
    if (!result.success) return result;
    const current = this.resources.get(actorId)!;
    current.dodging = true;
    return { success: true };
  }

  public setReadyAction(
    actorId: string,
    actionDescription: string,
    triggerDescription: string,
    options?: {
      triggerType?: ReadyTriggerType;
      triggerActorId?: string;
      targetId?: string;
      actionType?: 'ATTACK';
    }
  ): { success: boolean; errorReason?: string } {
    if (!actionDescription.trim()) {
      return { success: false, errorReason: 'A Ready Action requires a non-empty action description.' };
    }
    if (!triggerDescription.trim()) {
      return { success: false, errorReason: 'A Ready Action requires a non-empty trigger description.' };
    }

    const result = this.consume(actorId, 'ACTION');
    if (!result.success) return result;
    const current = this.resources.get(actorId)!;
    current.readyAction = {
      actionDescription: actionDescription.trim(),
      triggerDescription: triggerDescription.trim(),
      expiresOnTurnStart: true,
      triggerType: options?.triggerType,
      triggerActorId: options?.triggerActorId,
      targetId: options?.targetId,
      actionType: options?.actionType || 'ATTACK',
    };
    return { success: true };
  }

  public getReadyAction(actorId: string): ReadyActionState | undefined {
    const current = this.resources.get(actorId);
    return current?.readyAction ? JSON.parse(JSON.stringify(current.readyAction)) : undefined;
  }

  public clearReadyAction(actorId: string): void {
    const current = this.resources.get(actorId);
    if (current) current.readyAction = undefined;
  }

  public consumeReaction(actorId: string): { success: boolean; errorReason?: string } {
    return this.consume(actorId, 'REACTION');
  }

  public consumeReadyReaction(actorId: string): { success: boolean; errorReason?: string } {
    const result = this.consumeReaction(actorId);
    if (!result.success) return result;
    this.clearReadyAction(actorId);
    return { success: true };
  }

  public exportState(): CombatTurnResourceSnapshot[] {
    return this.getAll();
  }

  public importState(resources: CombatTurnResourceSnapshot[]): void {
    this.resources.clear();
    for (const resource of resources || []) {
      this.resources.set(resource.actorId, this.clone(resource));
    }
  }

  private createTurnResources(
    actorId: string,
    movementMaxCells: number,
    round: number,
    reactionAvailable: boolean
  ): CombatTurnResources {
    return {
      actorId,
      round,
      movementRemainingCells: Math.max(0, movementMaxCells),
      movementMaxCells: Math.max(0, movementMaxCells),
      actionAvailable: true,
      bonusActionAvailable: true,
      reactionAvailable,
      objectInteractionAvailable: true,
      dashMovementBonusCells: 0,
      disengaging: false,
      dodging: false,
    };
  }

  private clone(resource: CombatTurnResources): CombatTurnResources {
    return JSON.parse(JSON.stringify(resource)) as CombatTurnResources;
  }
}
