const fs = require('fs');
let lines = fs.readFileSync('server/api/gameRoutes.ts', 'utf8').split('\n');
lines.splice(727, 0, '    }');
fs.writeFileSync('server/api/gameRoutes.ts', lines.join('\n'));
console.log("Success");
