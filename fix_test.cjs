const fs = require('fs');
let code = fs.readFileSync('tests/ch5_surgical.test.ts', 'utf8');

code = code.replace(/deathRecord: \{ isDead: true, timestamp: (.*?), cause: 'test', permanentlyDead: true \}/g, 
"deathRecord: { isDead: true, diedAtTimestamp: $1, cause: 'test', revivalPossible: false }");

fs.writeFileSync('tests/ch5_surgical.test.ts', code);
console.log("Success");
