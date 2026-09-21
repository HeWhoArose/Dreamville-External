import { readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const files = readdirSync('tests').filter(f => f.endsWith('.test.ts'));
console.log(`Found ${files.length} test files.`);

let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
  const path = join('tests', file);
  try {
    execSync(`npx tsx --test ${path}`, { stdio: 'ignore' });
    console.log(`✅ ${file} passed`);
    passed++;
  } catch (err) {
    console.log(`❌ ${file} failed`);
    failed++;
    failures.push(file);
  }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
if (failures.length > 0) {
  console.log(`Failed files:`, failures.join(', '));
}
