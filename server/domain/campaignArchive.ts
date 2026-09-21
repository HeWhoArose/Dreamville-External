import * as crypto from 'crypto';

export interface VisualAssetEntry {
  assetId: string;
  mediaType: string;
  relativeUri: string;
  mediaSha256: string;
  compositionProfile?: {
    aspectRatio: '16:9' | '1:1' | '4:3' | '3:4';
    antiClippingSafetyBox: { x: number; y: number; width: number; height: number };
    focalPoint: { x: number; y: number };
  };
  promptFallback: string;
}

export interface ArchiveManifest {
  archiveSchemaVersion: string;
  engineVersion: string;
  campaignId: string;
  title: string;
  exportedAt: string;
  partitionHashes: Record<string, string>; // filename -> sha256
  mediaHashes?: Record<string, string>;
}

export interface PartitionedArchive {
  manifest: ArchiveManifest;
  partitions: {
    'canonical/world.json': string;
    'canonical/player.json': string;
    'canonical/inventory.json': string;
    'canonical/npcs.json': string;
    'canonical/chronicle.json': string;
    'canonical/narrative.json': string;
    'canonical/capabilities.json'?: string;
    'canonical/progression.json'?: string;
    'canonical/combat.json'?: string;
    'canonical/memories.json'?: string;
    'canonical/living_world.json'?: string;
    'canonical/sensory_config.json'?: string;
    'canonical/adaptation.json'?: string;
    'canonical/assets.json'?: string;
  };
}

export interface RestoredCampaignData {
  campaignId: string;
  title: string;
  world: any;
  player: any;
  inventory: any;
  npcs: any;
  chronicle: any;
  narrative: any;
  capabilities?: any;
  combat?: any;
  memories?: any;
  livingWorld?: any;
  sensoryConfig?: any;
  adaptationState?: any;
  assets?: VisualAssetEntry[];
}

export const DEFAULT_CANONICAL_ASSETS: VisualAssetEntry[] = [
  {
    assetId: 'asset_loc_whispering_orrery',
    mediaType: 'image/webp',
    relativeUri: '/assets/locations/whispering_orrery.webp',
    mediaSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    compositionProfile: {
      aspectRatio: '16:9',
      antiClippingSafetyBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      focalPoint: { x: 0.5, y: 0.5 },
    },
    promptFallback: 'A towering brass and crystal celestial orrery with stopped concentric armatures and luminescent dust in a high stone dome.',
  },
  {
    assetId: 'asset_item_verdigris_key',
    mediaType: 'image/webp',
    relativeUri: '/assets/items/verdigris_key.webp',
    mediaSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    compositionProfile: {
      aspectRatio: '1:1',
      antiClippingSafetyBox: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
      focalPoint: { x: 0.5, y: 0.5 },
    },
    promptFallback: 'An ancient heavy brass key coated with green verdigris patina and engraved astronomical constellations.',
  },
];

/**
 * CampaignArchiveService
 * Implements DreamBook Challenge 13 & V10.8.31 (Lossless Campaign Archive & Portability).
 * Partitioned canonical serialization, SHA-256 integrity verification, and atomic restore.
 */
export class CampaignArchiveService {
  public static readonly CURRENT_SCHEMA_VERSION = '1.0.0';
  public static readonly CURRENT_ENGINE_VERSION = 'dreamville-v10.8';

  public static computeSha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Packs canonical state partitions into a verified .dreamarchive container
   */
  public static createArchive(params: {
    campaignId: string;
    title: string;
    worldState: unknown;
    playerState: unknown;
    inventoryState: unknown;
    npcsState: unknown;
    chronicleState: unknown;
    narrativeState: unknown;
    capabilitiesState?: unknown;
    progressionState?: unknown;
    combatState?: unknown;
    memoriesState?: unknown;
    livingWorldState?: unknown;
    sensoryState?: unknown;
    adaptationState?: unknown;
    assetsState?: VisualAssetEntry[];
  }): PartitionedArchive {
    const worldJson = JSON.stringify(params.worldState ?? {}, null, 2);
    const playerJson = JSON.stringify(params.playerState ?? {}, null, 2);
    const invJson = JSON.stringify(params.inventoryState ?? {}, null, 2);
    const npcsJson = JSON.stringify(params.npcsState ?? {}, null, 2);
    const chronicleJson = JSON.stringify(params.chronicleState ?? {}, null, 2);
    const narrativeJson = JSON.stringify(params.narrativeState ?? [], null, 2);
    const capabilitiesJson = JSON.stringify(params.capabilitiesState ?? {}, null, 2);
    const progressionJson = JSON.stringify(params.progressionState ?? {}, null, 2);
    const combatJson = JSON.stringify(params.combatState ?? {}, null, 2);
    const memoriesJson = JSON.stringify(params.memoriesState ?? [], null, 2);
    const livingWorldJson = JSON.stringify(params.livingWorldState ?? {}, null, 2);
    const sensoryJson = JSON.stringify(params.sensoryState ?? {}, null, 2);
    const adaptationJson = JSON.stringify(params.adaptationState ?? {}, null, 2);
    const assetsList = params.assetsState && params.assetsState.length > 0 ? params.assetsState : DEFAULT_CANONICAL_ASSETS;
    const assetsJson = JSON.stringify(assetsList, null, 2);

    const partitionHashes: Record<string, string> = {
      'canonical/world.json': this.computeSha256(worldJson),
      'canonical/player.json': this.computeSha256(playerJson),
      'canonical/inventory.json': this.computeSha256(invJson),
      'canonical/npcs.json': this.computeSha256(npcsJson),
      'canonical/chronicle.json': this.computeSha256(chronicleJson),
      'canonical/narrative.json': this.computeSha256(narrativeJson),
      'canonical/capabilities.json': this.computeSha256(capabilitiesJson),
      'canonical/progression.json': this.computeSha256(progressionJson),
      'canonical/combat.json': this.computeSha256(combatJson),
      'canonical/memories.json': this.computeSha256(memoriesJson),
      'canonical/living_world.json': this.computeSha256(livingWorldJson),
      'canonical/sensory_config.json': this.computeSha256(sensoryJson),
      'canonical/adaptation.json': this.computeSha256(adaptationJson),
      'canonical/assets.json': this.computeSha256(assetsJson),
    };

    const mediaHashes: Record<string, string> = {};
    for (const asset of assetsList) {
      mediaHashes[asset.assetId] = asset.mediaSha256;
    }

    const manifest: ArchiveManifest = {
      archiveSchemaVersion: this.CURRENT_SCHEMA_VERSION,
      engineVersion: this.CURRENT_ENGINE_VERSION,
      campaignId: params.campaignId,
      title: params.title,
      exportedAt: new Date().toISOString(),
      partitionHashes,
      mediaHashes,
    };

    return {
      manifest,
      partitions: {
        'canonical/world.json': worldJson,
        'canonical/player.json': playerJson,
        'canonical/inventory.json': invJson,
        'canonical/npcs.json': npcsJson,
        'canonical/chronicle.json': chronicleJson,
        'canonical/narrative.json': narrativeJson,
        'canonical/capabilities.json': capabilitiesJson,
        'canonical/progression.json': progressionJson,
        'canonical/combat.json': combatJson,
        'canonical/memories.json': memoriesJson,
        'canonical/living_world.json': livingWorldJson,
        'canonical/sensory_config.json': sensoryJson,
        'canonical/adaptation.json': adaptationJson,
        'canonical/assets.json': assetsJson,
      },
    };
  }

  /**
   * Dry-run Archive Validation (DreamBook V10.8.31.3)
   * Validates schema, partition hashes, and structural cross-partition references without side effects.
   */
  public static validateArchive(archive: PartitionedArchive): {
    valid: boolean;
    errorReason?: string;
    partitionCount?: number;
    manifest?: ArchiveManifest;
  } {
    if (!archive || typeof archive !== 'object' || !archive.manifest || !archive.partitions) {
      return { valid: false, errorReason: 'Invalid archive structure: missing manifest or partitions container.' };
    }

    // 1. Schema check
    if (archive.manifest.archiveSchemaVersion !== this.CURRENT_SCHEMA_VERSION) {
      return {
        valid: false,
        errorReason: `Unsupported archive schema version '${archive.manifest.archiveSchemaVersion}'. Expected '${this.CURRENT_SCHEMA_VERSION}'.`,
      };
    }

    // 2. Hash integrity check across all partitions declared in manifest
    if (!archive.manifest.partitionHashes || Object.keys(archive.manifest.partitionHashes).length === 0) {
      return { valid: false, errorReason: 'Archive manifest contains no partitionHashes definitions.' };
    }

    for (const [partitionName, expectedHash] of Object.entries(archive.manifest.partitionHashes)) {
      const content = archive.partitions[partitionName as keyof typeof archive.partitions];
      if (content === undefined || content === null) {
        return { valid: false, errorReason: `Missing archive partition '${partitionName}'.` };
      }
      const actualHash = this.computeSha256(content);
      if (actualHash !== expectedHash) {
        return {
          valid: false,
          errorReason: `Integrity check failed for partition '${partitionName}'. Hash mismatch! (Expected ${expectedHash}, computed ${actualHash})`,
        };
      }
    }

    // 3. Parse JSON partitions safely & check cross-partition references
    try {
      const world = JSON.parse(archive.partitions['canonical/world.json']);
      const player = JSON.parse(archive.partitions['canonical/player.json']);
      const inventory = JSON.parse(archive.partitions['canonical/inventory.json']);
      JSON.parse(archive.partitions['canonical/npcs.json']);
      JSON.parse(archive.partitions['canonical/chronicle.json']);
      JSON.parse(archive.partitions['canonical/narrative.json']);

      if (archive.partitions['canonical/capabilities.json']) {
        JSON.parse(archive.partitions['canonical/capabilities.json']);
      }
      if (archive.partitions['canonical/progression.json']) {
        JSON.parse(archive.partitions['canonical/progression.json']);
      }
      if (archive.partitions['canonical/combat.json']) {
        JSON.parse(archive.partitions['canonical/combat.json']);
      }
      if (archive.partitions['canonical/memories.json']) {
        JSON.parse(archive.partitions['canonical/memories.json']);
      }
      if (archive.partitions['canonical/living_world.json']) {
        JSON.parse(archive.partitions['canonical/living_world.json']);
      }
      if (archive.partitions['canonical/adaptation.json']) {
        JSON.parse(archive.partitions['canonical/adaptation.json']);
      }
      if (archive.partitions['canonical/assets.json']) {
        JSON.parse(archive.partitions['canonical/assets.json']);
      }

      // Cross-Partition Reference Validation
      if (player && player.locationId && world && world.geography && Array.isArray(world.geography.nodes)) {
        const nodeIds = world.geography.nodes.map((n: any) => n.id);
        if (nodeIds.length > 0 && !nodeIds.includes(player.locationId)) {
          return {
            valid: false,
            errorReason: `Cross-partition reference error: Player location '${player.locationId}' does not exist in GeographyGraph nodes.`,
          };
        }
      }

      if (inventory && Array.isArray(inventory.itemInstances) && Array.isArray(inventory.itemDefinitions)) {
        const defIds = new Set(inventory.itemDefinitions.map((d: any) => d.id));
        for (const item of inventory.itemInstances) {
          if (!defIds.has(item.defId)) {
            return {
              valid: false,
              errorReason: `Cross-partition reference error: Item instance '${item.id}' references undefined itemDefinition '${item.defId}'.`,
            };
          }
        }
      }

      return {
        valid: true,
        partitionCount: Object.keys(archive.partitions).length,
        manifest: archive.manifest,
      };
    } catch (e: any) {
      return {
        valid: false,
        errorReason: `Partition content corrupted: JSON parse error (${e?.message || 'invalid JSON'}).`,
      };
    }
  }

  /**
   * Atomic Restore (DreamBook V10.8.31.4)
   * Stages archive, verifies SHA-256 hashes against manifest, validates schema, and returns validated state.
   */
  public static validateAndRestoreArchive(archive: PartitionedArchive): {
    valid: boolean;
    errorReason?: string;
    restoredCampaign?: RestoredCampaignData;
  } {
    const validation = this.validateArchive(archive);
    if (!validation.valid) {
      return { valid: false, errorReason: validation.errorReason };
    }

    try {
      const world = JSON.parse(archive.partitions['canonical/world.json']);
      const player = JSON.parse(archive.partitions['canonical/player.json']);
      const inventory = JSON.parse(archive.partitions['canonical/inventory.json']);
      const npcs = JSON.parse(archive.partitions['canonical/npcs.json']);
      const chronicle = JSON.parse(archive.partitions['canonical/chronicle.json']);
      const narrative = JSON.parse(archive.partitions['canonical/narrative.json']);
      const capabilities = archive.partitions['canonical/capabilities.json']
        ? JSON.parse(archive.partitions['canonical/capabilities.json'])
        : undefined;
      const progression = archive.partitions['canonical/progression.json']
        ? JSON.parse(archive.partitions['canonical/progression.json'])
        : undefined;
      const combat = archive.partitions['canonical/combat.json']
        ? JSON.parse(archive.partitions['canonical/combat.json'])
        : undefined;
      const memories = archive.partitions['canonical/memories.json']
        ? JSON.parse(archive.partitions['canonical/memories.json'])
        : undefined;
      const livingWorld = archive.partitions['canonical/living_world.json']
    
        ? JSON.parse(archive.partitions['canonical/living_world.json'])
    
        : undefined;
      const sensoryConfig = archive.partitions['canonical/sensory_config.json'] ? JSON.parse(archive.partitions['canonical/sensory_config.json']) : undefined;
      const adaptationState = archive.partitions['canonical/adaptation.json'] ? JSON.parse(archive.partitions['canonical/adaptation.json']) : undefined;
      const assets = archive.partitions['canonical/assets.json']
        ? JSON.parse(archive.partitions['canonical/assets.json'])
        : undefined;

      return {
        valid: true,
        restoredCampaign: {
          campaignId: archive.manifest.campaignId,
          title: archive.manifest.title,
          world,
          player,
          inventory,
          npcs,
          chronicle,
          narrative,
          capabilities,
          progression,
          combat,
          memories,
          livingWorld,
          sensoryConfig,
          adaptationState,
          assets,
        },
      };
    } catch (e: any) {
      return { valid: false, errorReason: `Partition content corrupted: ${e?.message || 'JSON parse error.'}` };
    }
  }
}

