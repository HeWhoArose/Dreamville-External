import type { WorldRepository } from '../repositories/worldRepository';
import type { LocationSceneObject } from './types';
import type { ImprovisableSource } from './locationArchetypes';
import { deterministicId } from './deterministicRng';

const DEFAULT_LIMIT = 3;
const IMPROVISE_VERB = /\b(?:break|breaks|snap|snaps|tear|tears|rip|rips|pry|pries|wrench|wrenches|yank|yanks|pull|pulls|pluck|plucks|fashion|fashions|improvise|improvises|whittle|whittles|salvage|salvages)\b/i;
const MAKE_WEAPON = /\b(?:make|makes|craft|crafts|fashion|fashions|improvise|improvises)\b.*\b(?:weapon|club|staff|spear|shield|cudgel|stake)\b/i;

export function hasImproviseVerb(actionText: string): boolean {
  return IMPROVISE_VERB.test(actionText) || MAKE_WEAPON.test(actionText);
}

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1);
}

function sourceVocabulary(source: ImprovisableSource): Set<string> {
  return new Set([...source.sources.flatMap(tokens), ...tokens(source.name)]);
}

/** The improvisable source the request refers to, if the location authors one. */
export function findImprovisableSource(
  sources: ImprovisableSource[] | undefined,
  requested: string[],
): ImprovisableSource | undefined {
  if (!Array.isArray(sources) || !requested.length) return undefined;
  const wanted = new Set(requested.map((word) => word.toLowerCase()));
  let best: { source: ImprovisableSource; score: number } | undefined;
  for (const source of sources) {
    const vocab = sourceVocabulary(source);
    let score = 0;
    for (const word of wanted) if (vocab.has(word)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { source, score };
  }
  return best?.source;
}

function takenCount(repository: WorldRepository, storyId: string, locationId: string, sourceKey: string): number {
  const provenance = `improvised:${locationId}:${sourceKey}`;
  return repository.getInventoryEngine(storyId).getAllItemInstances().filter((instance) => instance.provenance === provenance).length;
}

/**
 * Turns an authored improvisable source into a real, takeable scene object, up to the source's limit.
 * Returns the object (not yet picked up) or an explanation of why the scene refuses.
 */
export function materialiseImprovisedObject(params: {
  repository: WorldRepository;
  storyId: string;
  locationId: string;
  source: ImprovisableSource;
}): { success: boolean; object?: LocationSceneObject; errorReason?: string } {
  const { repository, storyId, locationId, source } = params;
  const graph = repository.getGeographyGraph(storyId);
  const node = graph.getNode(locationId);
  if (!node) return { success: false, errorReason: `Location '${locationId}' not found.` };

  const limit = Math.max(1, Math.floor(source.limit ?? DEFAULT_LIMIT));
  const existing = (node.sceneObjects || []).filter((obj) => obj.properties?.improvisedSourceKey === source.key).length;
  const taken = takenCount(repository, storyId, locationId, source.key);
  if (existing + taken >= limit) {
    return { success: false, errorReason: `There is nothing more here to make ${source.name.toLowerCase()} from.` };
  }

  const object: LocationSceneObject = {
    id: deterministicId('improv', locationId, source.key, taken + existing),
    name: source.name,
    kind: 'ITEM',
    description: source.description,
    visible: true,
    interactable: true,
    tags: ['improvised', source.category.toLowerCase(), source.key],
    properties: {
      origin: 'IMPROVISED',
      takeable: true,
      improvisedSourceKey: source.key,
      improvisedProvenance: `improvised:${locationId}:${source.key}`,
      itemCategory: source.category,
      maxDurability: source.maxDurability,
      durabilityFraction: source.durabilityFraction ?? 1,
      attackBonus: source.attackBonus,
      armorBonus: source.armorBonus,
      damageDice: source.damageDice,
    },
    provenance: 'IMPROVISED_FROM_SCENE_PROFILE',
    lifecycleStage: 'PERSISTENT',
  };
  const added = graph.addSceneObject(locationId, object);
  return added.success ? { success: true, object: added.object } : { success: false, errorReason: added.errorReason };
}
