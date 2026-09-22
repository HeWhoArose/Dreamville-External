const fs = require('fs');
const content = fs.readFileSync('test_output.txt', 'utf8');
const lines = content.split('\n');

const failures = [];
let current = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const notOkMatch = line.match(/^(\s*)not ok \d+ - (.+)$/);
  if (notOkMatch) {
    if (current) {
      failures.push(current);
    }
    current = {
      title: notOkMatch[2].trim(),
      lines: [line],
      file: null,
      error: null,
      type: null,
      stack: []
    };
  } else if (current) {
    current.lines.push(line);
    const locMatch = line.match(/location:\s*['"]?([^'":\s]+):(\d+)/);
    if (locMatch && !current.file) {
      current.file = `${locMatch[1]}:${locMatch[2]}`;
    }
    const errMatch = line.match(/error:\s*['"]?([^'"]+)['"]?/);
    if (errMatch && !current.error) {
      current.error = errMatch[1].trim();
    }
    const typeMatch = line.match(/type:\s*['"]?([^'"\s]+)['"]?/);
    if (typeMatch && !current.type) {
      current.type = typeMatch[1];
    }
    if (line.includes('stack:') || current.inStack) {
      current.inStack = true;
      current.stack.push(line);
      if (line.trim() === '...' || line.includes('failureType')) {
        current.inStack = false;
      }
    }
  }
}
if (current) {
  failures.push(current);
}

const leafFailures = failures.filter(f => f.type === 'test');

let out = `Total test failures: ${leafFailures.length}\n\n`;

leafFailures.forEach((f, idx) => {
  out += `======================================================\n`;
  out += `FAILURE #${idx + 1}: ${f.title}\n`;
  out += `File: ${f.file}\n`;
  out += `Error: ${f.error}\n`;
  out += `Lines:\n${f.lines.slice(0, 20).join('\n')}\n\n`;
});

fs.writeFileSync('all_failures.txt', out);
console.log(`Wrote ${leafFailures.length} test failures to all_failures.txt`);
