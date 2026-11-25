import express, { type Express } from 'express';
import type { Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { gameRouter } from '../server/api/gameRoutes';
import { InMemoryWorldRepository, worldRepository, type WorldRepository } from '../server/repositories/worldRepository';
import { serverMockAuthority } from '../server/mockEngine/serverMockAuthority';
import { deterministicId, formatCanonicalTimestamp } from '../server/domain/deterministicRng';
import { MultiModelOrchestrator, DeterministicMockAdapter } from '../server/domain/aiOrchestrator';
import { createHash } from 'node:crypto';
import { CharacterCanonSteward } from '../server/domain/characterCanonSteward';

export interface E2eTestServer {
  app: Express;
  server: Server;
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Boots an in-process Express server mounting Dreamville's production gameRouter.
 */
export async function startE2eServer(): Promise<E2eTestServer> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/game', gameRouter);

  const server = app.listen(0);
  await new Promise<void>((resolve) => {
    if (server.listening) resolve();
    else server.once('listening', resolve);
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/api/game`;

  return {
    app,
    server,
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

let originalGenerate: any;
let originalExecute: any;

/**
 * Installs deterministic mock handlers on the AI Orchestrator to ensure
 * 100% offline, zero-network, sub-millisecond turn execution during E2E tests.
 */
export function installDeterministicAiMocks(repository: WorldRepository = worldRepository): void {
  const orchestrator = repository.getAiOrchestrator();
  originalGenerate = orchestrator.generateNarrativeOnly;
  originalExecute = orchestrator.executeTaskGeneration;

  (orchestrator as any).generateNarrativeOnly = async (params: any) => {
    const actionText = params?.actionResolution?.playerAction || params?.playerAction || 'action';
    return {
      success: true,
      turnPackage: {
        narrative: [`You execute: ${actionText}. The surroundings acknowledge the action.`],
        dialogue: [],
        events: ['E2E_MOCK_EVENT'],
        stateChanges: [],
        memoryCandidates: [`Observed consequence for: ${actionText}`],
        audioCues: [],
        visualCues: [],
      },
      providerId: 'e2e-mock-provider',
      modelId: 'e2e-deterministic-model',
      source: 'AI_PRIMARY',
      narrativePlan: {
        turnId: params?.turnId || 'turn_e2e_mock',
        objective: 'Respond clearly to player intent.',
        immediateSteps: ['Describe immediate consequence.'],
        informationToReveal: [],
        entitiesToReact: [],
        continuityRequirements: [],
        forbiddenAssumptions: [],
        stateEffectsExpected: [],
        createdAt: 'Day 1 • Afternoon',
        expiresAfterNarration: true,
      },
      storyBeat: undefined,
    };
  };

  (orchestrator as any).executeTaskGeneration = async (taskType: string) => {
    return {
      text: JSON.stringify({
        narrative: ['The scene unfolds with clear atmospheric consequence.'],
        narrativeText: 'The scene unfolds with clear atmospheric consequence.',
        structuredEvents: [],
        dialogue: [],
      }),
      providerId: 'e2e-mock-provider',
      modelId: 'e2e-deterministic-model',
      source: 'AI_PRIMARY',
      attemptsTrail: [{ providerId: 'e2e-mock-provider', modelId: 'e2e-deterministic-model', status: 'SUCCESS', latencyMs: 5 }],
    };
  };
}

/**
 * Restores original AI Orchestrator handlers.
 */
export function restoreDeterministicAiMocks(repository: WorldRepository = worldRepository): void {
  const orchestrator = repository.getAiOrchestrator();
  if (originalGenerate) (orchestrator as any).generateNarrativeOnly = originalGenerate;
  if (originalExecute) (orchestrator as any).executeTaskGeneration = originalExecute;
}

/**
 * Seeds a fresh story run for E2E testing.
 */
export function seedE2eStory(storyId: string, repository: WorldRepository = worldRepository): void {
  repository.seedStory(storyId);
  CharacterCanonSteward.resetStory(storyId);
  const graph = repository.getGeographyGraph(storyId);
  if (graph && !graph.getNode('loc_office')) {
    graph.addNode({
      id: 'loc_office',
      name: 'Detective Office',
      regionId: 'Elysium Solar Citadel',
      description: 'A modest detective agency office.',
      archetype: 'WORKPLACE',
      accessible: true,
      discovered: true,
      sceneObjects: [],
      tags: ['office', 'workplace'],
    } as any);
  }
}

export {
  type WorldSimulationProposal,
  type AdjudicationResult,
  type WorldSimulationAdjudicationResult,
  type SimulationPrecondition,
  type SimulationStateTransition,
  type SimulationProvenance,
  type SimulationSafeFallback,
  WorldSimulatorAdjudicator,
} from '../server/domain/worldSimulationProposal';

export {
  type EntityLifecycleStage,
  EntityLifecycleStateMachine,
} from '../server/domain/entityLifecycle';

export { AffordancePlausibilityEngine } from '../server/domain/affordancePlausibilityEngine';
export { VehicleInteractionAuthority } from '../server/domain/vehicleInteractionAuthority';

export {
  CharacterCanonSteward,
  type CharacterKnowledgeFact,
  type CharacterEpistemicScope,
  type FactSourceType,
  type DialogueAuditResult,
} from '../server/domain/characterCanonSteward';

export {
  WitnessFactAuthority,
  type WitnessFactInput,
  type WitnessFactResult,
} from '../server/domain/witnessFactAuthority';

export {
  DynamicCharacterAgencyEngine,
  type DynamicRelationshipState,
  type RelationshipDelta,
  type BidirectionalRelationshipParams,
  type BidirectionalRelationshipResult,
} from '../server/domain/dynamicCharacterAgency';


