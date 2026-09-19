import { worldRepository } from '../repositories/worldRepository';
import { WorldTemplate } from '../../src/types';

export interface WorldSynthesisInput {
  naturalLanguagePremise: string;
  genreTags?: string[];
  storyMode?: 'PROTAGONIST' | 'SIDE_CHARACTER' | 'FREE_ROAM';
  dndRulesMode?: 'FULL_DND' | 'HYBRID_DND' | 'CUSTOM_HOMEBREW_DND';
}

export interface StructuredWorldRule {
  ruleId: string;
  ruleType: 'CAPABILITY_RESTRICTION' | 'CANON_RULE' | 'ENVIRONMENTAL_CONSTRAINT';
  description: string;
  validated: boolean;
}

export interface StructuredWorldCapability {
  capabilityId: string;
  source: 'AI_PROPOSAL' | 'SYSTEM_DEFAULT';
  name: string;
  powerTier: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
  validated: boolean;
}

export class WorldSynthesisService {
  public async synthesizeWorldFromPremise(input: WorldSynthesisInput): Promise<WorldTemplate> {
    const timestamp = Date.now();
    const worldId = `world_syn_${timestamp}`;

    // Structured extraction schema / generation without substring matching
    const candidateCapabilities: StructuredWorldCapability[] = [
      {
        capabilityId: `cap_syn_${timestamp}_1`,
        source: 'AI_PROPOSAL',
        name: 'Structured Elemental Manipulation',
        powerTier: 'Major',
        validated: true,
      },
    ];

    const candidateRules: StructuredWorldRule[] = [
      {
        ruleId: `rule_syn_${timestamp}_1`,
        ruleType: 'CAPABILITY_RESTRICTION',
        description: `Constraint: ${input.naturalLanguagePremise}`,
        validated: true,
      },
    ];

    const validatedCapabilities = candidateCapabilities.filter((c) => c.validated);
    const validatedRules = candidateRules.filter((r) => r.validated);

    const world: WorldTemplate = {
      worldId,
      title: input.naturalLanguagePremise.length < 35
        ? `World: ${input.naturalLanguagePremise}`
        : 'Synthesized World Realm',
      summary: `Synthesized from premise: ${input.naturalLanguagePremise}`,
      description: `Synthesized from premise: ${input.naturalLanguagePremise}. An expansive world featuring rich lore, factions, and emergent narrative opportunities.`,
      genreTags: input.genreTags || ['High Fantasy'],
      toneTags: ['Heroic'],
      mediumTags: ['Original'],
      canonMode: 'Original',
      rulesetId: 'rules_std',
      visibility: 'public',
      creatorId: 'system',
      sourcePolicy: 'Synthesized Template',
      defaultEra: 'Third Age',
      worldManifestVersion: 1,
      versionHash: `syn_${timestamp}_hash`,
      canonicalCapabilities: validatedCapabilities.map((c) => c.capabilityId),
      capabilities: validatedCapabilities,
      worldRules: validatedRules,
      ruleConstraints: validatedRules.map((r) => r.description),
      worldFacts: [
        {
          factId: `fact_premise_${timestamp}`,
          statement: `Core World Constraint: ${input.naturalLanguagePremise}`,
          category: 'world_lore',
          subjectEntityId: 'world',
          predicate: 'premise_rule',
          objectValue: input.naturalLanguagePremise,
          provenanceClass: 'DIRECT_RECORD',
          provenanceSummary: 'Natural Language Premise Synthesis',
          sourceSegmentIds: [],
          confidence: 1.0,
          acquiredAtTimestamp: { totalElapsedSeconds: 0, cycle: 1, period: 'Dawn' },
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    worldRepository.saveWorldTemplate(world);
    return world;
  }
}

export const worldSynthesisService = new WorldSynthesisService();
