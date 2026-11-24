/**
 * TimeBudgetGovernor
 *
 * Deterministically calculates and governs the simulated time budget consumed
 * by player actions in accordance with DreamBook §333, §334, §343, and
 * Milestone 5 (Feature F20).
 *
 * Distinguishes instant informational queries (0s), rapid interactions (60s),
 * standard investigative/physical tasks (300s), extended downtime/crafting (1800s),
 * and calculated journey travel durations.
 */

export type TimeBudgetCategory = 'INSTANT' | 'SHORT' | 'STANDARD' | 'EXTENDED' | 'TRAVEL';

export interface ActionTimeBudget {
  durationSeconds: number;
  category: TimeBudgetCategory;
  reason: string;
}

export interface TimeBudgetParams {
  actionType?: string;
  actionText?: string;
  isQueryOnly?: boolean;
  travelSeconds?: number;
  explicitSeconds?: number;
}

export class TimeBudgetGovernor {
  public static readonly DURATION_INSTANT = 0;
  public static readonly DURATION_SHORT = 60;      // 1 minute (talking, quick glance, gestures, doors)
  public static readonly DURATION_STANDARD = 300;  // 5 minutes (searching room, examining clues, picking lock)
  public static readonly DURATION_EXTENDED = 1800; // 30 minutes (crafting, resting, deep interrogation)

  /**
   * Determines whether an action text represents a read-only player state query
   * that consumes 0 simulated game seconds.
   */
  public static isStateQuery(actionText?: string): boolean {
    const text = String(actionText || '').toLowerCase().trim();
    if (!text) return false;
    return (
      /^(?:i\s+)?(?:check|view|inspect|show|open|look at)\s+(?:my\s+|the\s+)?(?:inventory|sheet|stats|time|clock|watch|journal|wallet|purse|pouch|items|belongings)\b/i.test(text) ||
      /\b(?:what time is it|what is the time|who am i|what do i have|what am i carrying|what(?:'s| is) in my bag|how much (?:money|currency|gold|cash) do i have|look at (?:the )?(?:clock|watch))\b/i.test(text)
    );
  }

  /**
   * Deterministically calculates the time budget for an action.
   */
  public static calculateTimeBudget(params: TimeBudgetParams): ActionTimeBudget {
    // 1. Explicit duration override (e.g., ADVANCE_TIME, ADVANCE_CYCLE, debug jumps)
    if (typeof params.explicitSeconds === 'number' && Number.isFinite(params.explicitSeconds)) {
      const clampedSeconds = Math.max(0, Math.floor(params.explicitSeconds));
      let category: TimeBudgetCategory = 'SHORT';
      if (clampedSeconds === 0) {
        category = 'INSTANT';
      } else if (clampedSeconds >= this.DURATION_EXTENDED) {
        category = 'EXTENDED';
      } else if (clampedSeconds >= this.DURATION_STANDARD) {
        category = 'STANDARD';
      }

      return {
        durationSeconds: clampedSeconds,
        category,
        reason: 'Explicit duration requested.',
      };
    }

    // 2. Travel journey override
    if (typeof params.travelSeconds === 'number' && Number.isFinite(params.travelSeconds) && params.travelSeconds > 0) {
      return {
        durationSeconds: Math.floor(params.travelSeconds),
        category: 'TRAVEL',
        reason: 'Calculated journey travel duration.',
      };
    }

    // 3. Explicit query-only actions or informational query patterns (consume 0 game time)
    if (params.isQueryOnly || this.isStateQuery(params.actionText)) {
      return {
        durationSeconds: this.DURATION_INSTANT,
        category: 'INSTANT',
        reason: params.isQueryOnly
          ? 'Read-only state query does not advance world clock.'
          : 'Informational query consumes 0 game seconds.',
      };
    }

    const text = (params.actionText || '').toLowerCase().trim();

    // 5. Extended actions (searching thoroughly, resting, crafting, deep study)
    if (
      /\b(?:search(?:ing)? thoroughly|deep investigation|craft(?:ing)?|rest(?:ing)?|sleep(?:ing)?|wait(?:ing)?|meditat(?:e|ing))\b/i.test(text)
    ) {
      return {
        durationSeconds: this.DURATION_EXTENDED,
        category: 'EXTENDED',
        reason: 'Extended physical or mental activity.',
      };
    }

    // 6. Standard actions (searching an area, investigating clues, picking lock, reading book)
    if (
      /\b(?:search|investigate|examine|inspect|read|study|pick lock|hack|tamper|interview|question)\b/i.test(text)
    ) {
      return {
        durationSeconds: this.DURATION_STANDARD,
        category: 'STANDARD',
        reason: 'Standard investigative or physical task.',
      };
    }

    // 7. Default short interaction (speaking, hailing taxi, quick glance, moving within room)
    return {
      durationSeconds: this.DURATION_SHORT,
      category: 'SHORT',
      reason: 'Standard conversational or rapid physical action.',
    };
  }
}
