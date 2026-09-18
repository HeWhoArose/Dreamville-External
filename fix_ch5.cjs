const fs = require('fs');
let content = fs.readFileSync('tests/ch5_surgical.test.ts', 'utf8');

const marker = "import { describe, it }";
const idx = content.indexOf(marker);

if (idx > -1) {
    content = content.substring(idx);
    fs.writeFileSync('tests/ch5_surgical.test.ts', content);
    console.log("Cleaned up file!");
} else {
    console.log("Marker not found.");
}
