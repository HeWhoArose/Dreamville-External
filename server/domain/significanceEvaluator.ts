import { HistoricalEvidence, SignificanceLevel, EvaluatedEvidence } from './historicalEvidence';

/**
 * SignificanceEvaluator
 * Implements deterministic significance evaluation per DreamBook §430–§432, V10.8.16 (Slice 1.2).
 *
 * Core Principle:
 * Promotion significance must be evaluated deterministically based on structured criteria,
 * never by arbitrary hidden narrative floats or unstructured LLM whims.
 */
export class SignificanceEvaluator {
  /**
   * Deterministically evaluates an evidence record.
   */
  public static evaluate(evidence: HistoricalEvidence): EvaluatedEvidence {
    let significance: SignificanceLevel = 'TRIVIAL';
    let reason = 'Standard event did not meet significance thresholds.';

    switch (evidence.category) {
      case 'LIFECYCLE_TRANSITION': {
        // Death, transformation, possession, or lineage events are always HISTORIC or SIGNIFICANT
        if (
          evidence.summary.toLowerCase().includes('death') ||
          evidence.summary.toLowerCase().includes('died') ||
          evidence.summary.toLowerCase().includes('slain')
        ) {
          significance = 'HISTORIC';
          reason = 'Terminal lifecycle transition (death) is globally historic.';
        } else if (
          evidence.summary.toLowerCase().includes('transformation') ||
          evidence.summary.toLowerCase().includes('possession')
        ) {
          significance = 'SIGNIFICANT';
          reason = 'Ontological state transformation alters entity nature permanently.';
        } else {
          significance = 'NOTABLE';
          reason = 'Lifecycle change recorded.';
        }
        break;
      }

      case 'WORLD_ANOMALY': {
        // Bedrock fractures, astral stops, core seal breaches
        significance = 'HISTORIC';
        reason = 'Macro-environmental or metaphysical disturbance affecting world reality.';
        break;
      }

      case 'SACRED_OR_HISTORIC': {
        significance = 'HISTORIC';
        reason = 'Explicitly classified as ancient or sacred milestone.';
        break;
      }

      case 'FACTION_ALIGNMENT': {
        // Defection or major treason
        if (
          evidence.summary.toLowerCase().includes('betrayal') ||
          evidence.summary.toLowerCase().includes('treason') ||
          evidence.summary.toLowerCase().includes('defect')
        ) {
          significance = 'SIGNIFICANT';
          reason = 'Major faction loyalty fracture.';
        } else {
          significance = 'NOTABLE';
          reason = 'Routine institutional appointment or status shift.';
        }
        break;
      }

      case 'RELATIONSHIP_MUTATION': {
        // Blood feuds, broken promises
        if (
          evidence.summary.toLowerCase().includes('blood feud') ||
          evidence.summary.toLowerCase().includes('vendetta')
        ) {
          significance = 'SIGNIFICANT';
          reason = 'Generational enmity / blood feud established.';
        } else {
          significance = 'NOTABLE';
          reason = 'Interpersonal trust/disposition shift.';
        }
        break;
      }

      case 'INJURY_OR_RECOVERY': {
        if (
          evidence.summary.toLowerCase().includes('permanent') ||
          evidence.summary.toLowerCase().includes('severed') ||
          evidence.summary.toLowerCase().includes('maimed')
        ) {
          significance = 'SIGNIFICANT';
          reason = 'Permanent physical alteration or crippling condition.';
        } else {
          significance = 'NOTABLE';
          reason = 'Transient physical injury or standard recovery.';
        }
        break;
      }

      case 'TERRITORIAL_TRANSIT': {
        if (
          evidence.summary.toLowerCase().includes('forbidden') ||
          evidence.summary.toLowerCase().includes('breached') ||
          evidence.summary.toLowerCase().includes('edict')
        ) {
          significance = 'SIGNIFICANT';
          reason = 'Illegal entry into sovereign restricted zone.';
        } else {
          significance = 'TRIVIAL';
          reason = 'Standard domestic route traversal.';
        }
        break;
      }

      default:
        significance = 'TRIVIAL';
        reason = 'Uncategorized observation.';
    }

    // Explicit override checks via metadata if present
    if (evidence.metadata?.forcedSignificance) {
      significance = evidence.metadata.forcedSignificance as SignificanceLevel;
      reason = `Explicit deterministic override: ${evidence.metadata.significanceReason ?? 'metadata rule'}`;
    }

    const promotedToDossier = significance === 'NOTABLE' || significance === 'SIGNIFICANT' || significance === 'HISTORIC';
    const promotedToChronicle = significance === 'SIGNIFICANT' || significance === 'HISTORIC';

    return {
      evidence,
      significance,
      promotedToDossier,
      promotedToChronicle,
      evaluationReason: reason,
    };
  }
}
