import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sourceRoot = path.join(root, 'node_modules', '@3d-dice', 'dice-box-threejs', 'public');
const targetRoot = path.join(root, 'public', 'assets', 'dice-box');

function copyDir(source, target) {
	if (!fs.existsSync(source)) {
		throw new Error(`Dice asset source directory not found: ${source}`);
	}
	fs.mkdirSync(target, { recursive: true });
	for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
		const from = path.join(source, entry.name);
		const to = path.join(target, entry.name);
		if (entry.isDirectory()) {
			copyDir(from, to);
		} else {
			fs.copyFileSync(from, to);
		}
	}
}

copyDir(sourceRoot, targetRoot);
console.log(`[dice-assets] Copied 3D dice assets to ${targetRoot}`);
