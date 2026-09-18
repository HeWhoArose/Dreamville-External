const fs = require('fs');
let code = fs.readFileSync('server/api/gameRoutes.ts', 'utf8');

const regex = /\s*\/\/ Auth validation: If transferring FROM something other than the player, we must validate authority\.\s*if \(sourceOwnerId !== actorId\) \{[\s\S]*?\}\s*\}/;

const replacement = `    // Auth validation: Both source and target must be authorized.
    if (!player?.locationId) {
       return res.status(403).json({ success: false, errorReason: 'Player location unknown.' });
    }

    const isAuthorized = (ownerId) => {
      if (ownerId === actorId) return true;
      if (ownerId === player.locationId) return true;

      const npcLife = worldRepository.getNpcLifecycle('default_story', ownerId);
      if (npcLife && npcLife.isDead && npcLife.locationId === player.locationId) return true;

      const combatEngine = worldRepository.getCombatEngine('default_story');
      const parts = combatEngine.getParticipants();
      const deadParticipant = parts.find(p => p.id === ownerId && p.isDead);
      if (deadParticipant) return true;

      return false;
    };

    if (!isAuthorized(sourceOwnerId)) {
      return res.status(403).json({ success: false, errorReason: 'Not authorized or too far to transfer from this source.' });
    }

    if (!isAuthorized(targetOwnerId)) {
      return res.status(403).json({ success: false, errorReason: 'Not authorized or too far to transfer to this target.' });
    }`;

if (regex.test(code)) {
  code = code.replace(regex, '\n' + replacement);
  fs.writeFileSync('server/api/gameRoutes.ts', code);
  console.log("Success");
} else {
  console.log("Not found");
}
