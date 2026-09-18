import { worldRepository } from './server/repositories/worldRepository';
import { SensoryEngine } from './server/domain/sensoryEngine';

const storyId = 'default_story';
const player = worldRepository.getPlayerLifecycle(storyId);
const combatEngine = worldRepository.getCombatEngine(storyId);
const geo = worldRepository.getGeographyGraph();
const livingWorld = worldRepository.getLivingWorldSimulation(storyId);

console.log("Player locationId:", player?.locationId, "Player name:", player?.name);
console.log("Combat participants:", combatEngine.getParticipants().length);

const entities: any[] = [];
let listenerPosition = { x: 0, y: 0 };

if (combatEngine.getParticipants().length > 0) {
  const parts = combatEngine.getParticipants();
  for (const p of parts) {
    entities.push({ name: p.name, x: p.x, y: p.y });
    if (player && p.id === player.actorId) {
      listenerPosition = { x: p.x, y: p.y };
    }
  }
} else if (player && player.locationId) {
  const loc = geo.getNode(player.locationId);
  if (loc) {
    listenerPosition = { x: loc.coordinates.x, y: loc.coordinates.y };
    entities.push({ name: loc.name, x: loc.coordinates.x, y: loc.coordinates.y });
    entities.push({ name: player.name || 'player', x: loc.coordinates.x, y: loc.coordinates.y });
    const edges = geo.getOutgoingEdges(player.locationId);
    const adjacent = edges.map(e => geo.getNode(e.toLocationId)).filter(Boolean) as any[];
    for (const adjLoc of adjacent) {
      entities.push({ name: adjLoc.name, x: adjLoc.coordinates.x, y: adjLoc.coordinates.y });
    }
    if (livingWorld) {
      const allNpcs = livingWorld.getAllNpcSchedules();
      for (const npc of allNpcs) {
        if (npc.currentLocationId) {
          const npcLoc = geo.getNode(npc.currentLocationId);
          if (npcLoc && (npc.currentLocationId === player.locationId || adjacent.find((a: any) => a.id === npc.currentLocationId))) {
            entities.push({ name: npc.npcId, x: npcLoc.coordinates.x, y: npcLoc.coordinates.y });
          }
        }
      }
    }
  }
}

console.log("Entities:", entities);
