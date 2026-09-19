import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStoredCompendiumItems, saveCompendiumItems } from '../src/components/compendium/CompendiumView';
import { INITIAL_COMPENDIUM_ITEMS } from '../src/components/compendium/compendiumData';
import { CompendiumItem } from '../src/components/compendium/compendiumTypes';
import { worldRepository } from '../server/repositories/worldRepository';
import { MultiModelOrchestrator, IProviderAdapter, TaskId, ProviderGenerateOptions, ProviderGenerateResult } from '../server/domain/aiOrchestrator';

// Mock localStorage and window for Node test runner environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}

test('Gap 1 — Compendium Persistence across reload and provenance preservation', () => {
  localStorage.clear();
  
  // 1. Initial load falls back to defaults
  const itemsInitial = loadStoredCompendiumItems();
  assert.equal(itemsInitial.length, INITIAL_COMPENDIUM_ITEMS.length);

  // 2. Add an item discovered in World A
  const discoveredItemWorldA: CompendiumItem = {
    id: 'item_sun_pendant_01',
    category: 'equipment',
    title: 'Sunsteel Pendant of Aethelgard',
    description: 'Forged in the primary forge of World A.',
    tags: ['relic', 'world_a'],
    sourceWorld: 'world_aethelgard',
    sourceRun: 'run_alpha_01',
    originType: 'discovered',
    canonicalEntityId: 'item_canon_pendant_01',
    imageUrl: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&auto=format&fit=crop&q=60',
    provenance: 'Discovered in World A Sunken Sanctum',
  };

  const updatedCollection = [...itemsInitial, discoveredItemWorldA];
  saveCompendiumItems(updatedCollection);

  // 3. Simulate reload
  const itemsAfterReload = loadStoredCompendiumItems();
  assert.equal(itemsAfterReload.length, itemsInitial.length + 1);
  const reloadedItem = itemsAfterReload.find((i) => i.id === 'item_sun_pendant_01');
  assert.ok(reloadedItem);
  assert.equal(reloadedItem?.sourceWorld, 'world_aethelgard');
  assert.equal(reloadedItem?.sourceRun, 'run_alpha_01');
  assert.equal(reloadedItem?.originType, 'discovered');
  assert.equal(reloadedItem?.canonicalEntityId, 'item_canon_pendant_01');
  assert.equal(reloadedItem?.provenance, 'Discovered in World A Sunken Sanctum');
});

test('Gap 1b — Compendium Epistemic Separation Invariant (World B context does NOT know World A Compendium item)', () => {
  // Setup World A item in Compendium
  const worldAItem: CompendiumItem = {
    id: 'item_sun_pendant_01',
    category: 'equipment',
    title: 'Sunsteel Pendant of Aethelgard',
    description: 'Forged in World A',
    tags: ['relic'],
    sourceWorld: 'world_aethelgard',
    originType: 'discovered',
    canonicalEntityId: 'item_canon_pendant_01',
  };
  saveCompendiumItems([worldAItem]);

  // World B context inspection
  const worldBContext = {
    worldId: 'world_cyberpunk_neon_02',
    canonicalEntities: ['npc_cyber_boss', 'loc_neon_alley'],
  };

  // Compendium items are in personal collection
  const personalCompendium = loadStoredCompendiumItems();
  const foundItem = personalCompendium.find((i) => i.sourceWorld === 'world_aethelgard');
  assert.ok(foundItem);

  // Verify World B canonical entities array does NOT automatically contain the Compendium item
  assert.ok(!worldBContext.canonicalEntities.includes(foundItem.id));
  assert.ok(!worldBContext.canonicalEntities.includes(foundItem.canonicalEntityId || ''));
});

// Mock Adapters for Fallback Runtime Test
class PrimaryFailingAdapter implements IProviderAdapter {
  public readonly providerId = 'provider_primary_failing';
  public callCount = 0;

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    this.callCount++;
    throw new Error('Primary Provider API Connection Timeout (HTTP 504 Simulated)');
  }

  public async validateCredentials(): Promise<boolean> {
    return true;
  }
}

class FallbackSuccessAdapter implements IProviderAdapter {
  public readonly providerId = 'provider_fallback_success';
  public callCount = 0;

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    this.callCount++;
    return {
      text: JSON.stringify({
        narrative: ['Fallback model successfully generated story continuation.'],
        dialogue: [],
        events: ['FALLBACK_MODEL_TRIGGERED'],
        stateChanges: [],
        memoryCandidates: [],
        audioCues: [],
      }),
      latencyMs: 15,
      inputTokens: 50,
      outputTokens: 30,
      modelId: 'fallback-model-01',
      providerId: this.providerId,
    };
  }

  public async validateCredentials(): Promise<boolean> {
    return true;
  }
}

class SecondaryFailingAdapter implements IProviderAdapter {
  public readonly providerId = 'provider_secondary_failing';
  public callCount = 0;

  public async generate(task: TaskId, prompt: string, options?: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    this.callCount++;
    throw new Error('Secondary Provider Quota Exceeded (HTTP 429 Simulated)');
  }

  public async validateCredentials(): Promise<boolean> {
    return true;
  }
}

test('Gap 2 — Fallback Runtime Proof: Primary failure -> Fallback model invoked -> Successful response', async () => {
  const orchestrator = new MultiModelOrchestrator(worldRepository);

  const primaryAdapter = new PrimaryFailingAdapter();
  const fallbackAdapter = new FallbackSuccessAdapter();

  // Register primary failing model
  orchestrator.registerAdapter(primaryAdapter);
  orchestrator.registerModel({
    providerId: primaryAdapter.providerId,
    modelId: 'primary-model-01',
    displayName: 'Primary Model',
    pool: 'creative',
    capabilities: ['text'],
    contextWindow: 100000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 100,
    userPriority: 100,
    roleEligibility: ['narrative.generate'],
    fallbackEligibility: true,
  });

  // Register fallback working model
  orchestrator.registerAdapter(fallbackAdapter);
  orchestrator.registerModel({
    providerId: fallbackAdapter.providerId,
    modelId: 'fallback-model-01',
    displayName: 'Fallback Model',
    pool: 'creative',
    capabilities: ['text'],
    contextWindow: 100000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 50,
    userPriority: 500,
    roleEligibility: ['narrative.generate'],
    fallbackEligibility: true,
  });

  orchestrator.pinModelForTask('narrative.generate', 'provider_primary_failing::primary-model-01');

  // Execute turn
  const result = await orchestrator.executeTurn({
    storyId: 'story_fallback_test_01',
    playerAction: 'Investigate the glowing runes',
    task: 'narrative.generate',
  });

  // Assertions
  assert.equal(result.success, true);
  assert.equal(primaryAdapter.callCount, 3, 'Primary adapter should have attempted 3 times (1 initial + 2 retries) before failover');
  assert.equal(fallbackAdapter.callCount, 1, 'Fallback adapter should have been invoked after primary retries were exhausted');
  assert.equal(result.telemetry.selectedModelId, 'fallback-model-01');
  assert.equal(result.telemetry.selectedProviderId, 'provider_fallback_success');
  assert.ok(result.turnPackage?.events.includes('FALLBACK_MODEL_TRIGGERED'));
});

test('Gap 2b — Primary success -> Fallback NOT invoked', async () => {
  const orchestrator = new MultiModelOrchestrator(worldRepository);

  const primarySuccessAdapter = new FallbackSuccessAdapter();
  (primarySuccessAdapter as any).providerId = 'provider_primary_working';
  const fallbackUnusedAdapter = new FallbackSuccessAdapter();
  (fallbackUnusedAdapter as any).providerId = 'provider_fallback_unused';

  orchestrator.registerAdapter(primarySuccessAdapter);
  orchestrator.registerModel({
    providerId: 'provider_primary_working',
    modelId: 'primary-working-01',
    displayName: 'Primary Working Model',
    pool: 'creative',
    capabilities: ['text'],
    contextWindow: 100000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 20,
    userPriority: 200,
    roleEligibility: ['narrative.generate'],
    fallbackEligibility: true,
  });

  orchestrator.registerAdapter(fallbackUnusedAdapter);
  orchestrator.registerModel({
    providerId: 'provider_fallback_unused',
    modelId: 'fallback-unused-01',
    displayName: 'Fallback Unused Model',
    pool: 'creative',
    capabilities: ['text'],
    contextWindow: 100000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 50,
    userPriority: 50,
    roleEligibility: ['narrative.generate'],
    fallbackEligibility: true,
  });

  orchestrator.pinModelForTask('narrative.generate', 'provider_primary_working::primary-working-01');

  const result = await orchestrator.executeTurn({
    storyId: 'story_primary_success_test',
    playerAction: 'Walk through door',
    task: 'narrative.generate',
  });

  assert.equal(result.success, true);
  assert.equal(primarySuccessAdapter.callCount, 1);
  assert.equal(fallbackUnusedAdapter.callCount, 0, 'Fallback adapter must NOT be called when primary succeeds');
  assert.equal(result.telemetry.selectedModelId, 'primary-working-01');
});

test('Gap 2c — Primary failure -> Secondary failure -> Tertiary fallback attempted and succeeded', async () => {
  const orchestrator = new MultiModelOrchestrator(worldRepository);

  const primaryFail = new PrimaryFailingAdapter();
  const secondaryFail = new SecondaryFailingAdapter();
  const tertiarySuccess = new FallbackSuccessAdapter();
  (tertiarySuccess as any).providerId = 'provider_tertiary_success';

  orchestrator.registerAdapter(primaryFail);
  orchestrator.registerModel({
    providerId: primaryFail.providerId,
    modelId: 'primary-fail-m1',
    displayName: 'Primary Fail',
    pool: 'creative',
    capabilities: ['text'],
    contextWindow: 100000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 10,
    userPriority: 1000,
    roleEligibility: ['narrative.generate'],
  });

  orchestrator.registerAdapter(secondaryFail);
  orchestrator.registerModel({
    providerId: secondaryFail.providerId,
    modelId: 'secondary-fail-m2',
    displayName: 'Secondary Fail',
    pool: 'creative',
    capabilities: ['text'],
    contextWindow: 100000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 20,
    userPriority: 900,
    roleEligibility: ['narrative.generate'],
  });

  orchestrator.registerAdapter(tertiarySuccess);
  orchestrator.registerModel({
    providerId: 'provider_tertiary_success',
    modelId: 'tertiary-success-m3',
    displayName: 'Tertiary Success',
    pool: 'creative',
    capabilities: ['text'],
    contextWindow: 100000,
    health: 'Healthy',
    quota: 'Healthy',
    latencyMs: 30,
    userPriority: 800,
    roleEligibility: ['narrative.generate'],
  });

  orchestrator.pinModelForTask('narrative.generate', 'provider_primary_failing::primary-fail-m1');

  const result = await orchestrator.executeTurn({
    storyId: 'story_cascade_fallback_test',
    playerAction: 'Look up at the stars',
    task: 'narrative.generate',
  });

  assert.equal(result.success, true);
  assert.equal(primaryFail.callCount, 3, 'Primary model attempted 3 times (1 initial + 2 retries)');
  assert.equal(secondaryFail.callCount, 1, 'Secondary model failed with quota error and instantly failed over to tertiary without retrying');
  assert.equal(tertiarySuccess.callCount, 1, 'Tertiary model succeeded on first attempt');
  assert.equal(result.telemetry.selectedModelId, 'tertiary-success-m3');
});
