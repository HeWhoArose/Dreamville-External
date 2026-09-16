const fs = require('fs');
let content = fs.readFileSync('server/api/sensoryRoutes.ts', 'utf8');
content = content.replace(
  `const timePhase = clock.getDayPhase();`,
  `const timePhase = clock.getState().currentDayPhase;`
);
content = content.replace(
  `const combatActive = combat.getCombatState().isActive;`,
  `const combatActive = combat.getParticipants().length > 0;`
);
fs.writeFileSync('server/api/sensoryRoutes.ts', content);
