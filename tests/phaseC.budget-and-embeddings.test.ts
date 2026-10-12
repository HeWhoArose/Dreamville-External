// Phase C follow-ups — narrative prompt budget derivation and embedding configuration.
//
// Budget: the live narration prompt budget must scale with the serving model's
// context window instead of a fixed 700-token constant (the documented cause of the
// "authoritative context cannot fit" tension).
//
// Embeddings: retrieval must remain on the keyword baseline unless embeddings are
// explicitly enabled, and the opt-in must produce a working provider.
import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MultiModelOrchestrator,
  resolveNarrativePromptBudget,
  NARRATIVE_PROMPT_BUDGET_DEFAULT_CAP,
} from '../server/domain/aiOrchestrator';
import { memoryVectorIndex, MemoryVectorIndex } from '../server/domain/memoryVectorIndex';

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Budget derivation
// ---------------------------------------------------------------------------

test('derives a larger prompt budget from a large context window, capped for cost control', () => {
  const derived = resolveNarrativePromptBudget({ requested: 700, contextWindow: 1048576 });
  assert.ok(derived > 700, 'the 700-token live budget must no longer be the bottleneck');
  assert.equal(derived, NARRATIVE_PROMPT_BUDGET_DEFAULT_CAP);
});

test('scales down for small context windows and never shrinks below the caller request', () => {
  assert.equal(resolveNarrativePromptBudget({ requested: 700, contextWindow: 8192 }), 2048);
  assert.equal(resolveNarrativePromptBudget({ requested: 5000, contextWindow: 1048576 }), 5000);
  assert.equal(resolveNarrativePromptBudget({ requested: 700, contextWindow: 0 }), 700);
  assert.equal(resolveNarrativePromptBudget({ requested: 700 }), 700);
  assert.equal(resolveNarrativePromptBudget({}), 700);
});

test('honours an explicit cap and the environment override', () => {
  assert.equal(resolveNarrativePromptBudget({ requested: 400, contextWindow: 100000, cap: 900 }), 900);
  assert.equal(
    resolveNarrativePromptBudget({ requested: 700, contextWindow: 1000000, envCap: '1200' }),
    1200,
  );
  assert.equal(
    resolveNarrativePromptBudget({ requested: 700, contextWindow: 1000000, envCap: 'not-a-number' }),
    NARRATIVE_PROMPT_BUDGET_DEFAULT_CAP,
  );
});

test('generateNarrativeOnly derives its budget from the registered narration model', async () => {
  const repository = new InMemoryWorldRepository({ disablePersistence: true });
  repository.seedStory('budget-story');
  const orchestrator = new MultiModelOrchestrator(repository);
  (orchestrator as any).savePersistedConfig = () => {};
  const contextWindow = (orchestrator as any).resolveTaskContextWindow('narrative.generate');
  assert.ok(contextWindow > 0, 'the default registry must expose a narration model context window');
  const budget = resolveNarrativePromptBudget({ requested: 700, contextWindow });
  assert.ok(budget > 700, `expected a derived budget above 700, received ${budget}`);
});

// ---------------------------------------------------------------------------
// Embedding configuration
// ---------------------------------------------------------------------------

test('embedding retrieval stays a no-op unless explicitly enabled', async () => {
  withEnv({ DREAMVILLE_MEMORY_EMBEDDINGS: undefined }, () => {
    const repository = new InMemoryWorldRepository({ disablePersistence: true });
    repository.seedStory('embedding-default-story');
    const orchestrator = new MultiModelOrchestrator(repository);
    (orchestrator as any).savePersistedConfig = () => {};
    assert.equal(memoryVectorIndex.isAvailable(), false);
    assert.equal(orchestrator.getMemoryEmbeddingStatus().available, false);
  });
  const preparation = await memoryVectorIndex.prepareEmbeddingContext('any-story', 'a brass key', []);
  assert.deepEqual(preparation, {}, 'no provider must mean a byte-identical keyword baseline');
});

test('enabling embeddings without a key reports a clear status instead of failing', () => {
  withEnv({ DREAMVILLE_MEMORY_EMBEDDINGS: '1', GEMINI_API_KEY: undefined }, () => {
    const repository = new InMemoryWorldRepository({ disablePersistence: true });
    repository.seedStory('embedding-nokey-story');
    const orchestrator = new MultiModelOrchestrator(repository);
    (orchestrator as any).savePersistedConfig = () => {};
    const status = orchestrator.getMemoryEmbeddingStatus();
    assert.equal(status.available, false);
    assert.ok(status.reason, 'a missing key must be reported with a reason');
    assert.equal(memoryVectorIndex.isAvailable(), false);
  });
});

test('enabling embeddings with a key and a model override attaches a working provider', () => {
  withEnv(
    {
      DREAMVILLE_MEMORY_EMBEDDINGS: '1',
      GEMINI_API_KEY: 'test-key-not-used-for-network-calls',
      DREAMVILLE_EMBEDDING_MODEL: 'test-embedding-model',
    },
    () => {
      const repository = new InMemoryWorldRepository({ disablePersistence: true });
      repository.seedStory('embedding-enabled-story');
      const orchestrator = new MultiModelOrchestrator(repository);
      (orchestrator as any).savePersistedConfig = () => {};
      const status = orchestrator.getMemoryEmbeddingStatus();
      assert.equal(status.available, true);
      assert.equal(status.modelId, 'test-embedding-model');
      assert.equal(memoryVectorIndex.isAvailable(), true);
      assert.equal(memoryVectorIndex.getProvider()?.modelId, 'test-embedding-model');
    },
  );
  // Detach so the shared module singleton cannot leak into other assertions.
  memoryVectorIndex.setProvider(null);
});

test('C-FIND-1: the embedding index is persisted and reloaded instead of re-embedding every start', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'phaseC-vectors-'));
  const filePath = join(directory, 'memory-vectors.json');
  let embedCalls = 0;
  const provider = {
    providerId: 'test',
    modelId: 'test-embed',
    modelKey: 'test::test-embed',
    async embed(texts: string[]) {
      embedCalls += 1;
      return texts.map((text) => [text.length, 1, 0.5]);
    },
  };
  try {
    const index = new MemoryVectorIndex();
    index.attachFileStore(filePath);
    index.setProvider(provider);
    const memories = [
      { id: 'memory_a', content: 'Kaelen guarded the brass key.' },
      { id: 'memory_b', content: 'Kaelen moved the brass key to the archive.' },
    ];
    assert.equal(await index.indexMemories('story_a', memories), 2);
    assert.equal(embedCalls, 1);
    assert.ok(existsSync(filePath), 'indexing must write the persisted cache');

    const reloaded = new MemoryVectorIndex();
    reloaded.attachFileStore(filePath);
    reloaded.setProvider(provider);
    assert.equal(reloaded.loadFromFile(), true);
    assert.equal(reloaded.size('story_a'), 2);
    // Fresh vectors must be recognised, so no re-embedding happens on restart.
    assert.equal(reloaded.hasFreshVector('story_a', 'memory_a', memories[0].content), true);
    assert.deepEqual(reloaded.getVector('story_a', 'memory_b'), [memories[1].content.length, 1, 0.5]);
    assert.equal(await reloaded.indexMemories('story_a', memories), 0, 'a warm cache must not re-embed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
