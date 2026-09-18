const fs = require('fs');
let code = fs.readFileSync('server/api/gameRoutes.ts', 'utf8');

code = code.replace(/worldRepository\.getWorldClock\(storyId\)/g, "worldRepository.getWorldClock('default_story')");
code = code.replace(/worldRepository\.getNpcLifecycle\(storyId,/g, "worldRepository.getNpcLifecycle('default_story',");
code = code.replace(/worldRepository\.updateNpcLifecycle\(storyId,/g, "worldRepository.updateNpcLifecycle('default_story',");

fs.writeFileSync('server/api/gameRoutes.ts', code);
console.log("Success");
