import type { WorldRepository } from '../repositories/worldRepository';
import { WorkingContextEngine } from './workingContextEngine';
import { formatCanonicalTimestamp } from './deterministicRng';
import { CurrentSituationBuilder, type CurrentSituation } from './currentSituation';
import { narrativeContinuityEngine, type NarrativeResearchPacket } from './narrativeContinuityEngine';
import type { PlayerIntent } from './playerIntentInterpreter';

export type NarrativeResearchBlockKind =
	| 'SCENE'
	| 'ENTITY'
	| 'KNOWLEDGE'
	| 'MEMORY'
	| 'PLOT'
	| 'THREAD'
	| 'CONSEQUENCE';

export type NarrativeResearchExpiration = 'TURN' | 'SCENE' | 'UNTIL_CHANGED';

export interface NarrativeResearchBlock {
	id: string;
	kind: NarrativeResearchBlockKind;
	source: string;
	sourceId?: string;
	priority: number;
	relevanceScore: number;
	reason: string;
	expiration: NarrativeResearchExpiration;
	estimatedTokens: number;
	content: string;
}

export interface NarrativeResearchBudgets {
	scene: number;
	entities: number;
	memories: number;
	lore: number;
	plot: number;
	total: number;
}

export interface NarrativeResearchExclusion {
	label: string;
	kind: NarrativeResearchBlockKind;
	reason: string;
	sourceId?: string;
}

export interface NarrativeResearchResult {
	storyId: string;
	failures: string[];
	turnId: string;
	query: string;
	viewerActorId: string;
	packet: NarrativeResearchPacket;
	blocks: NarrativeResearchBlock[];
	excluded: NarrativeResearchExclusion[];
	budgets: NarrativeResearchBudgets;
	promptContext: string;
	totalTokens: number;
	capturedAt: string;
}

interface CandidateBlock extends NarrativeResearchBlock {
	topicTokens: string[];
}

function normalize(value: unknown): string {
	return String(value ?? '').trim();
}

function tokens(value: unknown): string[] {
	return Array.from(
		new Set(
			normalize(value)
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter((token) => token.length >= 4),
		),
	);
}

function estimate(text: string): number {
	return WorkingContextEngine.estimateTokens(text);
}

function truncate(text: string, maxChars: number): string {
	return text.length > maxChars ? text.slice(0, maxChars - 1).trimEnd() + '…' : text;
}

function overlapScore(sourceTokens: string[], queryTokens: string[]): number {
	if (queryTokens.length === 0 || sourceTokens.length === 0) return 0;
	const source = new Set(sourceTokens);
	let hits = 0;
	for (const token of queryTokens) if (source.has(token)) hits += 1;
	return hits / Math.max(1, Math.min(queryTokens.length, 12));
}

function hasAny(values: string[], candidates: string[]): boolean {
	const set = new Set(values);
	return candidates.some((value) => set.has(value));
}

function emptyPacket(storyId: string, query: string, viewerActorId: string, situation: CurrentSituation): NarrativeResearchPacket {
	return {
		storyId,
		query,
		knowledgeFacts: [],
		memories: [],
		storyThreads: [],
		relationships: [],
		plot: { storyId, version: 1, currentArc: situation.plot.currentArc || 'OPENING', summary: situation.plot.summary || '', beats: [], openThreads: [], updatedAt: situation.worldTime },
		plan: { storyId, version: 1, objective: 'Proceed from Current Situation without additional research.', nextBeats: [], priorityThreads: [], contingencies: [], updatedAt: situation.worldTime },
		usageGuidance: {
			knowledgeFacts: 'No additional knowledge research was available.',
			memories: 'No additional memory research was available.',
			storyThreads: 'Use only Current Situation thread data.',
			relationships: 'No additional relationship research was available.',
			plot: 'Use Current Situation plot data.',
			plan: 'No persistent plan was promoted by this failure path.',
			worldMomentum: 'No additional world momentum research was available.',
			researchEvidence: 'No additional research evidence was available.',
			causalProvenance: 'No additional causal provenance was available.',
		},
		epistemicallyBoundTo: viewerActorId,
		currentSituation: situation,
	};
}

function currentTurnQuery(situation: CurrentSituation, playerAction?: string): string {
	return [
		playerAction,
		situation.currentAction?.originalText,
		situation.currentAction?.goal,
		situation.currentAction?.informationGoal,
		situation.location.name,
		situation.activeDialogue?.text,
	]
		.filter(Boolean)
		.join(' ');
}

function blockPriority(kind: NarrativeResearchBlockKind): number {
	switch (kind) {
		case 'SCENE': return 100;
		case 'ENTITY': return 95;
		case 'CONSEQUENCE': return 92;
		case 'KNOWLEDGE': return 86;
		case 'THREAD': return 82;
		case 'PLOT': return 78;
		case 'MEMORY': return 74;
	}
}

function addCandidate(
	candidates: CandidateBlock[],
	params: Omit<CandidateBlock, 'relevanceScore' | 'estimatedTokens'> & { relevanceScore?: number },
	queryTokens: string[],
): void {
	const normalized = normalize(params.content);
	if (!normalized) return;
	const topic = tokens([
		normalized,
		params.source,
		params.reason,
		params.sourceId,
	].filter(Boolean).join(' '));
	const relevance = Math.max(
		0,
		Math.min(
			1,
			(params.relevanceScore ?? 0.5) +
			Math.min(0.18, overlapScore(topic, queryTokens) * 0.18),
		),
	);
	candidates.push({
		...params,
		relevanceScore: relevance,
		estimatedTokens: estimate(normalized),
		topicTokens: topic,
		content: normalized,
	});
}

function normalizeEntityContent(entity: any): string {
	const values = [
		entity?.name ? 'Name: ' + entity.name : '',
		entity?.kind ? 'Kind: ' + entity.kind : '',
		entity?.role ? 'Role: ' + entity.role : '',
		entity?.presence ? 'Presence: ' + entity.presence : '',
		entity?.currentActivity ? 'Current activity: ' + entity.currentActivity : '',
		entity?.description ? 'Description: ' + entity.description : '',
		entity?.motivation ? 'Motivation: ' + entity.motivation : '',
		entity?.relationships ? 'Relationships: ' + JSON.stringify(entity.relationships) : '',
	].filter(Boolean);
	return values.join(' | ');
}

export class NarrativeResearchPipeline {
	public static readonly DEFAULT_BUDGETS: NarrativeResearchBudgets = {
		scene: 700,
		entities: 700,
		memories: 600,
		lore: 600,
		plot: 500,
		total: 2400,
	};

	public static research(params: {
		repository: WorldRepository;
		storyId: string;
		currentSituation?: CurrentSituation;
		playerIntent?: PlayerIntent;
		playerAction?: string;
		hardTokenBudget?: number;
		viewerActorId?: string;
	}): NarrativeResearchResult {
		const viewerActorId =
			params.viewerActorId ||
			params.currentSituation?.player.actorId ||
			params.repository.getPlayerLifecycle(params.storyId)?.actorId ||
			`player_actor_${params.storyId}`;

		const situation = params.currentSituation || CurrentSituationBuilder.build({
			storyId: params.storyId,
			playerAction: params.playerAction || '',
			currentAction: params.playerIntent,
			viewerActorId,
			worldRepo: params.repository,
		});
		const playerIntent = params.playerIntent || situation.currentAction;
		const query = currentTurnQuery(situation, params.playerAction || situation.currentAction?.originalText || '');
		const researchQuery = query || 'current story context';
		const failures: string[] = [];
		let packet: NarrativeResearchPacket;
		try {
			packet = narrativeContinuityEngine.research(
				params.repository,
				params.storyId,
				researchQuery,
				viewerActorId,
				{ persist: false, currentSituation: situation },
			);
		} catch (error: any) {
			failures.push(String(error?.message || error || 'Narrative continuity research failed.'));
			packet = emptyPacket(params.storyId, researchQuery, viewerActorId, situation);
		}
		const queryTokens = tokens([
			params.playerAction,
			playerIntent?.goal,
			playerIntent?.informationGoal,
			playerIntent?.action,
			situation.location.name,
			situation.location.regionId,
		].filter(Boolean).join(' '));

		const candidates: CandidateBlock[] = [];
		const excluded: NarrativeResearchExclusion[] = [];

		const sceneContent = [
			`Location: ${situation.location.name} [${situation.location.id}]`,
			`Region: ${situation.location.regionId}`,
			situation.location.description ? `Description: ${situation.location.description}` : '',
			situation.location.ambientSensory ? `Ambient: ${situation.location.ambientSensory}` : '',
			situation.activeDialogue ? `Active dialogue: ${situation.activeDialogue.speakerName}: ${situation.activeDialogue.text}` : '',
			...situation.visibleEvents.slice(0, 6).map((event) => `Visible event: ${event.summary}`),
			situation.availableInteractions.filter((interaction) => interaction.enabled).slice(0, 8).map((interaction) => `Interaction: ${interaction.label}`).join('\n'),
		].filter(Boolean).join('\n');
		addCandidate(candidates, {
			id: `research_scene_${params.storyId}_${situation.turnId}`,
			kind: 'SCENE',
			source: 'CurrentSituationBuilder',
			priority: blockPriority('SCENE'),
			reason: 'Current location, visible events, active dialogue, and currently available interactions define the immediate scene.',
			expiration: 'TURN',
			content: sceneContent,
		}, queryTokens);

		const explicitTargetIds = new Set(
			[
				...(playerIntent?.explicitTargets || []).map((target) => target.id).filter(Boolean),
				playerIntent?.target?.id,
			].filter(Boolean) as string[],
		);
		const explicitTargetNames = new Set(
			[
				...(playerIntent?.explicitTargets || []).map((target) => normalize(target.name).toLowerCase()),
				playerIntent?.target?.name,
			].filter(Boolean).map((name) => String(name).toLowerCase()),
		);

		const relevantEntities = situation.nearbyEntities
			.filter((entity) => entity.kind !== 'PLAYER')
			.filter((entity) => entity.visibleToPlayer)
			.filter((entity) =>
				explicitTargetIds.has(entity.id) ||
				explicitTargetNames.has(entity.name.toLowerCase()) ||
				entity.distanceBand === 'SAME_LOCATION' ||
				entity.explicitlyReferenced
			)
			.slice(0, 10);

		for (const entity of relevantEntities) {
			const explicit = explicitTargetIds.has(entity.id) || explicitTargetNames.has(entity.name.toLowerCase()) || entity.explicitlyReferenced;
			addCandidate(candidates, {
				id: `research_entity_${entity.id}`,
				kind: 'ENTITY',
				source: 'CurrentSituationBuilder.nearbyEntities',
				sourceId: entity.id,
				priority: blockPriority('ENTITY'),
				reason: explicit
					? 'The player explicitly referenced this visible entity.'
					: 'The entity is present in the current scene and can affect immediate reactions.',
				expiration: 'SCENE',
				relevanceScore: explicit ? 0.99 : 0.84,
				content: normalizeEntityContent(entity),
			}, queryTokens);
		}

		const entityCards = params.repository.getEntityCards(params.storyId);
		for (const entity of entityCards) {
			if (!explicitTargetIds.has(entity.id)) continue;
			if (relevantEntities.some((candidate) => candidate.id === entity.id)) continue;
			addCandidate(candidates, {
				id: `research_entity_sheet_${entity.id}`,
				kind: 'ENTITY',
				source: 'WorldRepository.entityCards',
				sourceId: entity.id,
				priority: blockPriority('ENTITY'),
				reason: 'The player explicitly referenced a canonical entity; retrieve only player-safe identity and role context.',
				expiration: 'TURN',
				relevanceScore: 1,
				content: truncate(JSON.stringify({
					id: entity.id,
					name: entity.name,
					identity: entity.identity,
					role: entity.role,
				}), 1600),
			}, queryTokens);
		}

		const consequenceTurns = situation.recentTurns
			.filter((turn) => turn.unresolvedConsequence)
			.slice(-4);
		for (const turn of consequenceTurns) {
			addCandidate(candidates, {
				id: `research_consequence_${turn.turnId || turn.turnNumber || 'recent'}`,
				kind: 'CONSEQUENCE',
				source: 'CurrentSituationBuilder.recentTurns',
				sourceId: String(turn.turnId || turn.turnNumber || 'recent'),
				priority: blockPriority('CONSEQUENCE'),
				reason: 'Immediate unresolved consequences can change how the current action should resolve.',
				expiration: 'TURN',
				relevanceScore: 0.96,
				content: truncate([
					turn.playerAction ? `Player action: ${turn.playerAction}` : '',
					turn.narration ? `Narration: ${turn.narration}` : '',
					turn.unresolvedConsequence ? `Unresolved consequence: ${turn.unresolvedConsequence}` : '',
				].filter(Boolean).join(' | '), 2200),
			}, queryTokens);
		}

		// Only use threads surfaced through Current Situation. The continuity packet can contain broader server-side threads.
		const threadCandidates = [...situation.openThreads];

		const seenThreads = new Set<string>();
		for (const thread of threadCandidates) {
			const title = normalize((thread as any)?.title || (thread as any)?.name || '');
			if (!title) continue;
			const id = normalize((thread as any)?.id || (thread as any)?.threadId || title);
			if (seenThreads.has(id)) continue;
			seenThreads.add(id);
			const threadText = [title, normalize((thread as any)?.summary), normalize((thread as any)?.status)].filter(Boolean).join(' | ');
			const overlap = overlapScore(tokens(threadText), queryTokens);
			if (overlap === 0 && !(playerIntent?.informationGoal && tokens(threadText).some((token) => tokens(playerIntent.informationGoal).includes(token)))) {
				excluded.push({
					label: title,
					kind: 'THREAD',
					sourceId: id,
					reason: 'Thread exists canonically but has no meaningful relevance to the current action, location, target, or information goal.',
				});
				continue;
			}
			addCandidate(candidates, {
				id: `research_thread_${id}`,
				kind: 'THREAD',
				source: 'CurrentSituationBuilder.openThreads / NarrativeContinuityEngine.storyThreads',
				sourceId: id,
				priority: blockPriority('THREAD'),
				reason: 'The open thread overlaps the current action or its explicit information goal.',
				expiration: 'UNTIL_CHANGED',
				relevanceScore: 0.82 + Math.min(0.12, overlap * 0.12),
				content: threadText,
			}, queryTokens);
		}

		const plotContent = [
			`Current arc: ${situation.plot.currentArc || 'OPENING'}`,
			situation.plot.summary ? `Plot summary: ${situation.plot.summary}` : '',
			...situation.plot.recentBeats.slice(-4).map((beat) => `Recent beat: ${beat.text}`),
		].filter(Boolean).join('\n');
		if (plotContent) {
			addCandidate(candidates, {
				id: `research_plot_${params.storyId}`,
				kind: 'PLOT',
				source: 'CurrentSituationBuilder.plot / NarrativeContinuityEngine',
				priority: blockPriority('PLOT'),
				reason: 'Plot context prevents the current turn from resetting continuity, but it is secondary to the immediate scene and intent.',
				expiration: 'UNTIL_CHANGED',
				content: truncate(plotContent, 2600),
			}, queryTokens);
		}

		const memoryCandidates = [
			...situation.relevantMemories,
			...packet.memories.map((memory: any) => ({
				id: normalize(memory?.id || memory?.memoryId || JSON.stringify(memory)),
				memoryClass: normalize(memory?.memoryClass || memory?.type || 'MEMORY'),
				content: normalize(memory?.content || memory?.summary || memory?.text || JSON.stringify(memory)),
				source: normalize(memory?.continuityScope || 'WORLD'),
				importance: Number(memory?.importance || 0),
			})),
		];
		const seenMemories = new Set<string>();
		for (const memory of memoryCandidates) {
			const content = normalize((memory as any)?.content || (memory as any)?.summary || '');
			if (!content) continue;
			const id = normalize((memory as any)?.id || `memory_${content}`);
			if (seenMemories.has(id)) continue;
			seenMemories.add(id);
			const overlap = overlapScore(tokens(content), queryTokens);
			const serializedMemory = JSON.stringify(memory).toLowerCase();
			const locationLinked = serializedMemory.includes(situation.location.id.toLowerCase()) || serializedMemory.includes(situation.location.name.toLowerCase());
			const targetLinked = (playerIntent?.explicitTargets || []).some((target) => {
				const targetName = normalize(target.name).toLowerCase();
				return Boolean(targetName && content.toLowerCase().includes(targetName))
					|| Boolean(target.id && serializedMemory.includes(String(target.id).toLowerCase()))
					|| Boolean((memory as any)?.subjectEntityId && target.id === String((memory as any).subjectEntityId))
					|| (Array.isArray((memory as any)?.relatedEntityIds)
						&& (memory as any).relatedEntityIds.some((entityId: unknown) => target.id === String(entityId)));
			});
			if (overlap === 0 && !locationLinked && !targetLinked) {
				excluded.push({
					label: truncate(content, 160),
					kind: 'MEMORY',
					sourceId: id,
					reason: 'Memory is not linked to the current scene, explicit target, active information goal, or recent consequence.',
				});
				continue;
			}
			addCandidate(candidates, {
				id: `research_memory_${id}`,
				kind: 'MEMORY',
				source: `MemoryEngine / ${normalize((memory as any)?.source || 'WORLD')}`,
				sourceId: id,
				priority: blockPriority('MEMORY'),
				reason: locationLinked
					? 'Memory is linked to the current location/scene.'
					: 'Memory overlaps the current action or information goal.',
				expiration: 'TURN',
				relevanceScore: Math.min(0.92, 0.72 + overlap * 0.2),
				content: truncate(`[${normalize((memory as any)?.memoryClass || 'MEMORY')}] ${content}`, 1800),
			}, queryTokens);
		}

		const knowledgeCandidates = [
			...situation.relevantLore,
			...packet.knowledgeFacts.map((fact: any) => ({
				id: normalize(fact?.id || JSON.stringify(fact)),
				subjectEntityId: normalize(fact?.subjectEntityId),
				predicate: normalize(fact?.predicate),
				objectValue: normalize(fact?.objectValue),
				sourceType: normalize(fact?.sourceType),
				scope: normalize(fact?.scope),
				provenanceSummary: normalize(fact?.provenanceSummary),
			})),
		];
		const seenFacts = new Set<string>();
		for (const fact of knowledgeCandidates) {
			const content = normalize([
				fact?.subjectEntityId,
				fact?.predicate,
				fact?.objectValue,
				fact?.sourceType ? `source=${fact.sourceType}` : '',
				fact?.scope ? `scope=${fact.scope}` : '',
				fact?.provenanceSummary,
			].filter(Boolean).join(' '));
			if (!content) continue;
			const id = normalize(fact?.id || `fact_${content}`);
			if (seenFacts.has(id)) continue;
			seenFacts.add(id);
			const overlap = overlapScore(tokens(content), queryTokens);
			const entityRelated =
				Boolean(fact?.subjectEntityId && explicitTargetIds.has(fact.subjectEntityId)) ||
				(Boolean(fact?.subjectEntityId) && relevantEntities.some((entity) => entity.id === fact.subjectEntityId));
			if (overlap === 0 && !entityRelated) {
				excluded.push({
					label: truncate(content, 180),
					kind: 'KNOWLEDGE',
					sourceId: id,
					reason: 'Authorized knowledge exists but is not relevant to the current action, explicit target, current scene, or information goal.',
				});
				continue;
			}
			addCandidate(candidates, {
				id: `research_knowledge_${id}`,
				kind: 'KNOWLEDGE',
				source: 'Authorized player knowledge',
				sourceId: id,
				priority: blockPriority('KNOWLEDGE'),
				reason: entityRelated
					? 'Authorized player knowledge directly concerns the explicit/current target.'
					: 'Authorized player knowledge overlaps the current information goal or scene.',
				expiration: 'UNTIL_CHANGED',
				relevanceScore: Math.min(0.95, 0.76 + (entityRelated ? 0.12 : overlap * 0.12)),
				content: truncate(content, 1800),
			}, queryTokens);
		}

		const budgets: NarrativeResearchBudgets = {
			...this.DEFAULT_BUDGETS,
			total: Math.min(this.DEFAULT_BUDGETS.total, Math.max(1200, params.hardTokenBudget ?? this.DEFAULT_BUDGETS.total)),
		};
		const perKindBudget: Record<NarrativeResearchBlockKind, number> = {
			SCENE: budgets.scene,
			ENTITY: budgets.entities,
			CONSEQUENCE: Math.min(450, budgets.scene),
			KNOWLEDGE: budgets.lore,
			MEMORY: budgets.memories,
			PLOT: budgets.plot,
			THREAD: Math.min(budgets.plot, 450),
		};
		const sorted = candidates.sort((a, b) => {
			const priority = b.priority - a.priority;
			if (priority !== 0) return priority;
			if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
			return a.id.localeCompare(b.id);
		});
		const selected: NarrativeResearchBlock[] = [];
		const usedByKind: Record<NarrativeResearchBlockKind, number> = {
			SCENE: 0,
			ENTITY: 0,
			KNOWLEDGE: 0,
			MEMORY: 0,
			PLOT: 0,
			THREAD: 0,
			CONSEQUENCE: 0,
		};
		let total = 0;
		for (const candidate of sorted) {
			if (selected.length >= 32) break;
			const kindBudget = perKindBudget[candidate.kind];
			if (usedByKind[candidate.kind] + candidate.estimatedTokens > kindBudget) {
				excluded.push({
					label: candidate.id,
					kind: candidate.kind,
					sourceId: candidate.sourceId,
					reason: `Category budget exhausted for ${candidate.kind}.`,
				});
				continue;
			}
			if (total + candidate.estimatedTokens > budgets.total) {
				excluded.push({
					label: candidate.id,
					kind: candidate.kind,
					sourceId: candidate.sourceId,
					reason: 'Global research token budget exhausted; lower-value blocks were excluded instead of backfilling from unrelated context.',
				});
				continue;
			}
			selected.push(candidate);
			usedByKind[candidate.kind] += candidate.estimatedTokens;
			total += candidate.estimatedTokens;
		}

		const promptContext = [
			'NARRATIVE RESEARCH RESULTS',
			`Query: ${query || 'current story context'}`,
			`Research budget: ${budgets.total} estimated tokens; selected: ${total}`,
			...selected.map((block) =>
				`[RESEARCH ${block.kind} | priority=${block.priority} | relevance=${block.relevanceScore.toFixed(2)} | expires=${block.expiration}] ${block.reason}\n${block.content}`
			),
			'Knowledge boundary: these are selected player-authorized/context-relevant facts. Do not treat omitted, hidden, private, or excluded data as known.',
		].join('\n\n');

		const capturedAt = params.repository.getWorldClock(params.storyId).getTimestamp();
		return {
			storyId: params.storyId,
			turnId: situation.turnId,
			query: researchQuery,
			viewerActorId,
			failures,
			packet,
			blocks: selected.map(({ topicTokens: _topicTokens, ...block }) => block),
			excluded,
			budgets,
			promptContext,
			totalTokens: total,
			capturedAt: formatCanonicalTimestamp(capturedAt),
		};
	}

	public static summarizeForPlayer(result: NarrativeResearchResult): Record<string, unknown> {
		return {
			storyId: result.storyId,
			turnId: result.turnId,
			failures: result.failures,
			query: result.query,
			viewerActorId: result.viewerActorId,
			budgets: result.budgets,
			totalTokens: result.totalTokens,
			selected: result.blocks.map((block) => ({
				id: block.id,
				kind: block.kind,
				source: block.source,
				sourceId: block.sourceId,
				priority: block.priority,
				relevanceScore: block.relevanceScore,
				reason: block.reason,
				expiration: block.expiration,
				estimatedTokens: block.estimatedTokens,
			})),
			excluded: result.excluded.slice(0, 40),
			promptContext: result.promptContext.slice(0, 12000),
			fallbackMode: result.failures.length > 0 ? 'CURRENT_SITUATION_ONLY' : 'NORMAL_RESEARCH',
		};
	}
}
