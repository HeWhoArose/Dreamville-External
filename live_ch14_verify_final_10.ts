import { worldRepository } from './server/repositories/worldRepository';
import { SensoryEngine } from './server/domain/sensoryEngine';

const player = worldRepository.getPlayerLifecycle('default_story');
console.log("Player:", player?.actorId, player?.currentLocationId);

const combatEngine = worldRepository.getCombatEngine('default_story');
const geo = worldRepository.getGeographyGraph();
const livingWorld = worldRepository.getLivingWorldSimulation('default_story');

const entities = [];
let listenerPosition = { x: 0, y: 0 };

if (combatEngine.getParticipants().length > 0) {
  console.log("In combat:", combatEngine.getParticipants().map(p => p.name));
  const parts = combatEngine.getParticipants();
  for (const p of parts) {
    entities.push({ name: p.name, x: p.x, y: p.y });
    if (player && p.id === player.actorId) {
      listenerPosition = { x: p.x, y: p.y };
    }
  }
} else if (player && player.currentLocationId) {
  console.log("Not in combat, checking location:", player.currentLocationId);
  const loc = geo.getNode(player.currentLocationId);
  if (loc) {
    listenerPosition = { x: loc.coordinates.x, y: loc.coordinates.y };
    entities.push({ name: loc.name, x: loc.coordinates.x, y: loc.coordinates.y });
    entities.push({ name: 'player', x: loc.coordinates.x, y: loc.coordinates.y });
    const edges = geo.getOutgoingEdges(player.currentLocationId);
    const adjacent = edges.map(e => geo.getNode(e.toLocationId)).filter(Boolean) as any[];
    for (const adjLoc of adjacent) {
      entities.push({ name: adjLoc.name, x: adjLoc.coordinates.x, y: adjLoc.coordinates.y });
    }
    if (livingWorld) {
      const allNpcs = livingWorld.getAllNpcSchedules();
      for (const npc of allNpcs) {
        if (npc.currentLocationId) {
          const npcLoc = geo.getNode(npc.currentLocationId);
          if (npcLoc && (npc.currentLocationId === player.currentLocationId || adjacent.find((a: any) => a.id === npc.currentLocationId))) {
            entities.push({ name: npc.npcId, x: npcLoc.coordinates.x, y: npcLoc.coordinates.y });
          }
        }
      }
    }
  } else {
      console.log("Loc is null");
  }
} else {
    console.log("Player or player location is null");
}

console.log("Entities:", entities);
