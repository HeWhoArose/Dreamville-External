#!/usr/bin/env node
/**
 * Merge several narration replay recordings (tests/fixtures/narration-replay/*.json) into one corpus.
 * Replies are unioned per turn (deduplicated by text); recordedAccepted is true if any run accepted the turn.
 *
 *   node scripts/merge-replay-corpora.mjs out.json run1.json run2.json ...
 */
import fs from 'node:fs';

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length === 0) {
	console.error('usage: merge-replay-corpora.mjs <out.json> <in.json>...');
	process.exit(1);
}
const corpora = inputs.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const merged = {
	version: 1,
	recordedAt: new Date().toISOString(),
	models: Array.from(new Set(corpora.flatMap((corpus) => corpus.models || []))),
	turns: corpora[0].turns.map((turn, index) => {
		const seen = new Set();
		const replies = [];
		for (const corpus of corpora) {
			for (const reply of corpus.turns[index]?.replies || []) {
				const key = `${reply.kind}:${reply.text}`;
				if (seen.has(key)) continue;
				seen.add(key);
				replies.push(reply);
			}
		}
		return {
			action: turn.action,
			moveTo: turn.moveTo,
			replies,
			recordedAccepted: corpora.some((corpus) => corpus.turns[index]?.recordedAccepted),
		};
	}),
};
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
const summary = merged.turns.map((turn, i) => `${i + 1}:${turn.replies.filter((r) => r.kind === 'narrate').length}n`).join(' ');
console.log(`merged ${inputs.length} recordings -> ${out} (narrate replies per turn: ${summary})`);
