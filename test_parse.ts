import { InMemoryWorldRepository } from './server/repositories/worldRepository';
const repo = new InMemoryWorldRepository();
const invEngine = repo.getInventoryEngine('default_story');
const state = invEngine.exportState();
console.log(Array.isArray(state) ? "It's an array!" : Object.keys(state));
