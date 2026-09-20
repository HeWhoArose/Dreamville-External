import type { DeathSaveState, RollRecord } from '../../src/types';
import type { LocalDiceEngine } from './combatEngine';

export interface DeathSaveResolution {
  roll: RollRecord;
  state: DeathSaveState;
  stabilized: boolean;
  revived: boolean;
  died: boolean;
  summary: string;
}

export class DeathSaveEngine {
  public createState(): DeathSaveState {
    return {
      successes: 0,
      failures: 0,
      stable: false,
    };
  }

  public resolveTurnStart(state: DeathSaveState, diceEngine: LocalDiceEngine): DeathSaveResolution {
    const roll = diceEngine.roll('1d20', 0);
    const next: DeathSaveState = {
      ...state,
      lastRoll: roll,
    };

    if (roll.individualDice[0] === 20) {
      return {
        roll,
        state: this.createState(),
        stabilized: false,
        revived: true,
        died: false,
        summary: 'Natural 20: the character regains 1 hit point and consciousness.',
      };
    }

    if (roll.individualDice[0] === 1) {
      next.failures = Math.min(3, next.failures + 2);
      next.stable = false;
    } else if (roll.total >= 10) {
      next.successes = Math.min(3, next.successes + 1);
    } else {
      next.failures = Math.min(3, next.failures + 1);
      next.stable = false;
    }

    const stabilized = next.successes >= 3;
    const died = next.failures >= 3;

    if (stabilized) next.stable = true;

    return {
      roll,
      state: {
        ...next,
        stable: stabilized,
      },
      stabilized,
      revived: false,
      died,
      summary: died
        ? 'Three failed death saves: the character dies.'
        : stabilized
          ? 'Three successful death saves: the character stabilizes.'
          : roll.total >= 10 && roll.individualDice[0] !== 1
            ? 'Death save success.'
            : 'Death save failure.',
    };
  }

  public applyDamageAtZero(
    state: DeathSaveState,
    criticalHit: boolean
  ): { state: DeathSaveState; died: boolean; failuresAdded: number } {
    const failuresAdded = criticalHit ? 2 : 1;
    const next = {
      ...state,
      failures: Math.min(3, state.failures + failuresAdded),
      stable: false,
    };

    return {
      state: next,
      died: next.failures >= 3,
      failuresAdded,
    };
  }

  public resetAfterHealing(): DeathSaveState {
    return this.createState();
  }
}

export const deathSaveEngine = new DeathSaveEngine();
