import { EntityCardInput, EntityKind } from '../domain/entityCard';
import { worldRepository } from '../repositories/worldRepository';

function parseJson(text: string): any {
	const value = String(text || '').replace(/^\s*\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`\s*$/i, '').trim();
	try { return JSON.parse(value); } catch {
		const match = value.match(/\{[\s\S]*\}/);
		return match ? JSON.parse(match[0]) : null;
	}
}

function inferKind(concept: string, requested?: EntityKind): EntityKind {
	if (requested) return requested;
	const text = concept.toLowerCase();
	if (/(merchant|trader|shopkeeper|vendor)/.test(text)) return 'MERCHANT';
	if (/(cockroach|beetle|rat|wolf|animal|creature|beast|monster)/.test(text)) return 'CREATURE';
	if (/(dragon|boss|demon lord|archfiend)/.test(text)) return 'BOSS';
	return 'NPC';
}

function fallback(request: { storyId: string; concept: string; name?: string; kind?: EntityKind; worldId?: string }): EntityCardInput {
	const kind = inferKind(request.concept, request.kind);
	const creature = ['CREATURE','ANIMAL','MONSTER'].includes(kind);
	const merchant = kind === 'MERCHANT';
	return {
		storyId: request.storyId,
		worldId: request.worldId,
		name: request.name || (merchant ? 'Unnamed Merchant' : creature ? 'Unnamed Creature' : 'Unnamed NPC'),
		kind,
		classification: { role: merchant ? 'Merchant' : creature ? 'Creature' : 'NPC', profession: merchant ? 'Merchant' : undefined, threat: creature ? 'Unrated' : 'Unknown', tags: [kind.toLowerCase()] },
		coreStats: { level: 1, hpCurrent: creature ? 1 : 10, hpMax: creature ? 1 : 10, armorClass: 10, speed: creature ? 5 : 30, abilityScores: creature ? { strength: 1, dexterity: 4, constitution: 1, intelligence: 0, wisdom: 1, charisma: 0 } : { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 } },
		personality: { traits: creature ? [] : ['Undetermined'], values: [], motivations: creature ? ['Survival'] : [], fears: [], desires: [] },
		behavior: { defaultBehavior: creature ? 'Survival-driven' : 'Context-dependent', threatResponse: creature ? 'Flee unless cornered.' : 'Undetermined', priorities: creature ? ['Survive','Seek food'] : [], routines: [] },
		social: { factionIds: [], reputation: {}, relationships: {} },
		economy: creature ? undefined : { wealth: 0, currency: {}, inventoryItemIds: [], inventorySummary: [], assets: [] },
		background: creature ? { importantEvents: [] } : { history: request.concept, importantEvents: [] },
		worldState: { isAlive: true, presence: 'unknown' },
		traits: [], capabilities: [], feats: [], equipment: [], memoryRefs: [],
		provenance: { source: 'ENTITY_GENERATION_FALLBACK', createdBy: 'SYSTEM', prompt: request.concept, confidence: 0.35 },
	};
}

export class EntityCardService {
	public async generate(request: { storyId: string; concept: string; name?: string; kind?: EntityKind; worldId?: string; allowDeterministicFallback?: boolean }) {
		const world = worldRepository.getWorldTemplate(request.worldId || worldRepository.getStoryRun(request.storyId)?.worldId);
		const kind = inferKind(request.concept, request.kind);
		const prompt = [
			'Create a canonical RPG Entity Card from this concept.',
			'Keep ordinary creatures lightweight. Named NPCs and merchants may have rich background, personality, wealth, inventory, behavior, alignment and goals.',
			'Do not force a D&D class onto an animal or creature unless the concept requires it.',
			'Return JSON only.',
			'Fields: name, kind, identity, classification, progression, coreStats, personality, behavior, social, economy, background, worldState, traits, capabilities, feats, equipment, metadata.',
			'WORLD: ' + JSON.stringify({ title: world?.title, genre: world?.genreTags, setting: world?.setting }),
			'CONCEPT: ' + request.concept,
		].join('\n');
		if (!request.allowDeterministicFallback) {
			const response = await worldRepository.getAiOrchestrator().executeTaskGeneration('narrative.generate', prompt, 'Return only Entity Card JSON.');
			const parsed = response.text ? parseJson(response.text) : null;
			if (!parsed?.name) throw new Error('AI entity generation returned no usable Entity Card.');
			return { card: { ...parsed, storyId: request.storyId, worldId: request.worldId || world?.worldId, kind: inferKind(String(parsed.kind || ''), kind), name: request.name || parsed.name, isTemplate: false } as EntityCardInput, generationSource: response.source === 'DETERMINISTIC_FALLBACK' ? 'DETERMINISTIC_FALLBACK' : 'AI_PRIMARY' };
		}
		return { card: fallback(request), generationSource: 'DETERMINISTIC_FALLBACK' as const };
	}
}
export const entityCardService = new EntityCardService();
