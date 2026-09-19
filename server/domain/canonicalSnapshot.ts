import { InMemoryWorldRepository } from '../repositories/worldRepository';

export interface CanonicalStateSnapshot {
  storyId: string;
  worldClock: any;
  geography: any;
  worldFacts: any[];
  player: any;
  inventory: any;
  equipment: Record<string, any>;
  craftingRecipes: any[];
  npcs: {
    alignment: any;
    lifecycles: any[];
  };
  chronicle: any;
  narrativeHistory: any[];
  capabilities: any;
  combat: any;
  memories: any;
  livingWorld: any;
  sensory: {
    settings: any;
    voiceProfiles: any[];
  };
  adaptation: {
    bible: any;
    profile: any;
    pipelineState: any;
    session: any;
    events: any[];
    ch16Run: any;
    ch16Threads: any[];
    ch16ActiveEffects: any[];
    ch16WorldFacts: any[];
    ch16Agenda: any;
    worldTemplate: any;
  };
}

export function captureCanonicalStateSnapshot(
  storyId: string,
  repo: InMemoryWorldRepository
): CanonicalStateSnapshot {
  const clock = repo.getWorldClock(storyId);
  const geography = repo.getGeographyGraph(storyId);
  const facts = repo.getKnowledgeFacts(storyId);
  const player = repo.getPlayerLifecycle(storyId);
  const invEngine = repo.getInventoryEngine(storyId);
  const invExport = invEngine.exportState();
  const alignmentEngine = repo.getCharacterAlignmentEngine();
  const npcs = repo.getAllNpcLifecycles(storyId);
  const chronicle = repo.getHistoricalChronicleEngine(storyId);
  const orchestrator = repo.getAiOrchestrator();
  const capEngine = repo.getCapabilityEngine(storyId);
  const combatEngine = repo.getCombatEngine(storyId);
  const memoryEngine = repo.getMemoryEngine(storyId);
  const livingSim = repo.getLivingWorldSimulation(storyId);
  const sensoryEngine = repo.getSensoryEngine();

  const playerActorId = player ? player.actorId : `player_actor_${storyId}`;
  const equipment = invEngine.getActorPaperDoll(playerActorId);
  const craftingRecipes = invEngine.getRecipes();

  const run = repo.getStoryRun(storyId);
  const worldTemplate = run?.worldId ? repo.getWorldTemplate(run.worldId) : null;

  return {
    storyId,
    worldClock: clock.exportState(),
    geography: geography.exportState(),
    worldFacts: JSON.parse(JSON.stringify(facts)),
    player: player ? player.toJSON() : null,
    inventory: invExport,
    equipment: JSON.parse(JSON.stringify(equipment)),
    craftingRecipes: JSON.parse(JSON.stringify(craftingRecipes)),
    npcs: {
      alignment: alignmentEngine.exportState(),
      lifecycles: npcs.map((n) => n.toJSON()),
    },
    chronicle: chronicle.exportState(),
    narrativeHistory: orchestrator.exportNarrativeHistory(storyId),
    capabilities: capEngine.exportState(),
    combat: combatEngine.exportState(),
    memories: memoryEngine.exportState(),
    livingWorld: livingSim.exportState(),
    sensory: {
      settings: sensoryEngine.getSettings(storyId),
      voiceProfiles: sensoryEngine.getAllVoiceProfiles(storyId),
    },
    adaptation: {
      bible: repo.getAdaptedStoryBible(storyId),
      profile: repo.getAdaptationProfile(storyId),
      pipelineState: repo.getPipelineState(storyId),
      session: repo.getAdaptationSession(storyId),
      events: repo.getAdaptationEvents(storyId),
      ch16Run: run,
      ch16Threads: repo.getStoryThreads(storyId),
      ch16ActiveEffects: repo.getActiveEffects(storyId),
      ch16WorldFacts: repo.getWorldFacts(storyId),
      ch16Agenda: repo.getProtagonistAgenda(storyId),
      worldTemplate,
    },
  };
}

export function compareCanonicalSnapshots(
  a: CanonicalStateSnapshot,
  b: CanonicalStateSnapshot,
  options: { ignoreStoryId?: boolean } = {}
): { identical: boolean; differences: string[]; isEqual: boolean; discrepancies: string[] } {
  const diffs: string[] = [];

  const deepCheck = (objA: any, objB: any, path: string) => {
    if (options.ignoreStoryId && (path.endsWith('.storyId') || path.endsWith('.campaignId'))) {
      return;
    }

    if (objA === objB) return;

    if (objA === null || objB === null || typeof objA !== typeof objB) {
      diffs.push(`Type mismatch or null at ${path}: A=${JSON.stringify(objA)}, B=${JSON.stringify(objB)}`);
      return;
    }

    if (typeof objA !== 'object') {
      if (objA !== objB) {
        diffs.push(`Value mismatch at ${path}: A=${JSON.stringify(objA)}, B=${JSON.stringify(objB)}`);
      }
      return;
    }

    if (Array.isArray(objA)) {
      if (!Array.isArray(objB)) {
        diffs.push(`Array mismatch at ${path}: B is not an array`);
        return;
      }
      if (objA.length !== objB.length) {
        diffs.push(`Array length mismatch at ${path}: A.len=${objA.length}, B.len=${objB.length}`);
        return;
      }
      for (let i = 0; i < objA.length; i++) {
        deepCheck(objA[i], objB[i], `${path}[${i}]`);
      }
      return;
    }

    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    for (const key of keysA) {
      if (!(key in objB)) {
        diffs.push(`Missing property '${key}' in B at ${path}`);
      } else {
        deepCheck(objA[key], objB[key], `${path}.${key}`);
      }
    }

    for (const key of keysB) {
      if (!(key in objA)) {
        diffs.push(`Extra property '${key}' in B at ${path}`);
      }
    }
  };

  deepCheck(a.worldClock, b.worldClock, 'worldClock');
  deepCheck(a.geography, b.geography, 'geography');
  deepCheck(a.worldFacts, b.worldFacts, 'worldFacts');
  deepCheck(a.player, b.player, 'player');
  deepCheck(a.inventory, b.inventory, 'inventory');
  deepCheck(a.equipment, b.equipment, 'equipment');
  deepCheck(a.craftingRecipes, b.craftingRecipes, 'craftingRecipes');
  deepCheck(a.npcs, b.npcs, 'npcs');
  deepCheck(a.chronicle, b.chronicle, 'chronicle');
  deepCheck(a.narrativeHistory, b.narrativeHistory, 'narrativeHistory');
  deepCheck(a.capabilities, b.capabilities, 'capabilities');
  deepCheck(a.combat, b.combat, 'combat');
  deepCheck(a.memories, b.memories, 'memories');
  deepCheck(a.livingWorld, b.livingWorld, 'livingWorld');
  deepCheck(a.sensory, b.sensory, 'sensory');
  deepCheck(a.adaptation, b.adaptation, 'adaptation');

  return {
    identical: diffs.length === 0,
    differences: diffs,
    isEqual: diffs.length === 0,
    discrepancies: diffs,
  };
}

export function comparePartitionedArchives(
  a: any,
  b: any
): { identical: boolean; differences: string[]; isEqual: boolean; discrepancies: string[] } {
  const diffs: string[] = [];

  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    diffs.push('Archive A or B is null or not an object');
    return { identical: false, differences: diffs, isEqual: false, discrepancies: diffs };
  }

  // 1. Compare Manifest invariants (excluding noncanonical exportedAt timestamp)
  const manA = a.manifest || {};
  const manB = b.manifest || {};

  if (manA.archiveSchemaVersion !== manB.archiveSchemaVersion) {
    diffs.push(`manifest.archiveSchemaVersion mismatch: A=${manA.archiveSchemaVersion}, B=${manB.archiveSchemaVersion}`);
  }
  if (manA.engineVersion !== manB.engineVersion) {
    diffs.push(`manifest.engineVersion mismatch: A=${manA.engineVersion}, B=${manB.engineVersion}`);
  }
  if (manA.campaignId !== manB.campaignId) {
    diffs.push(`manifest.campaignId mismatch: A=${manA.campaignId}, B=${manB.campaignId}`);
  }
  if (manA.title !== manB.title) {
    diffs.push(`manifest.title mismatch: A=${manA.title}, B=${manB.title}`);
  }
  if (manA.mediaHashes || manB.mediaHashes) {
    const mediaA = manA.mediaHashes || {};
    const mediaB = manB.mediaHashes || {};
    const allMediaKeys = Array.from(new Set([...Object.keys(mediaA), ...Object.keys(mediaB)]));
    for (const mKey of allMediaKeys) {
      if (mediaA[mKey] !== mediaB[mKey]) {
        diffs.push(`manifest.mediaHashes mismatch for '${mKey}': A=${mediaA[mKey]}, B=${mediaB[mKey]}`);
      }
    }
  }

  // 2. Compare Partitions
  const partsA = a.partitions || {};
  const partsB = b.partitions || {};

  const allPartitionKeys = Array.from(
    new Set([...Object.keys(partsA), ...Object.keys(partsB)])
  );

  const deepCheck = (objA: any, objB: any, path: string) => {
    if (objA === objB) return;

    if (objA === null || objB === null || typeof objA !== 'object' || typeof objB !== 'object') {
      diffs.push(`Value mismatch at ${path}: A=${JSON.stringify(objA)}, B=${JSON.stringify(objB)}`);
      return;
    }

    if (Array.isArray(objA) !== Array.isArray(objB)) {
      diffs.push(`Array type mismatch at ${path}`);
      return;
    }

    if (Array.isArray(objA)) {
      if (objA.length !== objB.length) {
        diffs.push(`Array length mismatch at ${path}: A.len=${objA.length}, B.len=${objB.length}`);
        return;
      }
      for (let i = 0; i < objA.length; i++) {
        deepCheck(objA[i], objB[i], `${path}[${i}]`);
      }
      return;
    }

    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    for (const key of keysA) {
      if (!(key in objB)) {
        diffs.push(`Missing property '${key}' in B at ${path}`);
      } else {
        deepCheck(objA[key], objB[key], `${path}.${key}`);
      }
    }

    for (const key of keysB) {
      if (!(key in objA)) {
        diffs.push(`Extra property '${key}' in B at ${path}`);
      }
    }
  };

  for (const pKey of allPartitionKeys) {
    if (!(pKey in partsA)) {
      diffs.push(`Partition '${pKey}' missing in Archive A`);
      continue;
    }
    if (!(pKey in partsB)) {
      diffs.push(`Partition '${pKey}' missing in Archive B`);
      continue;
    }

    const contentA = partsA[pKey];
    const contentB = partsB[pKey];

    try {
      const parsedA = JSON.parse(contentA);
      const parsedB = JSON.parse(contentB);
      deepCheck(parsedA, parsedB, `partitions['${pKey}']`);
    } catch (e: any) {
      if (contentA !== contentB) {
        diffs.push(`Raw content mismatch in partition '${pKey}'`);
      }
    }
  }

  // 3. Compare partition hashes
  const hashesA = manA.partitionHashes || {};
  const hashesB = manB.partitionHashes || {};
  for (const pKey of allPartitionKeys) {
    if (hashesA[pKey] && hashesB[pKey] && hashesA[pKey] !== hashesB[pKey]) {
      diffs.push(`Partition hash mismatch for '${pKey}': A=${hashesA[pKey]}, B=${hashesB[pKey]}`);
    }
  }

  return {
    identical: diffs.length === 0,
    differences: diffs,
    isEqual: diffs.length === 0,
    discrepancies: diffs,
  };
}
