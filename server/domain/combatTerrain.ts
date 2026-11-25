import type { DynamicHazardZone } from '../../src/types';
import type { CombatObstacle, TacticalCombatEngine } from './combatEngine';
import type { WorldRepository } from '../repositories/worldRepository';

/**
 * Authored battlefield terrain for a location: where the walls and rubble are, which of them give cover, where the pits, bridges
 * and traps are, and where the fighters start. A world pack declares it once; every fight at that location is built from it.
 */
export interface AuthoredTerrain {
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
  obstacles?: Array<{ x: number; y: number; isImpassable?: boolean; blocksSight?: boolean; cover?: 'HALF' | 'THREE_QUARTERS' | 'TOTAL'; label?: string }>;
  hazards?: DynamicHazardZone[];
  /** Where the protagonist and the opponent stand when the fight begins. */
  startPositions?: { player: { x: number; y: number }; enemy: { x: number; y: number } };
}

const EFFECT_TYPE = 'COMBAT_TERRAIN';
const HAZARD_TYPES = new Set(['fire_zone', 'ice_patch', 'poison_cloud', 'barricade', 'pit', 'bridge', 'trap']);
const COVER = new Set(['HALF', 'THREE_QUARTERS', 'TOTAL']);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Problems with an authored terrain block. An empty list means it is usable. */
export function validateAuthoredTerrain(terrain: AuthoredTerrain, label = 'terrain'): string[] {
  const problems: string[] = [];
  const bounds = terrain.bounds;
  if (bounds && !(finite(bounds.minX) && finite(bounds.maxX) && finite(bounds.minY) && finite(bounds.maxY) && bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY)) {
    problems.push(`${label} has invalid bounds`);
  }
  const inside = (x: number, y: number) => !bounds || (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY);
  for (const [index, obstacle] of (terrain.obstacles || []).entries()) {
    if (!finite(obstacle.x) || !finite(obstacle.y)) problems.push(`${label} obstacle ${index + 1} has no position`);
    else if (!inside(obstacle.x, obstacle.y)) problems.push(`${label} obstacle ${index + 1} is outside the bounds`);
    if (obstacle.cover !== undefined && !COVER.has(obstacle.cover)) problems.push(`${label} obstacle ${index + 1} has unknown cover "${obstacle.cover}"`);
  }
  const ids = new Set<string>();
  for (const hazard of terrain.hazards || []) {
    if (!hazard.id) problems.push(`${label} has a hazard with no id`);
    if (ids.has(hazard.id)) problems.push(`${label} hazard "${hazard.id}" is duplicated`);
    ids.add(hazard.id);
    if (!HAZARD_TYPES.has(hazard.type)) problems.push(`${label} hazard "${hazard.id}" has unknown type "${hazard.type}"`);
    if (!finite(hazard.x) || !finite(hazard.y) || !inside(hazard.x, hazard.y)) problems.push(`${label} hazard "${hazard.id}" is outside the bounds`);
  }
  const starts = terrain.startPositions;
  if (starts) {
    for (const [who, spot] of [['player', starts.player], ['enemy', starts.enemy]] as const) {
      if (!spot || !finite(spot.x) || !finite(spot.y) || !inside(spot.x, spot.y)) problems.push(`${label} ${who} start is missing or outside the bounds`);
    }
    if (starts.player && starts.enemy && starts.player.x === starts.enemy.x && starts.player.y === starts.enemy.y) problems.push(`${label} starts both fighters on one square`);
    const blocked = (spot?: { x: number; y: number }) => Boolean(spot && (terrain.obstacles || []).some((obstacle) => obstacle.x === spot.x && obstacle.y === spot.y && obstacle.isImpassable !== false && !obstacle.cover));
    if (blocked(starts.player) || blocked(starts.enemy)) problems.push(`${label} starts a fighter inside an impassable obstacle`);
  }
  return problems;
}

export function saveAuthoredTerrain(repository: WorldRepository, storyId: string, locationId: string, terrain: AuthoredTerrain): void {
  repository.saveActiveEffect({
    id: `combat_terrain_${storyId}_${locationId}`,
    type: EFFECT_TYPE,
    storyId,
    locationId,
    terrain: JSON.parse(JSON.stringify(terrain)),
    canonical: true,
  });
}

export function loadAuthoredTerrain(repository: WorldRepository, storyId: string, locationId: string | undefined): AuthoredTerrain | undefined {
  if (!locationId) return undefined;
  const entry: any = repository.getActiveEffects(storyId).find((effect: any) => effect?.type === EFFECT_TYPE && effect.locationId === locationId);
  return entry?.terrain ? JSON.parse(JSON.stringify(entry.terrain)) : undefined;
}

/** Builds the battlefield from the authored terrain: bounds, obstacles (with cover), hazards, and the start positions. */
export function applyAuthoredTerrain(engine: TacticalCombatEngine, terrain: AuthoredTerrain, ids: { playerId: string; enemyId?: string }): void {
  if (terrain.bounds) engine.setMapBounds(terrain.bounds);
  for (const obstacle of terrain.obstacles || []) {
    const entry: CombatObstacle = {
      x: obstacle.x,
      y: obstacle.y,
      isImpassable: obstacle.isImpassable ?? !obstacle.cover,
      ...(obstacle.blocksSight !== undefined ? { blocksSight: obstacle.blocksSight } : {}),
      ...(obstacle.cover ? { cover: obstacle.cover } : {}),
    };
    engine.addObstacle(entry);
  }
  for (const hazard of terrain.hazards || []) engine.addHazard({ ...hazard });
  if (terrain.startPositions) {
    engine.placeParticipant(ids.playerId, terrain.startPositions.player.x, terrain.startPositions.player.y);
    if (ids.enemyId) engine.placeParticipant(ids.enemyId, terrain.startPositions.enemy.x, terrain.startPositions.enemy.y);
  }
}
