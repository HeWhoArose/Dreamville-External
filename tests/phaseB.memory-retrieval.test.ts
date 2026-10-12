// Phase B — retrieval quality (GAP-2).
//
// Verifies the provider-gated embedding index, the no-op parity guarantee on the
// keyword baseline, and the fused retrieval ranking (cosine + recency + importance
// + epistemic fit) with the baseline score preserved as a label.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MemoryOpportunityEngine,
  type DurableMemory,
} from '../server/domain/memoryOpportunityEngine';
import {
  MemoryVectorIndex,
  cosineSimilarity,
  similarity01,
  detectEmbeddingProvider,
  deterministicContentHash,
  type EmbeddingProvider,
} from '../server/domain/memoryVectorIndex';

const STORY = 'phaseB_retrieval_story';

function memory(overrides: Partial<DurableMemory> & Pick<DurableMemory, 'id' | 'content'>): DurableMemory {
  return {
    storyId: STORY,
    memoryClass: 'EPISODIC',
    subjectEntityId: 'player_actor_phaseB',
    relatedEntityIds: [],
    importance: 50,
    confidence: 0.8,
    status: 'active',
    visibility: 'PRIVATE',
    accessibleToEntityIds: ['player_actor_phaseB'],
    isPersistentCritical: false,
    provenance: 'test',
    perspective: 'SUBJECTIVE',
    validFromTurn: 1,
    lastRecalledTurn: 1,
    triggerConditionTags: [],
    ...overrides,
  } as DurableMemory;
}

const tokenEmbedder: EmbeddingProvider = {
  providerId: 'fake',
  modelId: 'embed-v1',
  modelKey: 'fake::embed-v1',
  async embed(texts: string[]) {
    return texts.map((text) => {
      const value = text.toLowerCase();
      const vector = [0, 0, 0];
      if (value.includes('sword') || value.includes('blade')) vector[0] = 1;
      if (value.includes('gate') || value.includes('door')) vector[1] = 1;
      if (value.includes('key')) vector[2] = 1;
      const norm = Math.hypot(...vector) || 1;
      return vector.map((component) => component / norm);
    });
  },
};

describe('Phase B retrieval', () => {
  it('detects embedding-capable models from the registry and discovery catalog', () => {
    assert.equal(detectEmbeddingProvider(null).available, false);
    assert.equal(detectEmbeddingProvider({ getAllModels: () => [{ modelId: 'gemini-2.5-flash' }] }).available, false);
    const fromRegistry = detectEmbeddingProvider({ getAllModels: () => [{ providerId: 'google_gemini', modelId: 'gemini-embedding-001' }] });
    assert.equal(fromRegistry.available, true);
    assert.equal(fromRegistry.modelKey, 'google_gemini::gemini-embedding-001');
    const fromCatalog = detectEmbeddingProvider({ getDiscoveredCatalog: () => [{ id: 'text-embedding-004', supportedActions: ['embedContent'] }] });
    assert.equal(fromCatalog.available, true);
  });

  it('computes deterministic cosine similarity in 0..1', () => {
    assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
    assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
    assert.equal(cosineSimilarity([0, 0, 0], [1, 0, 0]), 0);
    assert.equal(similarity01(1), 1);
    assert.equal(similarity01(-1), 0);
    assert.equal(similarity01(0), 0.5);
    assert.equal(deterministicContentHash('same text'), deterministicContentHash('same text'));
    assert.notEqual(deterministicContentHash('a'), deterministicContentHash('b'));
  });

  it('is a strict no-op with no embedding provider connected', async () => {
    const index = new MemoryVectorIndex();
    assert.equal(index.isAvailable(), false);
    const prepared = await index.prepareEmbeddingContext(STORY, 'sword', [{ id: 'm1', content: 'The blade was hidden.' }]);
    assert.deepEqual(prepared, {});
    assert.equal(await index.indexMemories(STORY, [{ id: 'm1', content: 'The blade was hidden.' }]), 0);
  });

  it('indexes, searches, and round-trips through JSON with a provider', async () => {
    const index = new MemoryVectorIndex();
    index.setProvider(tokenEmbedder);
    const indexed = await index.indexMemories(STORY, [
      { id: 'blade_mem', content: 'The sword rested in the armory.' },
      { id: 'gate_mem', content: 'The gate had been sealed at dusk.' },
    ]);
    assert.equal(indexed, 2);
    // Re-indexing unchanged content is skipped.
    assert.equal(await index.indexMemories(STORY, [{ id: 'blade_mem', content: 'The sword rested in the armory.' }]), 0);

    const prepared = await index.prepareEmbeddingContext(STORY, 'blade', [
      { id: 'blade_mem', content: 'The sword rested in the armory.' },
      { id: 'gate_mem', content: 'The gate had been sealed at dusk.' },
    ]);
    assert.ok(prepared.similarities);
    assert.ok(prepared.similarities!.blade_mem > prepared.similarities!.gate_mem, 'synonym query must rank the sword memory first');

    const restored = new MemoryVectorIndex();
    restored.importJSON(index.toJSON());
    assert.equal(restored.size(STORY), 2);
    assert.deepEqual(restored.getVector(STORY, 'blade_mem'), index.getVector(STORY, 'blade_mem'));
  });

  it('keeps the keyword baseline order when no embedding similarities are supplied', () => {
    const engine = new MemoryOpportunityEngine();
    engine.storeMemory(memory({ id: 'strong', content: 'The northern gate rumor mentions a sealed door.', importance: 80 }));
    engine.storeMemory(memory({ id: 'weak', content: 'A blade was seen nearby.', importance: 30 }));

    const legacy = engine.retrieveMemories({ storyId: STORY, viewerActorId: 'player_actor_phaseB', queryKeywords: ['gate'], maxResults: 5 });
    const evidence = engine.retrieveMemoriesWithEvidence({ storyId: STORY, viewerActorId: 'player_actor_phaseB', queryKeywords: ['gate'], maxResults: 5 });
    // With no similarities the fused ordering is exactly the baseline ordering.
    assert.deepEqual(evidence.map((entry) => entry.memory.id), legacy.map((entry) => entry.id));
    assert.equal(evidence[0].memory.id, 'strong');
    for (const entry of evidence) {
      assert.equal(entry.score, entry.baselineScore);
      assert.equal(entry.embeddingScore, undefined);
    }
  });

  it('fuses embedding similarity so a paraphrase match outranks a keyword match, preserving the baseline label', () => {
    const engine = new MemoryOpportunityEngine();
    // "blade" memory has NO keyword match for the query "sword" but is semantically close.
    engine.storeMemory(memory({ id: 'blade', content: 'The blade was hidden beneath the altar.', importance: 20 }));
    // "gate" memory matches the keyword but is semantically distant.
    engine.storeMemory(memory({ id: 'gate', content: 'The gate closed behind the traveler.', importance: 90 }));

    const baseline = engine.retrieveMemoriesWithEvidence({ storyId: STORY, viewerActorId: 'player_actor_phaseB', queryKeywords: ['gate'], maxResults: 5 });
    assert.equal(baseline[0].memory.id, 'gate', 'baseline ranks the keyword match first');

    const fused = engine.retrieveMemoriesWithEvidence({
      storyId: STORY,
      viewerActorId: 'player_actor_phaseB',
      queryKeywords: [],
      maxResults: 5,
      embeddingSimilarities: { blade: 1.0, gate: 0.5 },
    });
    assert.equal(fused[0].memory.id, 'blade', 'semantic match must outrank under fusion');
    const bladeEvidence = fused.find((entry) => entry.memory.id === 'blade')!;
    const gateEvidence = fused.find((entry) => entry.memory.id === 'gate')!;
    assert.equal(bladeEvidence.embeddingScore, 1.0);
    assert.equal(gateEvidence.embeddingScore, 0.5);
    assert.equal(gateEvidence.baselineScore > bladeEvidence.baselineScore, true, 'baseline (importance) still favors the gate memory');
  });
});
