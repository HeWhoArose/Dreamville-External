import { worldRepository } from '../repositories/worldRepository';
import { narrativeProfileEngine } from '../domain/narrativeProfileEngine';
import { WorldFact, StoryThread } from '../../src/types';

export interface NarrativeBeat {
  beatId: string;
  title: string;
  summary: string;
  options: Array<{ optionId: string; label: string; consequenceType: string }>;
}

export interface NarrativeTriggerDefinition {
  triggerId: string;
  description: string;
  conditionPredicate: (storyId: string) => boolean;
  generatedBeat: NarrativeBeat;
}

export const NARRATIVE_TRIGGER_REGISTRY: NarrativeTriggerDefinition[] = [
  {
    triggerId: 'trig_coded_cipher',
    description: 'Triggers when coded cipher evidence or fact exists in world',
    conditionPredicate: (storyId: string) => {
      const facts = worldRepository.getWorldFacts(storyId);
      return facts.some((f) => f.predicate === 'has_evidence' && f.objectValue?.includes('coded cipher')) ||
             facts.some((f) => f.predicate === 'discovered_fact' && f.objectValue?.includes('cipher'));
    },
    generatedBeat: {
      beatId: 'beat_coded_cipher',
      title: 'Investigate Coded Cipher',
      summary: 'A mysterious cipher has been uncovered. Deciphering it may reveal hidden cabal contacts.',
      options: [
        { optionId: 'opt_decipher', label: 'Attempt Deciphering', consequenceType: 'ADVANCE_THREAD' },
        { optionId: 'opt_refuse', label: 'Refuse Investigation', consequenceType: 'PROTAGONIST_REFUSAL' },
      ],
    },
  },
  {
    triggerId: 'trig_refusal_consequence',
    description: 'Triggers when protagonist has refused a narrative path',
    conditionPredicate: (storyId: string) => {
      const facts = worldRepository.getWorldFacts(storyId);
      return facts.some((f) => f.predicate === 'refused_path');
    },
    generatedBeat: {
      beatId: 'beat_refusal_fallout',
      title: 'Fallout from Refused Path',
      summary: 'Ignoring the earlier warning has allowed rival forces to claim the ancient relic.',
      options: [
        { optionId: 'opt_confront', label: 'Confront Rival Forces', consequenceType: 'COMBAT_ENGAGEMENT' },
        { optionId: 'opt_evade', label: 'Evade and Re-group', consequenceType: 'TACTICAL_RETREAT' },
      ],
    },
  },
  {
    triggerId: 'trig_ruins_echoes',
    description: 'Triggers when player is at ancient ruins location',
    conditionPredicate: (storyId: string) => {
      const run = worldRepository.getStoryRun(storyId);
      const player = worldRepository.getPlayerLifecycle(storyId);
      const loc = run?.currentLocationId || player?.locationId;
      return loc === 'loc_ancient_ruins';
    },
    generatedBeat: {
      beatId: 'beat_ruins_echoes',
      title: 'Echoes in the Ancient Ruins',
      summary: 'Faint arcane vibrations pulse through the crumbling archway.',
      options: [
        { optionId: 'opt_channel', label: 'Channel Arcane Energy', consequenceType: 'POWER_EXERCEN' },
        { optionId: 'opt_scout', label: 'Scout Perimeter', consequenceType: 'INVESTIGATION' },
      ],
    },
  },
];

export class StoryDirectorService {
  public stepDirector(storyId: string): { eventGenerated: boolean; beat?: NarrativeBeat; message?: string } {
    for (const trigger of NARRATIVE_TRIGGER_REGISTRY) {
      if (trigger.conditionPredicate(storyId)) {
        return {
          eventGenerated: true,
          beat: trigger.generatedBeat,
        };
      }
    }
    return {
      eventGenerated: false,
      message: 'No active triggers match current world state.',
    };
  }

  public recordChoice(
    storyId: string,
    beatId: string,
    optionId: string,
    repository = worldRepository
  ): { success: boolean; consequences: string[] } {
    const consequences: string[] = [];
    const profile = repository.getNarrativeProfile(storyId) || narrativeProfileEngine.createDefault('PROTAGONIST');
    const playerLabel = profile.mode === 'PROTAGONIST' ? 'Protagonist' : 'Player Character';

    if (optionId === 'opt_refuse' || optionId === 'refuse_quest') {
      const factId = `fact_refusal_${Date.now()}`;
      const refusalFact: WorldFact = {
        factId,
        statement: `${playerLabel} explicitly refused narrative path for beat ${beatId}`,
        category: 'world_lore',
        subjectEntityId: 'player_character',
        predicate: 'refused_path',
        objectValue: beatId,
        provenanceClass: 'DIRECT_RECORD',
        provenanceSummary: 'Player Narrative Choice',
        sourceSegmentIds: [],
        confidence: 1.0,
        acquiredAtTimestamp: { totalElapsedSeconds: 0, cycle: 1, period: 'Dawn' },
      };
      repository.saveWorldFact(storyId, refusalFact);
      consequences.push('Protagonist refusal canonically persisted.');
      consequences.push('Consequence escalation path unlocked.');
    } else {
      consequences.push(`Option ${optionId} selected and applied.`);
    }

    return { success: true, consequences };
  }

  public advanceOffscreenProtagonist(
    storyId: string,
    repository = worldRepository
  ): { success: boolean; actionTaken: string; rumorLogged: boolean } {
    const profile = repository.getNarrativeProfile(storyId) || narrativeProfileEngine.createDefault('PROTAGONIST');
    if (profile.mode === 'PROTAGONIST') {
      return { success: true, actionTaken: 'No separate offscreen protagonist advanced because the player character is the canonical narrative focus.', rumorLogged: false };
    }

    let agenda = repository.getProtagonistAgenda(storyId);
    if (!agenda) {
      agenda = {
        protagonistId: 'char_secondary_hero',
        goal: profile.mode === 'SIDE_CHARACTER' ? 'Advance an independent principal-actor objective' : 'Pursue an independent world objective',
        currentLocation: 'loc_lantern_vault',
        progressState: 0,
      };
      repository.saveProtagonistAgenda(storyId, agenda);
    }

    // Advance state
    const actorLabel = profile.mode === 'SIDE_CHARACTER' ? 'Offscreen principal actor' : 'Independent world actor';
    const actionTaken = `${actorLabel} ${agenda.protagonistId} executed goal '${agenda.goal}' at ${agenda.currentLocation}`;
    agenda.progressState = (agenda.progressState || 0) + 1;
    repository.saveProtagonistAgenda(storyId, agenda);

    // Save rumor knowledge fact
    const rumorFact: WorldFact = {
      factId: `fact_rumor_${Date.now()}`,
      statement: `Rumor: ${agenda.protagonistId} was spotted attempting '${agenda.goal}'`,
      category: 'world_lore',
      subjectEntityId: agenda.protagonistId,
      predicate: 'spotted_acting',
      objectValue: agenda.goal,
      provenanceClass: 'RUMOR',
      provenanceSummary: 'Local Tavern Whispers',
      sourceSegmentIds: [],
      confidence: 0.7,
      acquiredAtTimestamp: { totalElapsedSeconds: 0, cycle: 1, period: 'Dawn' },
    };
    repository.saveWorldFact(storyId, rumorFact);

    return { success: true, actionTaken, rumorLogged: true };
  }
}

export const storyDirectorService = new StoryDirectorService();
