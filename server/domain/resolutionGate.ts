import type { PlayerIntent } from './playerIntentInterpreter';
import type { CurrentSituation } from './currentSituation';
import type { StoryCheckChallenge } from '../../src/types';
import type { ActionResolutionMethod } from './actionResolution';

export type ResolutionGateMode = ActionResolutionMethod | 'CHECK_CANDIDATE';

export interface ResolutionGateResult {
  mode: ResolutionGateMode;
  shouldRoll: boolean;
  rationale: string;
  uncertaintyBasis: string[];
}

const ROUTINE_ACTION = /\b(?:walk|move|go|step|look|watch|listen|hear|wait|breathe|rest|stand|sit|approach)\b/i;
const TECHNIQUE_ACTION = /\b(?:parkour|vault|wall run|wall-run|flip|acrobat|balance|climb|jump|leap|swim|sneak|hide|pick lock|lockpick|disarm|dodge|evade)\b/i;
const RESISTANCE_ACTION = /\b(?:force|push|pull|drag|lift|heave)\b/i;
const RESISTANCE_SCENE = /\b(?:jammed|stuck|barred|locked|sealed|heavy|immovable|resisting|resists|opposed|struggle|struggling|pinned|anchored|reinforced)\b/i;
const HAZARD_SCENE = /\b(?:collapsing|falling debris|explosion|blast|trap|falling|cave-in|slippery|slick|unstable|loose ground|broken pavement|treacherous terrain|hazardous footing|toxic gas|poison gas|venom|illusion|fear|charm|possession|banishment)\b/i;

function normalized(value: unknown): string {
  return String(value ?? '').trim();
}

export class ResolutionGate {
  public static evaluate(params: {
    actionText: string;
    currentSituation?: CurrentSituation;
    playerIntent?: PlayerIntent;
    authoredChallenge?: StoryCheckChallenge;
    capabilityDetected?: boolean;
    itemBlocked?: boolean;
  }): ResolutionGateResult {
    const action = normalized(params.actionText);
    if (params.itemBlocked) {
      return {
        mode: 'ITEM_USE',
        shouldRoll: false,
        rationale: 'The requested item is not available, so the action is blocked deterministically.',
        uncertaintyBasis: ['inventory availability'],
      };
    }
    if (params.authoredChallenge) {
      return {
        mode: 'AUTHORED_CHALLENGE',
        shouldRoll: true,
        rationale: params.authoredChallenge.triggerReason || params.authoredChallenge.reason || 'An authored challenge explicitly requires resolution.',
        uncertaintyBasis: ['authored challenge'],
      };
    }
    if (params.capabilityDetected) {
      return {
        mode: 'CAPABILITY',
        shouldRoll: false,
        rationale: 'An established capability or capability-routing path owns this action resolution.',
        uncertaintyBasis: ['canonical capability rules'],
      };
    }

    const scene = normalized(params.currentSituation?.location?.description) + ' ' +
      normalized(params.currentSituation?.activeConditions?.map((c) => c.label).join(' ')) + ' ' +
      normalized(params.currentSituation?.visibleEvents?.map((e) => e.summary).join(' '));
    const hazardousTraversal = ROUTINE_ACTION.test(action) && HAZARD_SCENE.test(scene);
    const technique = TECHNIQUE_ACTION.test(action);
    const resistedForce = RESISTANCE_ACTION.test(action) && RESISTANCE_SCENE.test(scene);

    if (hazardousTraversal) {
      return {
        mode: 'CHECK_CANDIDATE',
        shouldRoll: true,
        rationale: 'The current scene makes ordinary traversal materially hazardous.',
        uncertaintyBasis: ['environmental hazard', 'movement control'],
      };
    }
    if (technique || resistedForce) {
      return {
        mode: 'CHECK_CANDIDATE',
        shouldRoll: true,
        rationale: resistedForce
          ? 'The action encounters explicit physical resistance, making its resolution materially uncertain.'
          : 'The player explicitly attempts a technique whose outcome is meaningfully uncertain.',
        uncertaintyBasis: resistedForce
          ? ['physical resistance', 'leverage/opposition', 'environment']
          : ['technique execution', 'capability/opposition', 'environment'],
      };
    }
    return {
      mode: 'NO_CHECK',
      shouldRoll: false,
      rationale: 'The action does not present a meaningful mechanical uncertainty or authored challenge.',
      uncertaintyBasis: [],
    };
  }
}
