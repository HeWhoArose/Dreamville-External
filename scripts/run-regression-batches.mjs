import { readFileSync, writeFileSync } from 'fs';

const files = readFileSync('artifacts/regression-filelist.txt', 'utf8').trim().split('\n');
const ISOLATED = new Set(['tests/marathon-125-turn.integration.test.ts', 'tests/liveRuntimeProof.test.ts']);

const marathon = files.filter((f) => f === 'tests/marathon-125-turn.integration.test.ts');
const live = files.filter((f) => f === 'tests/liveRuntimeProof.test.ts');
const rest = [...files.filter((f) => !ISOLATED.has(f))].sort();

// 7 batches of ~27 files: a 63-file batch exceeded the 180s window.
const NUM_BATCHES = 7;
const perBatch = Math.ceil(rest.length / NUM_BATCHES);
const batches = [];
for (let i = 0; i < NUM_BATCHES; i++) {
  batches.push(rest.slice(perBatch * i, perBatch * (i + 1)).filter(Boolean));
}
batches.push([...live, ...marathon]); // batch 8: isolated slow/integration files

for (let i = 0; i < batches.length; i++) {
  const list = batches[i].filter(Boolean);
  if (list.length === 0) continue;
  writeFileSync(`artifacts/regression-batch${i + 1}.txt`, list.join('\n') + '\n');
  console.log(`batch${i + 1}: ${list.length} files`);
}
console.log(`total: ${files.length} files across ${batches.filter((b) => b.length > 0).length} batches`);
