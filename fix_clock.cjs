const fs = require('fs');
let code = fs.readFileSync('server/api/gameRoutes.ts', 'utf8');

const regex = /    \/\/ Preserve corpses before clearing \(CH5-004\)[\s\S]*?\}\s*\}/;
const replacement = `    // Preserve corpses before clearing (CH5-004)
    const clock = worldRepository.getWorldClock(storyId);
    const deadParticipants = combatEngine.getParticipants().filter(p => p.isDead && p.id !== actorId);
    for (const dp of deadParticipants) {
      if (!worldRepository.getNpcLifecycle(storyId, dp.id)) {
        worldRepository.updateNpcLifecycle(storyId, new PlayerLifecycleState({
          actorId: dp.id,
          name: dp.name,
          locationId: player?.locationId || 'loc_unknown',
          lastUpdatedTime: clock.getTimestamp().totalElapsedSeconds,
          currentActivity: 'dead',
          activeJourney: null,
          deathRecord: {
            isDead: true,
            diedAtTimestamp: clock.getTimestamp(),
            cause: 'Killed in tactical combat.',
            revivalPossible: false
          }
        }));
      }
    }`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('server/api/gameRoutes.ts', code);
  console.log("Success");
} else {
  console.log("Not found");
}
