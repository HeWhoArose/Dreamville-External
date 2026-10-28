import { buildItemDescription, type ItemCategory } from './inventoryItem';
import type { WorldRepository } from '../repositories/worldRepository';
import type { CurrentSituation } from './currentSituation';
import type { LocationSceneObject } from './types';

export type SceneInteractionKind = 'NONE' | 'SEARCH' | 'PICKUP';

export interface SceneInteractionStateChange {
  kind: 'SCENE_OBJECT' | 'INVENTORY';
  targetId: string;
  value: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SceneInteractionResult {
  kind: SceneInteractionKind;
  attempted: boolean;
  committed: boolean;
  /** Canonical prose-safe summary for narration. Never invents an object. */
  feedback?: string;
  errorReason?: string;
  discoveredObjectId?: string;
  pickedUpItemId?: string;
  canonicalStateChanges: SceneInteractionStateChange[];
  evidence: string[];
}

export interface GroundedObservation {
  relevant: boolean;
  text?: string;
  evidence: string[];
  limitation?: string;
}

const SEARCH_PATTERN = /\b(?:search|look for|look around|look about|rummage|scavenge|scour|hunt for|find|seek|check (?:for|around)|gather|pick through)\b/i;
const PICKUP_PATTERN = /\b(?:pick up|picks up|picking up|take|takes|taking|grab|grabs|grabbing|collect|collects|collecting|lift|lifts|lifting|retrieve|retrieves|retrieving|pocket|pockets|pocketing)\b/i;

const TARGET_STOP_WORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'the', 'a', 'an', 'some', 'any', 'this', 'that', 'these', 'those',
  'for', 'around', 'about', 'nearby', 'near', 'here', 'there', 'in', 'on', 'at', 'from', 'to', 'of',
  'and', 'or', 'with', 'up', 'down', 'out', 'into', 'onto', 'through', 'over', 'under', 'left', 'right',
  'search', 'look', 'looking', 'find', 'finding', 'seek', 'seeking', 'hunt', 'hunting', 'check',
  'checking', 'examine', 'examining', 'inspect', 'inspecting', 'scan', 'scanning', 'survey',
  'surveying', 'rummage', 'rummaging', 'scavenge', 'scavenging', 'scour', 'scouring', 'gather',
  'gathering', 'pick', 'picking', 'picked', 'take', 'takes', 'taking', 'took', 'grab', 'grabs',
  'grabbing', 'grabbed', 'collect', 'collects', 'collecting', 'collected', 'lift', 'lifts',
  'lifting', 'lifted', 'retrieve', 'retrieves', 'retrieving', 'retrieved', 'pocket', 'pockets',
  'pocketing', 'pocketed', 'place', 'area', 'ground', 'floor', 'room', 'scene', 'surroundings',
  'something', 'anything', 'item', 'object', 'thing', 'that', 'which', 'is', 'are', 'be', 'can',
  'could', 'would', 'should', 'do', 'does', 'did', 'get', 'gets', 'getting', 'got', 'hold', 'holds',
  'holding', 'my', 'hand', 'hands', 'from', 'off',
]);

function words(value: unknown): string[] {
  return String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .map((word) => word.replace(/s$/, ''));
}

function targetWords(actionText: string): string[] {
  return Array.from(new Set(words(actionText).filter((word) => !TARGET_STOP_WORDS.has(word))));
}

function objectVocabulary(object: LocationSceneObject): string[] {
  const properties = object.properties && typeof object.properties === 'object' ? object.properties : {};
  const aliases = Array.isArray(properties.searchAliases)
    ? properties.searchAliases.map((alias) => String(alias))
    : [];
  return Array.from(new Set([
    object.name,
    ...(Array.isArray(object.tags) ? object.tags : []),
    ...aliases,
  ].flatMap(words)));
}

function scoreObject(object: LocationSceneObject, requested: string[]): number {
  if (requested.length === 0) return 0;
  const vocabulary = objectVocabulary(object);
  const matched = requested.filter((word) => vocabulary.some((candidate) =>
    candidate === word || candidate.startsWith(word) || word.startsWith(candidate),
  ));
  if (matched.length === 0) return 0;
  // Partial matches are tolerated, but require at least one distinctive noun.
  return matched.length * 10 + (requested.length === matched.length ? 5 : 0);
}

function sortedMatches(objects: LocationSceneObject[], requested: string[]): LocationSceneObject[] {
  return objects
    .map((object) => ({ object, score: scoreObject(object, requested) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.object.id.localeCompare(b.object.id))
    .map((entry) => entry.object);
}

function asItemCategory(value: unknown): ItemCategory {
  const normalized = String(value || 'Miscellaneous');
  const allowed: ItemCategory[] = ['Weapon', 'Armor', 'Shield', 'Potion', 'Scroll', 'Quest', 'Material', 'Document', 'Food', 'Accessory', 'Tool', 'Miscellaneous'];
  return allowed.includes(normalized as ItemCategory) ? normalized as ItemCategory : 'Miscellaneous';
}

function objectIsTakeable(object: LocationSceneObject): boolean {
  const properties = object.properties && typeof object.properties === 'object' ? object.properties : {};
  return object.kind === 'ITEM'
    || object.kind === 'OTHER' && object.interactable === true
    || properties.takeable === true;
}

function hasMatchingKey(repository: WorldRepository, storyId: string, actorId: string, keyTag: unknown): boolean {
  const requiredTag = String(keyTag || '').trim().toLowerCase();
  if (!requiredTag) return false;
  return repository.getInventoryEngine(storyId).getActorInventory(actorId).some((item) => {
    const name = String(item.name || '').toLowerCase();
    const tags = [
      ...(Array.isArray((item as any).tags) ? (item as any).tags : []),
      ...((repository.getInventoryEngine(storyId).getItemDefinition(item.defId)?.tags) || []),
    ].map((tag) => String(tag).toLowerCase());
    return name.includes(requiredTag.replace(/_/g, ' ')) || tags.includes(requiredTag);
  });
}

function ensureSceneItemDefinition(
  repository: WorldRepository,
  storyId: string,
  object: LocationSceneObject,
): string {
  const inventory = repository.getInventoryEngine(storyId);
  const properties = object.properties && typeof object.properties === 'object' ? object.properties : {};
  const explicitDefinitionId = String(properties.itemDefinitionId || '').trim();
  if (explicitDefinitionId && inventory.getItemDefinition(explicitDefinitionId)) {
    return explicitDefinitionId;
  }
  const slug = String(object.name || object.id).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const defId = explicitDefinitionId || `def_scene_${slug || 'object'}`;
  if (!inventory.getItemDefinition(defId)) {
    const category = asItemCategory(properties.itemCategory);
    const weightKg = Number(properties.weightKg);
    const baseValueGold = Number(properties.baseValueGold);
    inventory.registerDefinition({
      id: defId,
      name: object.name,
      category,
      rarity: 'Common',
      description: object.description || buildItemDescription({
        name: object.name,
        category,
        properties,
      }),
      weightKg: Number.isFinite(weightKg) && weightKg >= 0 ? weightKg : 0.5,
      baseValueGold: Number.isFinite(baseValueGold) && baseValueGold >= 0 ? baseValueGold : 0,
      maxDurability: 1,
      tags: Array.from(new Set([
        ...(Array.isArray(object.tags) ? object.tags : []),
        'scene_object',
      ])),
      properties: JSON.parse(JSON.stringify(properties)),
    });
  }
  return defId;
}

/**
 * Canonical scene-object discovery and pickup.
 *
 * - Search only resolves against the canonical scene (location scene objects and
 *   ground item instances). It never creates an object from narration.
 * - A concealed object that already exists canonically may be made perceptible
 *   by a successful search; that discovery persists in GeographyGraph.
 * - Searching never picks an object up. Pickup is a distinct, explicit action
 *   committed through inventory/geography authorities.
 */
export class SceneInteractionAuthority {
  public static resolve(params: {
    repository: WorldRepository;
    storyId: string;
    actorId: string;
    actionText: string;
    locationId: string;
  }): SceneInteractionResult {
    const { repository, storyId, actorId, locationId } = params;
    const actionText = String(params.actionText || '');
    if (!locationId) {
      return { kind: 'NONE', attempted: false, committed: false, canonicalStateChanges: [], evidence: [] };
    }
    const location = repository.getGeographyGraph(storyId).getNode(locationId);
    if (!location) {
      return { kind: 'NONE', attempted: false, committed: false, canonicalStateChanges: [], evidence: [] };
    }

    const pickupIntent = PICKUP_PATTERN.test(actionText);
    const searchIntent = SEARCH_PATTERN.test(actionText);
    if (!pickupIntent && !searchIntent) {
      return { kind: 'NONE', attempted: false, committed: false, canonicalStateChanges: [], evidence: [] };
    }

    const requested = targetWords(actionText);
    const sceneObjects = Array.isArray(location.sceneObjects) ? location.sceneObjects : [];

    if (pickupIntent) {
      return this.pickUp({ repository, storyId, actorId, locationId, requested, sceneObjects });
    }
    return this.search({ repository, storyId, locationId, requested, sceneObjects, location });
  }

  private static search(params: {
    repository: WorldRepository;
    storyId: string;
    locationId: string;
    requested: string[];
    sceneObjects: LocationSceneObject[];
    location: any;
  }): SceneInteractionResult {
    const { repository, storyId, locationId, requested, sceneObjects, location } = params;
    const visible = sceneObjects.filter((object) => object.visible !== false);
    const concealed = sceneObjects.filter((object) => object.visible === false && object.properties?.discoverable !== false);

    const visibleMatch = sortedMatches(visible, requested)[0];
    if (visibleMatch) {
      return {
        kind: 'SEARCH',
        attempted: true,
        committed: false,
        feedback: `Canonical scene evidence: ${visibleMatch.name} is present in ${location.name}${visibleMatch.description ? ` — ${visibleMatch.description}` : ''}. Searching does not move or take it.`,
        discoveredObjectId: visibleMatch.id,
        canonicalStateChanges: [],
        evidence: [visibleMatch.name, ...(visibleMatch.tags || [])],
      };
    }

    const concealedMatch = sortedMatches(concealed, requested)[0];
    if (concealedMatch) {
      const graph = repository.getGeographyGraph(storyId);
      const patched = graph.patchSceneObject(locationId, concealedMatch.id, {
        visible: true,
        properties: {
          ...(concealedMatch.properties || {}),
          discoveredBy: params.repository.getPlayerLifecycle(storyId)?.actorId || 'actor',
          discoveredAtTurn: repository.getCanonicalCommandEventCount(storyId) + 1,
        },
      });
      if (patched.success) {
        return {
          kind: 'SEARCH',
          attempted: true,
          committed: true,
          feedback: `Canonical discovery: ${concealedMatch.name} is revealed by the search in ${location.name}${concealedMatch.description ? ` — ${concealedMatch.description}` : ''}. It has not been picked up.`,
          discoveredObjectId: concealedMatch.id,
          canonicalStateChanges: [{
            kind: 'SCENE_OBJECT',
            targetId: concealedMatch.id,
            value: { locationId, visible: true, discovered: true },
            metadata: { source: 'canonical_scene_search' },
          }],
          evidence: [concealedMatch.name, ...(concealedMatch.tags || [])],
        };
      }
    }

    const groundMatch = this.findGroundItem(repository, storyId, locationId, requested);
    if (groundMatch) {
      return {
        kind: 'SEARCH',
        attempted: true,
        committed: false,
        feedback: `Canonical scene evidence: ${groundMatch.name} is lying in ${location.name}. Searching does not pick it up.`,
        discoveredObjectId: groundMatch.id,
        canonicalStateChanges: [],
        evidence: [groundMatch.name],
      };
    }

    const requestedLabel = requested.length ? requested.join(' ') : 'anything';
    const available = [
      ...visible.map((object) => object.name),
      ...this.listGroundItems(repository, storyId, locationId).map((item) => item.name),
    ].slice(0, 12);
    const features = Array.isArray(location.environment?.features)
      ? location.environment.features.map((feature: unknown) => String(feature)).filter(Boolean).slice(0, 8)
      : [];
    return {
      kind: 'SEARCH',
      attempted: true,
      committed: false,
      feedback: `The canonical scene does not establish any ${requestedLabel} here. Searching does not create one.` +
        (available.length ? ` Established objects: ${available.join(', ')}.` : '') +
        (features.length ? ` Established environment: ${features.join(', ')}.` : ''),
      canonicalStateChanges: [],
      evidence: [...available, ...features],
    };
  }

  private static pickUp(params: {
    repository: WorldRepository;
    storyId: string;
    actorId: string;
    locationId: string;
    requested: string[];
    sceneObjects: LocationSceneObject[];
  }): SceneInteractionResult {
    const { repository, storyId, actorId, locationId, requested, sceneObjects } = params;
    const visible = sceneObjects.filter((object) => object.visible !== false);
    const takeable = visible.filter(objectIsTakeable);
    const matched = sortedMatches(takeable, requested)[0];

    if (!matched) {
      const groundMatch = this.findGroundItem(repository, storyId, locationId, requested);
      if (groundMatch) {
        const transfer = repository.getInventoryEngine(storyId).transferItem(
          groundMatch.id,
          locationId,
          actorId,
          'actor',
        );
        if (!transfer.success) {
          return {
            kind: 'PICKUP', attempted: true, committed: false,
            errorReason: transfer.errorReason,
            feedback: `The attempt to pick up ${groundMatch.name} did not commit: ${transfer.errorReason || 'inventory transfer failed'}.`,
            canonicalStateChanges: [], evidence: [groundMatch.name],
          };
        }
        return {
          kind: 'PICKUP', attempted: true, committed: true,
          pickedUpItemId: transfer.transferredItem?.id || groundMatch.id,
          feedback: `${groundMatch.name} is now in the actor's inventory.`,
          canonicalStateChanges: [{
            kind: 'INVENTORY', targetId: actorId,
            value: { itemId: transfer.transferredItem?.id || groundMatch.id, from: locationId },
            metadata: { source: 'canonical_scene_pickup' },
          }],
          evidence: [groundMatch.name],
        };
      }

      const fixedMatch = sortedMatches(visible.filter((object) => !objectIsTakeable(object)), requested)[0];
      if (fixedMatch) {
        return {
          kind: 'PICKUP', attempted: true, committed: false,
          errorReason: 'The matched scene object is not takeable.',
          feedback: `${fixedMatch.name} is a fixed part of the scene and cannot be picked up.`,
          canonicalStateChanges: [], evidence: [fixedMatch.name],
        };
      }
      return {
        kind: 'PICKUP', attempted: true, committed: false,
        errorReason: 'No matching takeable object exists in the canonical scene.',
        feedback: `There is no ${requested.length ? requested.join(' ') : 'such object'} to pick up here.`,
        canonicalStateChanges: [], evidence: [],
      };
    }

    const properties = matched.properties && typeof matched.properties === 'object' ? matched.properties : {};
    if (properties.locked === true && !hasMatchingKey(repository, storyId, actorId, properties.keyTag)) {
      return {
        kind: 'PICKUP', attempted: true, committed: false,
        errorReason: 'The scene object is locked and no matching key is held.',
        feedback: `${matched.name} is locked. The character does not hold a matching key, so it cannot be taken.`,
        canonicalStateChanges: [], evidence: [matched.name],
      };
    }

    const inventory = repository.getInventoryEngine(storyId);
    const defId = ensureSceneItemDefinition(repository, storyId, matched);
    const instance = inventory.createInstance({
      defId,
      ownerEntityId: actorId,
      containerType: 'actor',
      provenance: `scene_object:${matched.id}`,
      customName: matched.name,
    });
    const graph = repository.getGeographyGraph(storyId);
    const removed = graph.removeSceneObject(locationId, matched.id);
    if (!removed.success) {
      return {
        kind: 'PICKUP', attempted: true, committed: false,
        errorReason: removed.errorReason,
        feedback: `The pickup did not commit: ${removed.errorReason || 'the scene object could not be removed'}.`,
        canonicalStateChanges: [], evidence: [matched.name],
      };
    }

    return {
      kind: 'PICKUP', attempted: true, committed: true,
      pickedUpItemId: instance.id,
      feedback: `${matched.name} is now in the actor's inventory and is no longer present at ${locationId}.`,
      canonicalStateChanges: [
        {
          kind: 'SCENE_OBJECT', targetId: matched.id,
          value: { locationId, removed: true },
          metadata: { source: 'canonical_scene_pickup' },
        },
        {
          kind: 'INVENTORY', targetId: actorId,
          value: { itemId: instance.id, defId, from: locationId },
          metadata: { source: 'canonical_scene_pickup' },
        },
      ],
      evidence: [matched.name],
    };
  }

  private static listGroundItems(repository: WorldRepository, storyId: string, locationId: string) {
    const inventory = repository.getInventoryEngine(storyId);
    return inventory
      .getItemInstancesByOwner(locationId)
      .filter((item) => item.containerType === 'ground' && item.destroyedAtSeconds === undefined)
      .map((item) => ({
        ...item,
        name: item.name || inventory.getItemDefinition(item.defId)?.name || item.defId,
      }));
  }

  private static findGroundItem(
    repository: WorldRepository,
    storyId: string,
    locationId: string,
    requested: string[],
  ) {
    const items = this.listGroundItems(repository, storyId, locationId);
    if (items.length === 0) return undefined;
    return items
      .map((item) => {
        const definition = repository.getInventoryEngine(storyId).getItemDefinition(item.defId);
        const vocabulary = words([item.name, ...(definition?.tags || [])].join(' '));
        const score = requested.filter((word) => vocabulary.some((candidate) =>
          candidate === word || candidate.startsWith(word) || word.startsWith(candidate),
        )).length;
        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))[0]?.item;
  }
}

/**
 * Grounded observation resolution.
 *
 * This is deterministic evidence assembly, not narration. It answers what the
 * canonical location/occupancy/scene actually supports so a narrator can state
 * a result or an honest limitation instead of inventing a crowd or a room.
 */
export function resolveGroundedObservation(
  situation: CurrentSituation,
  actionText: string,
): GroundedObservation {
  const normalized = String(actionText || '').toLowerCase();
  const crowdIntent = /\b(?:crowd|crowded|busy|bustling|throng|lots? of people|many people|where (?:are|is) (?:the )?people|public|market|populated)\b/.test(normalized);
  const observationIntent = /\b(?:look|looks|looked|look around|observe|scan|survey|search|inspect|examine|watch|notice|listen|hear)\b/.test(normalized);
  if (!crowdIntent && !observationIntent) {
    return { relevant: false, evidence: [] };
  }

  // Resolve a directly named, player-visible scene object before falling back
  // to aggregate occupancy. Opening and live-turn projections share these
  // canonical object refs, so observing a prepared victim or clue can answer
  // from its owner record without inventing details or exposing concealed props.
  const ignoredTargetWords = new Set([
    'look', 'looks', 'looked', 'around', 'observe', 'observes', 'observed', 'scan', 'scans', 'scanned',
    'survey', 'surveys', 'surveyed', 'search', 'searches', 'searched', 'inspect', 'inspects', 'inspected',
    'examine', 'examines', 'examined', 'watch', 'watches', 'watched', 'notice', 'notices', 'noticed',
    'listen', 'listens', 'listened', 'hear', 'hears', 'heard', 'the', 'for', 'crowded', 'crowd', 'place',
    'environment', 'surroundings', 'area', 'scene', 'nearby', 'here', 'there', 'what', 'making', 'it',
  ]);
  const requestedTargetWords = Array.from(new Set(
    (normalized.match(/[a-z0-9]+/g) || []).filter((word) => word.length >= 3 && !ignoredTargetWords.has(word)),
  ));
  const targetedObject = requestedTargetWords.length
    ? (situation.sceneEvidence?.objects || [])
      .filter((object) => object.visibleToPlayer)
      .map((object) => {
        const role = String(object.properties?.worldDirectorRole || '').toUpperCase();
        const roleAliases = role === 'INVESTIGATION_BODY'
          ? ['victim', 'corpse', 'body']
          : role === 'INVESTIGATION_EVIDENCE'
            ? ['clue', 'evidence']
            : [];
        const vocabulary = new Set([
          ...words(object.name),
          ...(object.tags || []).flatMap(words),
          ...roleAliases,
        ]);
        const matchedWords = requestedTargetWords.filter((word) =>
          Array.from(vocabulary).some((candidate) => candidate === word || candidate.startsWith(word) || word.startsWith(candidate)),
        );
        return { object, matchedWords };
      })
      .filter((entry) => entry.matchedWords.length > 0)
      .sort((left, right) => right.matchedWords.length - left.matchedWords.length || left.object.id.localeCompare(right.object.id))[0]?.object
    : undefined;

  if (targetedObject) {
    const description = targetedObject.description ? ` ${targetedObject.description}` : '';
    return {
      relevant: true,
      text: `Canonical scene evidence at ${situation.location.name}: ${targetedObject.name} is present.${description}`,
      evidence: [targetedObject.id, targetedObject.name],
    };
  }

  const occupancy = situation.sceneEvidence?.occupancy || { status: 'UNKNOWN', accessControlled: false, provenance: 'UNKNOWN' };
  const entities = (situation.nearbyEntities || []).filter((entity) =>
    entity.visibleToPlayer && entity.kind !== 'PLAYER' && entity.presence === 'present' && entity.isAlive,
  );
  // Player-facing evidence must use the epistemic projection label, never the
  // canonical name of a person the viewer has not been introduced to.
  const activities = entities
    .map((entity) => entity.currentActivity
      ? `${entity.displayName || entity.name} is ${entity.currentActivity}`
      : (entity.displayName || entity.name))
    .slice(0, 6);
  const evidence = [
    `occupancy=${occupancy.status}${occupancy.expectedPopulation ? `/${occupancy.expectedPopulation}` : ''}`,
    ...(occupancy.explanation ? [occupancy.explanation] : []),
    ...(situation.sceneEvidence?.ambientActivity ? [situation.sceneEvidence.ambientActivity] : []),
    ...activities,
  ];

  const base = `Canonical occupancy at ${situation.location.name}: ${occupancy.status}` +
    (occupancy.expectedPopulation ? ` (${occupancy.expectedPopulation})` : '') +
    (occupancy.accessControlled ? ', access controlled' : '') + '.';

  if (occupancy.status === 'ABANDONED') {
    return {
      relevant: true,
      text: `${base} ${occupancy.explanation || 'The location is explicitly established as abandoned.'} No current occupants are established there.`,
      evidence,
      limitation: 'The location is canonically abandoned.',
    };
  }
  if (occupancy.status === 'RESTRICTED') {
    return {
      relevant: true,
      text: `${base} Ordinary public crowds are not established; only authorized occupants may be present.` +
        (entities.length ? ` ${entities.length} person(s) are individually visible: ${activities.join('; ')}.` : ' No individual occupant is currently visible.'),
      evidence,
      limitation: 'Access-controlled location; public crowd activity is not established.',
    };
  }
  if (occupancy.status === 'UNKNOWN') {
    return {
      relevant: true,
      text: `${base} The scene records no established crowd or public activity.` +
        (entities.length
          ? ` ${entities.length} person(s) are individually visible: ${activities.join('; ')}. Their presence does not establish the location's total population.`
          : ' No individual occupant is visible, and the unknown occupancy means the scene does not establish whether anyone else is nearby.'),
      evidence,
      limitation: 'Occupancy is unknown; the scene does not establish a crowd.',
    };
  }

  // INHABITED
  if (occupancy.expectedPopulation === 'NONE') {
    return {
      relevant: true,
      text: `${base} The established expected population is NONE; no ordinary crowd is established.`,
      evidence,
      limitation: 'No expected population is established.',
    };
  }

  const crowdScale = occupancy.expectedPopulation === 'DENSE'
    ? 'dense'
    : occupancy.expectedPopulation === 'MODERATE'
      ? 'moderate'
      : occupancy.expectedPopulation === 'SPARSE'
        ? 'sparse'
        : 'variable';
  const aggregate = situation.sceneEvidence?.ambientActivity;
  const visibleSummary = entities.length
    ? `${entities.length} person(s) are individually visible: ${activities.join('; ')}.`
    : 'No individual occupant is currently visible in the immediate projection.';
  const crowded = occupancy.expectedPopulation === 'DENSE' || occupancy.expectedPopulation === 'MODERATE';
  if (crowdIntent && !crowded) {
    return {
      relevant: true,
      text: `${base} The established population is ${crowdScale}, so this location is not established as crowded. ${visibleSummary}` +
        (aggregate ? ` Recorded ordinary activity: ${aggregate}` : ''),
      evidence,
      limitation: 'This location is not established as crowded.',
    };
  }

  return {
    relevant: true,
    text: `${base} The established population is ${crowdScale}.` +
      (aggregate ? ` ${aggregate}` : '') +
      ` ${visibleSummary}` +
      (entities.length === 0 && crowded
        ? ' Aggregate occupancy supports ordinary activity here, but no individually authored person is in the current projection.'
        : ''),
    evidence,
  };
}

export const sceneInteractionAuthority = SceneInteractionAuthority;
