import type { WorldRepository } from '../repositories/worldRepository';
import { deterministicId, formatCanonicalTimestamp } from './deterministicRng';

/**
 * Scene-summary chunk produced every N accepted turns.
 *
 * These chunks are the durable "plot prose" memory that AI Dungeon/NovelAI-class
 * systems keep in addition to the raw recent-history window. They compress the
 * recent narration into an entity-anchored paragraph so a long session does not
 * lose the plot once older raw turns fall out of `narrativeContextHistory`
 * (which is hard-truncated to 40 entries).
 */
export interface SceneSummaryChunk {
	id: string;
	storyId: string;
	fromTurn: number;
	toTurn: number;
	text: string;
	source: 'AI' | 'DETERMINISTIC';
	providerId?: string;
	modelId?: string;
	anchors: string[];
	createdAt: string;
}

export interface SummaryLifecycleState {
	/** Accepted turns observed since the last generated summary chunk. */
	turnsSinceLastSummary: number;
	lastSummarizedTurn: number;
	chunkCount: number;
	updatedAt: string;
}

export interface SummaryLifecycleResult {
	generated: boolean;
	due: boolean;
	chunk?: SceneSummaryChunk;
	reason?: string;
}

/** Provider-neutral surface required from the AI orchestrator. */
export interface SummaryOrchestrator {
	executeTaskGeneration(
		task: 'summary.scene',
		prompt: string,
		systemInstruction?: string,
		options?: {
			timeoutMs?: number;
			maxTokens?: number;
			allowDeterministicFallback?: boolean;
			validateResponse?: (text: string) => { valid: boolean; reason?: string };
		}
	): Promise<{
		text: string;
		source?: string;
		providerId?: string;
		modelId?: string;
	}>;
}

/** Emit a durable summary every six accepted turns (matches the AI Dungeon cadence band). */
export const SCENE_SUMMARY_CADENCE_TURNS = 6;
const MAX_CHUNKS = 20;
const MIN_SUMMARY_CHARS = 40;
const MAX_SUMMARY_CHARS = 1400;
/** The deterministic `summary.scene` emergency floor is a canned placeholder; never persist it. */
const EMERGENCY_SUMMARY_MARKER = /ancient armatures maintain their silent vigil/i;

function normalize(value: unknown): string {
	return String(value ?? '').trim();
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Extract proper-noun anchors (character/place names) from free text. These are
 * used both to bias the summary prompt and to verify the model kept entity names.
 */
export function extractAnchors(text: string, extra: string[] = [], limit = 12): string[] {
	const anchors: string[] = [];
	const seen = new Set<string>();
	const push = (value: string) => {
		const key = value.toLowerCase();
		if (value.length < 3 || seen.has(key)) return;
		seen.add(key);
		anchors.push(value);
	};
	for (const value of extra) if (value) push(normalize(value));
	const regex = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const before = text.slice(0, match.index).trimEnd();
		const atSentenceStart = before.length === 0 || /[.!?]$/.test(before);
		const wordCount = match[0].split(/\s+/).length;
		// Drop a single capitalized word that only appears at a sentence start (likely not a name),
		// but keep multi-word proper nouns such as "Beren Ashdown" or "Iron Citadel".
		if (atSentenceStart && wordCount === 1) continue;
		push(match[0]);
	}
	return anchors.slice(0, limit);
}

/**
 * Parse a model response that may be a raw paragraph, a fenced block, or a
 * JSON turn package ({ summary | text | narrative }).
 */
export function parseSummaryResponse(raw: string): string {
	const text = normalize(raw);
	if (!text) return '';
	const withoutFence = text.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
	const jsonStart = withoutFence.indexOf('{');
	if (jsonStart !== -1) {
		const candidate = withoutFence.slice(jsonStart);
		try {
			const parsed = JSON.parse(candidate);
			if (parsed && typeof parsed === 'object') {
				if (typeof parsed.summary === 'string' && parsed.summary.trim()) return parsed.summary.trim();
				if (typeof parsed.text === 'string' && parsed.text.trim()) return parsed.text.trim();
				if (Array.isArray(parsed.narrative) && parsed.narrative.length > 0) {
					const joined = parsed.narrative.map((entry: unknown) => normalize(entry)).filter(Boolean).join(' ');
					if (joined) return joined;
				}
			}
		} catch {
			// Not valid JSON — fall through to treating the text as prose.
		}
	}
	return withoutFence;
}

function isUsableSummary(text: string, anchors: string[]): boolean {
	const value = normalize(text);
	if (value.length < MIN_SUMMARY_CHARS || value.length > MAX_SUMMARY_CHARS) return false;
	if (EMERGENCY_SUMMARY_MARKER.test(value)) return false;
	if (/^\s*\{/.test(value)) return false; // unresolved JSON envelope — never present as prose
	if (anchors.length > 0) {
		const lower = value.toLowerCase();
		if (!anchors.some((anchor) => lower.includes(anchor.toLowerCase()))) return false;
	}
	return true;
}

interface RecentTurnSource {
	turnNumber?: number;
	playerAction?: string;
	narration?: string;
	worldTime?: string;
	locationId?: string;
}

export class NarrativeSummaryLifecycle {
	/**
	 * Safe post-commit hook for the action pipeline. Never throws so a summarization
	 * failure can never fail or roll back a committed player turn.
	 */
	public static async onAcceptedTurn(params: {
		repository: WorldRepository;
		storyId: string;
		orchestrator?: SummaryOrchestrator;
		force?: boolean;
	}): Promise<SummaryLifecycleResult> {
		try {
			return await NarrativeSummaryLifecycle.maybeGenerateSummary(params);
		} catch {
			return { generated: false, due: false, reason: 'SUMMARY_PIPELINE_ERROR' };
		}
	}
	public static getState(repository: WorldRepository, storyId: string): SummaryLifecycleState {
		const run = repository.getStoryRun(storyId);
		const runtime = (run?.runtimeState || {}) as Record<string, any>;
		const raw = (runtime.summaryLifecycle || {}) as Partial<SummaryLifecycleState>;
		return {
			turnsSinceLastSummary: Number.isFinite(raw.turnsSinceLastSummary) ? Number(raw.turnsSinceLastSummary) : 0,
			lastSummarizedTurn: Number.isFinite(raw.lastSummarizedTurn) ? Number(raw.lastSummarizedTurn) : 0,
			chunkCount: Number.isFinite(raw.chunkCount) ? Number(raw.chunkCount) : 0,
			updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
		};
	}

	public static recentChunks(repository: WorldRepository, storyId: string, limit = 2): SceneSummaryChunk[] {
		const run = repository.getStoryRun(storyId);
		const runtime = (run?.runtimeState || {}) as Record<string, any>;
		const chunks = (runtime.plot?.chunkSummaries || runtime.chunkSummaries || []) as SceneSummaryChunk[];
		if (!Array.isArray(chunks)) return [];
		return chunks
			.filter((chunk): chunk is SceneSummaryChunk => Boolean(chunk && typeof chunk.text === 'string' && chunk.text.trim()))
			.slice(-Math.max(1, limit));
	}

	/**
	 * Register one accepted turn and, when the cadence is reached, generate and
	 * persist a scene-summary chunk. This never throws: AI/provider failures fall
	 * back to a deterministic concatenation of the recent beats.
	 */
	/**
	 * Phase ABCD system audit (A-FIND-2): merge only the keys this pipeline owns into
	 * the *current* runtime state. `maybeGenerateSummary` awaits a provider call, so a
	 * concurrently committed turn can land mid-await; assigning a stale snapshot would
	 * clobber that turn's canonical state. Re-reading here guarantees we never do.
	 */
	private static persistSummaryState(
		repository: WorldRepository,
		storyId: string,
		updates: { summaryLifecycle: SummaryLifecycleState; plot?: { chunkSummaries: SceneSummaryChunk[] } },
	): void {
		const fresh = repository.getStoryRun(storyId);
		if (!fresh) return;
		const current = { ...(fresh.runtimeState || {}) } as Record<string, any>;
		current.summaryLifecycle = updates.summaryLifecycle;
		if (updates.plot) {
			current.plot = { ...(current.plot || {}), chunkSummaries: updates.plot.chunkSummaries };
		}
		fresh.runtimeState = current;
		repository.saveStoryRun(fresh);
	}

	public static async maybeGenerateSummary(params: {
		repository: WorldRepository;
		storyId: string;
		orchestrator?: SummaryOrchestrator;
		force?: boolean;
	}): Promise<SummaryLifecycleResult> {
		const { repository, storyId } = params;
		const run = repository.getStoryRun(storyId);
		if (!run) return { generated: false, due: false, reason: 'STORY_RUN_NOT_FOUND' };

		const runtime = { ...(run.runtimeState || {}) } as Record<string, any>;
		const state = NarrativeSummaryLifecycle.getState(repository, storyId);
		const turnsSinceLastSummary = state.turnsSinceLastSummary + 1;
		const due = Boolean(params.force) || turnsSinceLastSummary >= SCENE_SUMMARY_CADENCE_TURNS;
		const currentTurn = Math.max(repository.getCanonicalCommandEventCount(storyId) || 0, state.lastSummarizedTurn);

		if (!due) {
			NarrativeSummaryLifecycle.persistSummaryState(repository, storyId, {
				summaryLifecycle: { ...state, turnsSinceLastSummary },
			});
			return { generated: false, due: false, reason: 'CADENCE_NOT_REACHED' };
		}

		const sources = NarrativeSummaryLifecycle.collectRecentTurns(repository, storyId, state.lastSummarizedTurn);
		const anchorCandidates = NarrativeSummaryLifecycle.collectAnchorCandidates(repository, storyId, sources);
		const sourceText = sources
			.map((turn, index) => {
				const parts = [
					turn.playerAction ? `Player: ${turn.playerAction}` : '',
					turn.narration ? `Narration: ${turn.narration}` : '',
				].filter(Boolean);
				return parts.length ? `${index + 1}. ${parts.join(' | ')}` : '';
			})
			.filter(Boolean)
			.join('\n');

		const anchors = extractAnchors(sourceText, anchorCandidates, 12);
		let text = '';
		let source: SceneSummaryChunk['source'] = 'DETERMINISTIC';
		let providerId: string | undefined;
		let modelId: string | undefined;

		if (params.orchestrator && sourceText) {
			try {
				const prompt = NarrativeSummaryLifecycle.buildSummaryPrompt(sourceText, anchors);
				const generated = await params.orchestrator.executeTaskGeneration(
					'summary.scene',
					prompt,
					'You are a continuity archivist. Compress prior story turns into one factual, entity-anchored paragraph. Add nothing that is not in the input.',
					{
						timeoutMs: 8000,
						maxTokens: 400,
						allowDeterministicFallback: false,
						validateResponse: (candidate: string) => {
							const parsed = parseSummaryResponse(candidate);
							return isUsableSummary(parsed, anchors)
								? { valid: true }
								: { valid: false, reason: 'Scene summary rejected by entity-anchored validation.' };
						},
					},
				);
				const parsed = parseSummaryResponse(generated?.text || '');
				if (isUsableSummary(parsed, anchors)) {
					text = parsed;
					source = 'AI';
					providerId = generated?.providerId;
					modelId = generated?.modelId;
				}
			} catch {
				// Deterministic fallback below.
			}
		}

		if (!text) {
			text = NarrativeSummaryLifecycle.buildDeterministicSummary(sources, runtime);
			source = 'DETERMINISTIC';
		}

		if (!isUsableSummary(text, anchors)) {
			// Nothing durable to record yet; advance the counter so a later, richer
			// window gets a chance instead of retrying the same empty scan forever.
			NarrativeSummaryLifecycle.persistSummaryState(repository, storyId, {
				summaryLifecycle: {
					...state,
					turnsSinceLastSummary: 0,
					updatedAt: formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp()),
				},
			});
			return { generated: false, due: true, reason: 'NO_SUMMARIZABLE_CONTENT' };
		}

		const timestamp = formatCanonicalTimestamp(repository.getWorldClock(storyId).getTimestamp());
		const fromTurn = sources.length > 0 && Number.isFinite(sources[0].turnNumber)
			? Number(sources[0].turnNumber)
			: state.lastSummarizedTurn;
		const chunk: SceneSummaryChunk = {
			id: deterministicId('scene_summary', storyId, String(currentTurn), text),
			storyId,
			fromTurn,
			toTurn: currentTurn,
			text,
			source,
			providerId,
			modelId,
			anchors,
			createdAt: timestamp,
		};

		// Append to the *current* chunk list (a concurrent turn may have written one
		// during the awaited provider call), then merge only our keys into runtime state.
		const freshRun = repository.getStoryRun(storyId);
		const freshPlot = (((freshRun?.runtimeState || {}) as Record<string, any>).plot || {}) as Record<string, any>;
		const existing = Array.isArray(freshPlot.chunkSummaries) ? freshPlot.chunkSummaries : [];
		const chunkSummaries = [...existing, clone(chunk)].slice(-MAX_CHUNKS);

		NarrativeSummaryLifecycle.persistChunkMemory(repository, storyId, chunk, anchors);
		NarrativeSummaryLifecycle.persistSummaryState(repository, storyId, {
			summaryLifecycle: {
				turnsSinceLastSummary: 0,
				lastSummarizedTurn: currentTurn,
				chunkCount: state.chunkCount + 1,
				updatedAt: timestamp,
			},
			plot: { chunkSummaries },
		});

		return { generated: true, due: true, chunk };
	}

	/**
	 * Most recent accepted turns, deduplicated.
	 *
	 * A single accepted turn is persisted twice into `narrativeContextHistory`: once by
	 * NarrativeMemoryLifecycle (a string `narration`) and once by the action authority
	 * (a nested `narration.response`). Without dedup the summary window would repeat prose
	 * and shrink to half the intended turn span.
	 */
	private static collectRecentTurns(repository: WorldRepository, storyId: string, lastSummarizedTurn: number): RecentTurnSource[] {
		const run = repository.getStoryRun(storyId);
		const runtime = (run?.runtimeState || {}) as Record<string, any>;
		const history = Array.isArray(runtime.narrativeContextHistory) ? runtime.narrativeContextHistory : [];
		const rawTurns = history
			.map((entry: any) => ({
				turnNumber: Number.isFinite(entry?.turnNumber) ? Number(entry.turnNumber) : undefined,
				playerAction: normalize(entry?.playerAction || entry?.actionText || entry?.description || ''),
				narration: typeof entry?.narration === 'string'
					? normalize(entry.narration)
					: normalize(entry?.narration?.response || entry?.narrativeResponse || ''),
				worldTime: normalize(entry?.worldTime || entry?.capturedAt || ''),
				locationId: normalize(entry?.locationId || ''),
			}))
			.filter((turn: RecentTurnSource) => Boolean(turn.playerAction || turn.narration));
		const seen = new Set<string>();
		const deduped: RecentTurnSource[] = [];
		for (const turn of rawTurns) {
			const key = `${(turn.playerAction || '').toLowerCase()}::${(turn.narration || '').toLowerCase().slice(0, 160)}`;
			// An entry with no action text and no narration identical to a prior turn is a duplicate shape;
			// but always keep the first-seen (lifecycle) entry for a real turn.
			if (key !== '::' && seen.has(key)) continue;
			if (key !== '::') seen.add(key);
			deduped.push(turn);
		}
		const window = deduped.slice(-SCENE_SUMMARY_CADENCE_TURNS);
		if (window.some((turn: RecentTurnSource) => turn.narration)) {
			return window;
		}
		// Fall back to durable plot beats when raw narration history is unavailable.
		const beats = Array.isArray(runtime.plot?.beats) ? runtime.plot.beats : [];
		return beats
			.slice(-SCENE_SUMMARY_CADENCE_TURNS)
			.map((beat: any) => ({ turnNumber: undefined, narration: normalize(beat?.text) }))
			.filter((turn: RecentTurnSource) => Boolean(turn.narration));
	}


	/** Entity/location names that should survive summarization. */
	private static collectAnchorCandidates(repository: WorldRepository, storyId: string, sources: RecentTurnSource[]): string[] {
		const anchors: string[] = [];
		try {
			const situation = (repository as any).getCurrentSituation?.(storyId);
			if (situation) {
				if (situation.location?.name) anchors.push(String(situation.location.name));
				for (const entity of situation.nearbyEntities || []) {
					if (entity?.name) anchors.push(String(entity.name));
				}
			}
		} catch {
			// Situation lookup is best-effort; anchors fall back to proper-noun extraction.
		}
		const run = repository.getStoryRun(storyId);
		const plot = (run?.runtimeState as any)?.plot;
		if (plot?.summary) anchors.push(...extractAnchors(String(plot.summary), [], 6));
		for (const turn of sources) {
			const location = turn.locationId ? repository.getGeographyGraph(storyId).getNode(turn.locationId) : undefined;
			if (location?.name) anchors.push(String(location.name));
		}
		return Array.from(new Set(anchors.filter(Boolean)));
	}

	private static buildSummaryPrompt(sourceText: string, anchors: string[]): string {
		return [
			'Compress the following recent story turns into a single third-person summary paragraph (2-4 sentences).',
			'Preserve who did what, where, and any unresolved consequence. Keep every named character and place spelled exactly as written.',
			'Do not add new events, motives, dialogue, or facts that are not present in the input.',
			anchors.length ? `Names that must be spelled exactly if mentioned: ${anchors.join(', ')}.` : '',
			'',
			'RECENT TURNS:',
			sourceText,
			'',
			'Return only the summary paragraph.',
		].filter(Boolean).join('\n');
	}

	private static buildDeterministicSummary(sources: RecentTurnSource[], runtime: Record<string, any>): string {
		const segments = sources
			.map((turn) => {
				const parts = [normalize(turn.playerAction), normalize(turn.narration)].filter(Boolean);
				return parts.join(' — ');
			})
			.filter(Boolean);
		if (segments.length > 0) {
			return `Recent events: ${segments.join(' Then, ')}`.slice(0, MAX_SUMMARY_CHARS);
		}
		const beats = Array.isArray(runtime.plot?.beats) ? runtime.plot.beats : [];
		const beatText = beats.map((beat: any) => normalize(beat?.text)).filter(Boolean).slice(-SCENE_SUMMARY_CADENCE_TURNS);
		if (beatText.length > 0) return `Recent events: ${beatText.join(' Then, ')}`.slice(0, MAX_SUMMARY_CHARS);
		return normalize(runtime.plot?.summary);
	}

	/** Durable PLOT_CHUNK memory so retrieval can surface the compressed plot prose. */
	private static persistChunkMemory(repository: WorldRepository, storyId: string, chunk: SceneSummaryChunk, anchors: string[]): void {
		try {
			const memoryEngine = repository.getMemoryEngine(storyId);
			if (memoryEngine.getMemory(chunk.id)) return;
			const playerActorId = repository.getPlayerLifecycle(storyId)?.actorId || `player_actor_${storyId}`;
			const currentTurn = chunk.toTurn;
			const tags = ['PLOT_CHUNK', 'summary.scene', ...anchors.map((anchor) => anchor.toLowerCase())];
			memoryEngine.storeMemory({
				id: chunk.id,
				storyId,
				memoryClass: 'EPISODIC',
				subjectEntityId: playerActorId,
				relatedEntityIds: [],
				relatedLocationId: undefined,
				content: chunk.text,
				importance: 70,
				confidence: chunk.source === 'AI' ? 0.8 : 0.65,
				status: 'active',
				visibility: 'PRIVATE',
				accessibleToEntityIds: [playerActorId],
				isPersistentCritical: false,
				provenance: 'summary.scene',
				perspective: 'SUBJECTIVE',
				validFromTurn: chunk.fromTurn,
				lastRecalledTurn: currentTurn,
				createdAtTimestamp: repository.getWorldClock(storyId).getTimestamp(),
				lastRecalledTimestamp: repository.getWorldClock(storyId).getTimestamp(),
				triggerConditionTags: tags,
			});
		} catch {
			// Memory persistence is a durability enhancement; a failure must not break the turn.
		}
	}
}

export const narrativeSummaryLifecycle = NarrativeSummaryLifecycle;
