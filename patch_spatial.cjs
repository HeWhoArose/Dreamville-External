const fs = require('fs');
let content = fs.readFileSync('server/domain/sensoryEngine.ts', 'utf8');

content = content.replace(
  `  public resolveAudioCuesToEvents(cues: string[]): SemanticSensoryEvent[] {`,
  `  public resolveAudioCuesToEvents(
    cues: string[],
    context?: {
      listenerPosition?: { x: number; y: number; z?: number };
      entities?: { name: string; x: number; y: number; z?: number }[];
    }
  ): SemanticSensoryEvent[] {`
);

content = content.replace(
  `        audioDirection: {
          cueId: cue,
          soundId: cue,
          radius: 10,
          volume: 1.0,
        },`,
  `        audioDirection: (function() {
          let radius = 10;
          let volume = 1.0;
          let distance = 0;
          if (context?.listenerPosition && context?.entities) {
            const source = context.entities.find(e => lowerCue.includes(e.name.toLowerCase()));
            if (source) {
              const dx = source.x - context.listenerPosition.x;
              const dy = source.y - context.listenerPosition.y;
              distance = Math.sqrt(dx * dx + dy * dy);
              if (distance === 0) {
                volume = 1.0;
              } else {
                volume = Math.max(0.1, 1.0 / Math.max(1, (distance / 5)));
              }
              radius = Math.max(5, distance + 10);
            }
          }
          return {
            cueId: cue,
            soundId: cue,
            radius,
            volume,
          };
        })(),`
);

fs.writeFileSync('server/domain/sensoryEngine.ts', content);

let gameRoutes = fs.readFileSync('server/api/gameRoutes.ts', 'utf8');

gameRoutes = gameRoutes.replace(
  `    if (turnResult.turnPackage?.audioCues) {
      sensoryEvents = sensoryEngine.resolveAudioCuesToEvents(turnResult.turnPackage.audioCues);
    }`,
  `    if (turnResult.turnPackage?.audioCues) {
      const combatEngine = worldRepository.getCombatEngine(storyId as string);
      const player = worldRepository.getPlayerLifecycle(storyId as string);
      
      const entities = [];
      let listenerPosition = { x: 0, y: 0 };
      
      if (combatEngine.getParticipants().length > 0) {
        const parts = combatEngine.getParticipants();
        for (const p of parts) {
          entities.push({ name: p.name, x: p.x, y: p.y });
          if (player && p.id === player.playerId) {
            listenerPosition = { x: p.x, y: p.y };
          }
        }
      } else if (player && player.locationId) {
         const geo = worldRepository.getGeographyGraph();
         const loc = geo.getNode(player.locationId);
         if (loc) {
           listenerPosition = { x: loc.coordinates.x, y: loc.coordinates.y };
         }
      }

      sensoryEvents = sensoryEngine.resolveAudioCuesToEvents(
        turnResult.turnPackage.audioCues,
        { listenerPosition, entities }
      );
    }`
);

fs.writeFileSync('server/api/gameRoutes.ts', gameRoutes);
