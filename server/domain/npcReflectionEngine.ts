import { deterministicId } from './deterministicRng';
import type { WorldRepository } from '../repositories/worldRepository';
import { scoreNpcMemorySalience, NPC_MEMORY_PERSISTENT_FLOOR } from './npcPlanningSlice';

/**
 * Phase C (GAP-3 / S-3) — NPC reflection synthesis.
 *
 * Generative-Agents agents consolidate an event stream into higher-level beliefs
 * ("they stole the key"), which is the single biggest believability lever in the
 * Smallville ablations. Dreamville had no such mechanism: NPC memory was a flat,
 * importance-ranked list.
 *
 * This module gates synthesis on evidence: an NPC only forms a reflection once it
 * has accumulated at least `NPC_REFLECTION_MIN_EVIDENCE` durable memories that
 * concern the same viewer. The result is stored on the relationship as an explicit
 * *inference* (`confidence < 1`, tag `reflection`) so downstream adjudication and
 * prompts can never mistake it for a witnessed canonical fact.
 *
 * Synthesis is deterministic and offline: no provider call, no added latency or
 * cost on the turn hot path. An AI-authored consolidation is a non-blocking
 * follow-up (see the Phase C section of the narration plan).
 */

export const NPC_REFLECTION_MIN_EVIDENCE = 5;
export const NPC_REFLECTION_MAX_EVIDENCE = 8;
export const NPC_REFLECTION_MIN_CONFIDENCE = 0.5;
export const NPC_REFLECTION_MAX_CONFIDENCE = 0.85;

/** Tokens too generic to carry a relationship theme. */
const REFLECTION_STOPWORDS = new Set([
	'about', 'after', 'again', 'against', 'another', 'because', 'before', 'being', 'between',
	'could', 'every', 'there', 'these', 'those', 'their', 'which', 'while', 'would', 'should',
	'where', 'think', 'thinks', 'thought', 'seems', 'seemed', 'looks', 'looked', 'really',
	'still', 'thing', 'things', 'something', 'nothing', 'around', 'through', 'toward', 'towards',
]);

export interface NpcReflectionSynthesisResult {
	synthesized: number;
	reflectionIds: string[];
	/** NPCs that were considered but did not reach the evidence gate. */
	gated: Array<{ npcId: string; evidenceCount: number }>;
}

function salientTokens(contents: string[], limit = 4): string[] {
	const counts = new Map<string, number>();
	for (const content of contents) {
		const seen = new Set<string>();
		for (const raw of String(content || '').toLowerCase().split(/[^a-z0-9]+/)) {
			if (raw.length < 5 || REFLECTION_STOPWORDS.has(raw) || seen.has(raw)) continue;
			seen.add(raw);
			counts.set(raw, (counts.get(raw) || 0) + 1);
		}
	}
	return [...counts.entries()]
		.filter(([, count]) => count >= 2)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([token]) => token);
}

/**
 * True only when the memory genuinely concerns the viewer. The earlier version also
 * accepted any PUBLIC/SHARED memory, which — now that reflections group NPC
 * involvement through `relatedEntityIds` — could let unrelated public world-event
 * memories (recorded with a location/event subject) seed beliefs about the viewer.
 */
function memoryConcernsViewer(memory: any, viewerActorId: string): boolean {
	if (!memory) return false;
	if (String(memory.subjectEntityId || '') === viewerActorId) return true;
	const related = Array.isArray(memory.relatedEntityIds) ? memory.relatedEntityIds : [];
	return related.some((id: unknown) => String(id) === viewerActorId);
}

function reflectionConfidence(evidenceCount: number): number {
	const scaled = NPC_REFLECTION_MIN_CONFIDENCE + 0.05 * (evidenceCount - NPC_REFLECTION_MIN_EVIDENCE);
	return Math.min(NPC_REFLECTION_MAX_CONFIDENCE, Math.max(NPC_REFLECTION_MIN_CONFIDENCE, Number(scaled.toFixed(2))));
}

/**
 * Consolidate each NPC's viewer-related memories into at most one new reflection
 * per changed evidence set. Never throws: a malformed store degrades to no-op.
 */
export function synthesizeNpcReflections(params: {
	repository: WorldRepository;
	storyId: string;
	viewerActorId: string;
	force?: boolean;
}): NpcReflectionSynthesisResult {
	const result: NpcReflectionSynthesisResult = { synthesized: 0, reflectionIds: [], gated: [] };
	try {
		const { repository, storyId, viewerActorId } = params;
		if (!storyId) return result;
		const memoryEngine = repository.getMemoryEngine(storyId);
		const agency = repository.getDynamicCharacterAgencyEngine(storyId);
		const memories = (memoryEngine.getAllMemories(storyId) || [])
			.filter((memory: any) => memory && memory.status !== 'archived' && memory.status !== 'dormant');
		if (memories.length === 0) return result;

		let currentTurn = 0;
		try {
			currentTurn = Number(repository.getCanonicalCommandEventCount(storyId) || 0);
		} catch {
			currentTurn = 0;
		}
		let nowSeconds = 0;
		try {
			nowSeconds = Number(repository.getWorldClock(storyId).getTimestamp() || 0);
		} catch {
			nowSeconds = 0;
		}

		// Single pass: group viewer-related memories by the NPC they concern. Filtering the
		// whole store once per candidate would be O(memories x npcs) on every accepted turn.
		//
		// Phase ABCD system audit (C-FIND-4): production memories are written with
		// `subjectEntityId = playerActorId` and carry NPC involvement in
		// `relatedEntityIds` (see NarrativeMemoryLifecycle.relatedEntities). Grouping on
		// `subjectEntityId` alone therefore never matched a real turn and the reflection
		// engine was inert live. An NPC now counts as a subject when it is either the
		// memory subject *or* a referenced participant.
		const byNpc = new Map<string, any[]>();
		const isNpcCharacter = (id: string): boolean =>
			Boolean(id) && id !== viewerActorId && Boolean(agency.getCharacter(storyId, id));
		for (const memory of memories) {
			if (!memoryConcernsViewer(memory, viewerActorId)) continue;
			const npcIds = new Set<string>();
			const subjectId = String((memory as any).subjectEntityId || '');
			if (isNpcCharacter(subjectId)) npcIds.add(subjectId);
			const related = Array.isArray((memory as any).relatedEntityIds) ? (memory as any).relatedEntityIds : [];
			for (const relatedId of related) {
				const id = String(relatedId || '');
				if (isNpcCharacter(id)) npcIds.add(id);
			}
			for (const npcId of npcIds) {
				if (!byNpc.has(npcId)) byNpc.set(npcId, []);
				byNpc.get(npcId)!.push(memory);
			}
		}

		const candidateIds = [...byNpc.keys()]
			.filter((subjectId) => isNpcCharacter(subjectId))
			.sort();

		for (const npcId of candidateIds) {
			const evidence = (byNpc.get(npcId) || [])
				.map((memory: any) => ({
					memory,
					salience: scoreNpcMemorySalience({
						importance: Number(memory.importance || 0),
						confidence: Number(memory.confidence || 0),
						lastRecalledTurn: Number(memory.lastRecalledTurn || 0),
						currentTurn,
						isPersistentCritical: memory.isPersistentCritical || Number(memory.importance || 0) >= 90,
					}),
				}))
				.sort((a: any, b: any) =>
					b.salience - a.salience ||
					String(a.memory.id).localeCompare(String(b.memory.id)),
				);

			if (evidence.length < NPC_REFLECTION_MIN_EVIDENCE) {
				result.gated.push({ npcId, evidenceCount: evidence.length });
				continue;
			}

			const top = evidence.slice(0, NPC_REFLECTION_MAX_EVIDENCE);
			const evidenceIds = top.map((entry: any) => String(entry.memory.id));
			const evidenceKey = [...evidenceIds].sort().join('|');
			const existing = agency.getRelationshipReflections(storyId, npcId, viewerActorId);
			if (!params.force && existing.some((entry) => entry.evidenceKey === evidenceKey)) continue;

			const npcName = (() => {
				try {
					return repository.getNpcLifecycle(storyId, npcId)?.name || agency.getCharacter(storyId, npcId)?.name || npcId;
				} catch {
					return npcId;
				}
			})();
			const viewerName = (() => {
				try {
					return repository.getPlayerLifecycle(storyId)?.name || 'the player character';
				} catch {
					return 'the player character';
				}
			})();
			const relationship = agency.getRelationship(storyId, npcId, viewerActorId);
			const tokens = salientTokens(top.map((entry: any) => String(entry.memory.content || '')));
			const confidence = reflectionConfidence(evidence.length);
			const theme = tokens.length > 0
				? `recurring themes: ${tokens.join(', ')}`
				: 'a pattern of repeated dealings';
			const summary =
				`Inference (not witnessed fact): across ${evidence.length} remembered events, ` +
				`${npcName} reads ${viewerName} through ${theme}. ` +
				`Current stance: ${relationship?.stance || 'NEUTRAL'}.`;

			const stored = agency.addRelationshipReflection({
				storyId,
				sourceId: npcId,
				targetId: viewerActorId,
				nowSeconds,
				reflection: {
					id: deterministicId('npc_reflection', storyId, npcId, viewerActorId, evidenceKey),
					confidence,
					summary: summary.slice(0, 400),
					evidenceMemoryIds: evidenceIds,
					evidenceKey,
					tags: ['reflection', 'NPC_REFLECTION', 'inference', 'confidence<1'],
					formedAtTurn: currentTurn,
					formedAtSeconds: nowSeconds,
				},
			});
			if (stored) {
				result.synthesized += 1;
				result.reflectionIds.push(stored.id);
			}
		}
	} catch {
		// Reflection synthesis is an enhancement and must never fail a committed turn.
	}
	return result;
}

export const npcReflectionEngine = { synthesizeNpcReflections };
