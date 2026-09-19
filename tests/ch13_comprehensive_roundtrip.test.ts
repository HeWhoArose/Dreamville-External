import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { captureCanonicalStateSnapshot, compareCanonicalSnapshots, comparePartitionedArchives } from '../server/domain/canonicalSnapshot';

describe('CH13: Comprehensive Lossless Archive Round-Trip & Atomic Verification', () => {
  let repository: InMemoryWorldRepository;
  const storyId = 'story_lossless_ch13_comprehensive';

  beforeEach(() => {
    repository = new InMemoryWorldRepository();
    repository.seedStory(storyId);
  });

  it('1. performs an exact, deep semantic equality comparison across all 20+ canonical domains pre-export vs post-restore', async () => {
    // 1. Advance World Clock (+2 hours)
    repository.getWorldClock(storyId).advanceSeconds(7200);

    // 2. Modify player lifecycle / status
    const player = repository.getPlayerLifecycle(storyId)!;
    const updatedPlayer = player.copyWith({
      name: 'Archon Vael of the Sunken Spire',
      currentActivity: 'Activating Chronocrystal',
    });
    repository.updatePlayerLifecycle(storyId, updatedPlayer);

    // 3. Add inventory & items & equipment
    const actorId = player.actorId;
    repository.getInventoryEngine(storyId).createInstance({
      defId: 'def_iron_sword',
      ownerEntityId: actorId,
      provenance: 'ch13_test_grant',
      customName: 'Resonating Chronoblade',
      quantity: 1,
    });

    // 4. Register Crafting Recipe
    repository.getInventoryEngine(storyId).registerRecipe({
      id: 'rec_crystal_infusion',
      name: 'Crystal Infusion',
      outputDefId: 'def_iron_sword',
      outputQuantity: 1,
      requiredMaterials: [{ defId: 'def_iron_ingot', count: 1 }],
      craftingTimeSeconds: 600,
      difficultyScore: 5,
    });

    // 5. Create NPC Lifecycle & Relationship & Memory
    const orlaLifecycle = repository.getPlayerLifecycle(storyId)!.copyWith({
      actorId: 'npc_archivist_orla',
      name: 'Archivist Orla',
      locationId: 'loc_whispering_orrery',
      currentActivity: 'Studying records',
    });
    repository.updateNpcLifecycle(storyId, orlaLifecycle);

    repository.getMemoryEngine(storyId).storeMemory({
      id: 'mem_ch13_1',
      storyId,
      memoryClass: 'EPISODIC',
      subjectEntityId: 'npc_archivist_orla',
      relatedEntityIds: ['player'],
      content: 'Archivist Orla observed Archon Vael activate the Chronocrystal in the Whispering Orrery.',
      importance: 90,
      confidence: 1.0,
      status: 'active',
      visibility: 'PUBLIC',
      isPersistentCritical: true,
      provenance: 'direct_observation',
      validFromTurn: 1,
      lastRecalledTurn: 1,
      createdAtTimestamp: repository.getWorldClock(storyId).getTimestamp(),
      triggerConditionTags: ['chronocrystal', 'orrery'],
    });

    // 6. Chronicle Entry
    repository.getHistoricalChronicleEngine(storyId).recordEvidence({
      id: 'evidence_ch13_01',
      category: 'SACRED_OR_HISTORIC',
      timestamp: repository.getWorldClock(storyId).getTimestamp(),
      primarySubjectId: 'player',
      secondarySubjectId: 'npc_archivist_orla',
      locationId: 'loc_whispering_orrery',
      summary: 'The Great Resonation occurred in the Whispering Orrery.',
      details: 'The chronocrystal resonated through the Orrery.',
      sourceEventId: 'evt_chronocrystal_activation',
      provenance: 'direct_observation',
      visibility: 'PUBLIC',
    });

    // 7. Capabilities & Power State
    repository.getCapabilityEngine(storyId).registerCapability({
      id: 'cap_chronomancy_tier2',
      capabilityId: 'cap_chronomancy_tier2',
      name: 'Temporal Step',
      powerTier: 'high',
      description: 'Step 3 seconds into the immediate future.',
      prerequisites: [],
      cooldownSeconds: 60,
    } as any);

    // 8. Combat State
    const combat = repository.getCombatEngine(storyId);
    combat.addParticipant({
      id: 'player',
      name: 'Archon Vael',
      team: 'player_allies',
      hpCurrent: 42,
      hpMax: 50,
      armorClass: 16,
      speedCells: 6,
      attackBonus: 5,
      damageFormula: '1d8+3',
      initiative: 18,
      conditions: [],
      isDead: false,
      x: 2,
      y: 2,
    });
    combat.addParticipant({
      id: 'npc_clockwork_warden',
      name: 'Clockwork Warden',
      team: 'enemies',
      hpCurrent: 35,
      hpMax: 60,
      armorClass: 14,
      speedCells: 5,
      attackBonus: 4,
      damageFormula: '1d6+2',
      initiative: 12,
      conditions: [],
      isDead: false,
      x: 5,
      y: 5,
    });

    // 9. Knowledge Facts
    repository.addKnowledgeFact(storyId, {
      id: 'fact_memory_ch13_001',
      subjectEntityId: 'loc_whispering_orrery',
      predicate: 'resonated_with',
      objectValue: 'Chronocrystal Activation',
      confidence: 1.0,
      sourceType: 'witnessed',
      secretLevel: 'public',
      scope: 'exact',
      provenanceSummary: 'Direct observation at Orrery Core',
      acquiredAtTimestamp: repository.getWorldClock(storyId).getTimestamp(),
    });

    // 10. World Template & Story Run (CH16 integration in CH13 archive)
    const worldId = 'world_template_lossless_01';
    repository.saveWorldTemplate({
      worldId,
      worldManifestVersion: 2,
      title: 'The Clockwork Spire',
      summary: 'A sprawling mechanical archipelago in the sky.',
      description: 'Endless brass towers linked by magnetic ley-rails.',
      genreTags: ['Steampunk', 'High Fantasy'],
      toneTags: ['Mysterious', 'Heroic'],
      mediumTags: ['Game World'],
      defaultEra: 'Age of Gears',
      canonMode: 'CANONICAL',
      rulesetId: 'FULL_DND',
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
      canonicalCapabilities: ['cap_chronomancy_tier2'],
    });

    repository.saveStoryRun({
      storyId,
      worldId,
      pinnedWorldVersion: 2,
      storyMode: 'PROTAGONIST',
      dndRulesMode: 'FULL_DND',
      characterName: 'Archon Vael of the Sunken Spire',
      currentLocationId: 'loc_whispering_orrery',
      currentHp: 42,
      canonicalCapabilities: ['cap_chronomancy_tier2'],
      createdAt: new Date().toISOString(),
    });

    // Capture comprehensive pre-export canonical snapshot
    const preSnapshot = captureCanonicalStateSnapshot(storyId, repository);

    // Export archive
    const archive = repository.exportCampaignArchive(storyId);
    assert.ok(archive, 'Archive creation must succeed');
    assert.equal(archive.manifest.archiveSchemaVersion, '1.0.0');

    // Create a brand new clean repository
    const targetRepo = new InMemoryWorldRepository();
    // Restore into the target repository
    const restoreResult = targetRepo.restoreCampaignArchive(archive);
    assert.ok(restoreResult.success, `Restore must succeed: ${restoreResult.errorReason}`);

    // Capture post-restore canonical snapshot
    const postSnapshot = captureCanonicalStateSnapshot(storyId, targetRepo);

    // Deep semantic equality comparison of canonical snapshots
    const comparison = compareCanonicalSnapshots(preSnapshot, postSnapshot);
    assert.ok(
      comparison.isEqual,
      `Pre-export and post-restore snapshots must be identical. Discrepancies: ${JSON.stringify(comparison.discrepancies, null, 2)}`
    );

    // Re-export Archive B from restored target repository
    const archiveB = targetRepo.exportCampaignArchive(storyId);
    assert.ok(archiveB, 'Archive B re-export must succeed');

    // Deep semantic equality comparison covering EVERY canonical archive partition
    const archiveComparison = comparePartitionedArchives(archive, archiveB);
    assert.ok(
      archiveComparison.isEqual,
      `Archive A and Archive B must be semantically identical across all partitions. Discrepancies: ${JSON.stringify(archiveComparison.discrepancies, null, 2)}`
    );

    // Explicit partition-by-partition presence and equality assertions
    const requiredPartitions = [
      'canonical/world.json',
      'canonical/player.json',
      'canonical/inventory.json',
      'canonical/npcs.json',
      'canonical/chronicle.json',
      'canonical/narrative.json',
      'canonical/capabilities.json',
      'canonical/combat.json',
      'canonical/memories.json',
      'canonical/living_world.json',
      'canonical/sensory_config.json',
      'canonical/adaptation.json',
      'canonical/assets.json',
    ];

    for (const partitionKey of requiredPartitions) {
      assert.ok((archive.partitions as any)[partitionKey], `Archive A must contain ${partitionKey}`);
      assert.ok((archiveB.partitions as any)[partitionKey], `Archive B must contain ${partitionKey}`);
      assert.deepEqual(
        JSON.parse((archive.partitions as any)[partitionKey]),
        JSON.parse((archiveB.partitions as any)[partitionKey]),
        `Partition ${partitionKey} must match semantically between Archive A and Archive B`
      );
    }
  });

  it('2. guarantees atomic rollback on corrupted archive without mutating live state', () => {
    // Modify live repository
    const originalPlayer = repository.getPlayerLifecycle(storyId)!.copyWith({
      name: 'Immutable Player State',
      currentActivity: 'Standing firm',
    });
    repository.updatePlayerLifecycle(storyId, originalPlayer);

    // Create invalid/corrupted archive
    const corruptedArchive: any = {
      campaignId: storyId,
      schemaVersion: '1.0.0',
      manifest: {
        schemaVersion: '1.0.0',
        campaignId: storyId,
        exportedAt: new Date().toISOString(),
        partitions: ['worldClock', 'player'],
      },
      worldClock: null, // Corrupted field
      player: {
        player: {
          id: 'corrupted_player',
          name: 'Corrupted Infiltration',
        },
      },
    };

    const restoreResult = repository.restoreCampaignArchive(corruptedArchive);
    assert.equal(restoreResult.success, false, 'Restore should fail gracefully');
    assert.ok(restoreResult.errorReason, 'Failure reason must be provided');

    // Verify live state was completely protected and not mutated
    const postPlayer = repository.getPlayerLifecycle(storyId);
    assert.equal(postPlayer.name, 'Immutable Player State');
    assert.equal(postPlayer.currentActivity, 'Standing firm');
  });
});
