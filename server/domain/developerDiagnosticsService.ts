import { captureCanonicalStateSnapshot, CanonicalStateSnapshot } from './canonicalSnapshot';
import { CampaignArchiveService } from './campaignArchive';
import type { InMemoryWorldRepository } from '../repositories/worldRepository';

export interface DiagnosticTimelineEntry {
	eventId: string;
	commandId: string;
	commandType: string;
	source: string;
	actorId?: string;
	committedAt: string;
	summary: string;
	mutationPaths: string[];
	mutationCount: number;
	replay: {
		preStateHash: string;
		postStateHash: string;
		canonicalSequence: number;
		resolvedDataHash: string;
		rngState: unknown;
	};
}

export interface DiagnosticWhyExplanation {
	eventId: string;
	commandId: string;
	title: string;
	summary: string;
	evidence: Array<{
		source: 'CANONICAL_EVENT' | 'CHRONICLE_EVIDENCE' | 'WORLD_RULE' | 'RUNTIME_STATE';
		id: string;
		description: string;
	}>;
	mutationPaths: string[];
	deterministic: true;
	aiUsed: false;
}

function clone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function stableRedact(value: unknown, key = ''): unknown {
	const sensitiveKey = /(api.?key|authorization|secret|password|token|credential|base64|rawResponse|audioResultBase64)/i.test(key);
	if (sensitiveKey) return '[REDACTED]';
	if (value === null || value === undefined) return value;
	if (Array.isArray(value)) return value.map((item) => stableRedact(item));
	if (typeof value !== 'object') return value;

	const result: Record<string, unknown> = {};
	for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
		result[childKey] = stableRedact(childValue, childKey);
	}
	return result;
}

function validateLocation(snapshot: any, locationId?: string): string[] {
	const errors: string[] = [];
	if (!locationId) return errors;
	const nodes = snapshot?.geography?.nodes;
	if (Array.isArray(nodes) && nodes.length > 0 && !nodes.some((node: any) => node?.id === locationId)) {
		errors.push(`Player location '${locationId}' is missing from GeographyGraph.`);
	}
	return errors;
}

export class DeveloperDiagnosticsService {
	public static getTimeline(
		repository: InMemoryWorldRepository,
		storyId: string,
		limit = 50,
		offset = 0
	): {
		items: DiagnosticTimelineEntry[];
		total: number;
		offset: number;
		limit: number;
		hasMore: boolean;
	} {
		const events = repository.getCanonicalCommandEvents(storyId);
		const safeLimit = Math.max(1, Math.min(200, Math.floor(limit || 50)));
		const safeOffset = Math.max(0, Math.floor(offset || 0));
		const items = events
			.slice()
			.sort((a: any, b: any) => Number(a?.replay?.canonicalSequence || 0) - Number(b?.replay?.canonicalSequence || 0))
			.slice(safeOffset, safeOffset + safeLimit)
			.map((event: any) => stableRedact(clone(event)) as DiagnosticTimelineEntry);

		return {
			items,
			total: events.length,
			offset: safeOffset,
			limit: safeLimit,
			hasMore: safeOffset + items.length < events.length,
		};
	}

	public static getRuleInspector(repository: InMemoryWorldRepository, storyId: string): Record<string, unknown> {
		const run = repository.getStoryRun(storyId);
		const world = run?.worldId ? repository.getWorldTemplate(run.worldId) : null;
		const rulesProfile = repository.getRulesProfile(storyId);
		const narrativeProfile = repository.getNarrativeProfile(storyId);
		const worldRules = Array.isArray(world?.worldRules) ? clone(world.worldRules) : [];
		const customRules = Array.isArray(world?.customRules) ? clone(world.customRules) : [];
		const constraints = Array.isArray(world?.ruleConstraints) ? clone(world.ruleConstraints) : [];

		return stableRedact({
			storyId,
			worldId: run?.worldId || world?.worldId || null,
			rulesProfile,
			narrativeProfile,
			worldRules,
			customRules,
			ruleConstraints: constraints,
			canonicalCapabilities: Array.isArray(world?.canonicalCapabilities) ? clone(world.canonicalCapabilities) : [],
		}) as Record<string, unknown>;
	}

	public static getRuntimeInspector(repository: InMemoryWorldRepository, storyId: string): Record<string, unknown> {
		const snapshot = captureCanonicalStateSnapshot(storyId, repository);
		const player = repository.getPlayerLifecycle(storyId);
		const lastEvent = repository.getCanonicalCommandEvents(storyId).slice(-1)[0] || null;

		return stableRedact({
			storyId,
			worldTime: snapshot.worldClock,
			resources: {
				player: player ? {
					actorId: player.actorId,
					name: player.name,
					hpCurrent: (player as any).hpCurrent,
					hpMax: (player as any).hpMax,
					locationId: player.locationId,
				} : null,
				inventory: snapshot.inventory,
				progression: snapshot.progression,
			},
			conditions: snapshot.conditions,
			concentration: (snapshot.combat as any)?.concentration || (snapshot.conditions as any)?.concentration || null,
			reactions: (snapshot.combat as any)?.reactions || (snapshot.combat as any)?.reactionState || null,
			rngMetadata: lastEvent?.replay?.rngState || null,
			lastCanonicalEvent: lastEvent,
		}) as Record<string, unknown>;
	}

	public static validateWorld(repository: InMemoryWorldRepository, storyId: string): Record<string, unknown> {
		const snapshot = captureCanonicalStateSnapshot(storyId, repository);
		const run = repository.getStoryRun(storyId);
		const world = run?.worldId ? repository.getWorldTemplate(run.worldId) : null;
		const errors: string[] = [];
		const warnings: string[] = [];

		if (!run) errors.push('Active StoryRun does not exist.');
		if (run?.worldId && !world) errors.push(`StoryRun references missing world template '${run.worldId}'.`);
		errors.push(...validateLocation(snapshot, snapshot.player?.locationId));

		if (!Array.isArray(snapshot.geography?.nodes) || snapshot.geography.nodes.length === 0) {
			warnings.push('GeographyGraph contains no nodes.');
		}
		if (world && Array.isArray(world.customRules) && world.customRules.length === 0) {
			warnings.push('World has no custom rules. This is valid for FULL_DND but may be unexpected for CUSTOM_HOMEBREW.');
		}

		const archiveLike = {
			manifest: {
				archiveSchemaVersion: CampaignArchiveService.CURRENT_SCHEMA_VERSION,
				engineVersion: CampaignArchiveService.CURRENT_ENGINE_VERSION,
				campaignId: `campaign_${storyId}`,
				title: world?.title || run?.title || storyId,
				exportedAt: 'DIAGNOSTIC',
				partitionHashes: {},
			},
			partitions: {
				'canonical/world.json': JSON.stringify({
					clock: snapshot.worldClock,
					geography: snapshot.geography,
					knowledgeFacts: snapshot.worldFacts,
				}),
				'canonical/player.json': JSON.stringify(snapshot.player || {}),
				'canonical/inventory.json': JSON.stringify(snapshot.inventory || {}),
				'canonical/npcs.json': JSON.stringify(snapshot.npcs || {}),
				'canonical/chronicle.json': JSON.stringify(snapshot.chronicle || {}),
				'canonical/narrative.json': JSON.stringify(snapshot.narrativeHistory || []),
			},
		} as any;

		const archiveWarnings = CampaignArchiveService.validateArchive(archiveLike);
		if (!archiveWarnings.valid && archiveWarnings.errorReason) warnings.push(`Archive-shaped integrity check: ${archiveWarnings.errorReason}`);

		return stableRedact({
			storyId,
			valid: errors.length === 0,
			errors,
			warnings,
			worldId: run?.worldId || world?.worldId || null,
			rulesMode: run?.dndRulesMode || world?.dndRulesMode || world?.rulesetId || null,
			narrativeMode: run?.storyMode || world?.storyMode || null,
		}) as Record<string, unknown>;
	}

	public static validateCharacter(repository: InMemoryWorldRepository, storyId: string): Record<string, unknown> {
		const snapshot = captureCanonicalStateSnapshot(storyId, repository);
		const player = repository.getPlayerLifecycle(storyId);
		const errors: string[] = [];
		const warnings: string[] = [];

		if (!player) {
			errors.push('Player lifecycle is missing.');
		} else {
			if (!player.actorId) errors.push('Player lifecycle has no actorId.');
			errors.push(...validateLocation(snapshot, player.locationId));
		}

		const progression = snapshot.progression as any;
		if (!progression) {
			warnings.push('No progression state is currently persisted for the active player.');
		}

		return stableRedact({
			storyId,
			valid: errors.length === 0,
			errors,
			warnings,
			player: player ? {
				actorId: player.actorId,
				name: player.name,
				locationId: player.locationId,
			} : null,
			progression: progression || null,
		}) as Record<string, unknown>;
	}

	public static explainEvent(
		repository: InMemoryWorldRepository,
		storyId: string,
		eventId?: string,
		commandId?: string
	): DiagnosticWhyExplanation | null {
		const events = repository.getCanonicalCommandEvents(storyId);
		const event = events.find((entry: any) => (eventId && entry.eventId === eventId) || (commandId && entry.commandId === commandId));
		if (!event) return null;

		const chronicle = repository.getHistoricalChronicleEngine(storyId).exportState();
		const matchingEvidence = (chronicle.evidenceStore || []).filter((e: any) =>
			e?.metadata?.canonicalEventId === event.eventId || e?.sourceEventId === event.eventId
		);

		const world = repository.getStoryRun(storyId)?.worldId
			? repository.getWorldTemplate(repository.getStoryRun(storyId).worldId)
			: null;

		const evidence: DiagnosticWhyExplanation['evidence'] = [
			{
				source: 'CANONICAL_EVENT',
				id: event.eventId,
				description: `${event.commandType} committed for ${event.actorId || 'system'}: ${event.summary}`,
			},
			...matchingEvidence.map((item: any) => ({
				source: 'CHRONICLE_EVIDENCE' as const,
				id: item.id,
				description: item.summary || item.details || 'Canonical chronicle evidence was recorded for this event.',
			})),
			...(Array.isArray(world?.customRules) ? world.customRules.map((rule: any) => ({
				source: 'WORLD_RULE' as const,
				id: String(rule.id || 'world-rule'),
				description: String(rule.name || rule.description || 'Active world rule contributed to resolution context.'),
			})) : []),
		];

		if (event.actorId) {
			evidence.push({
				source: 'RUNTIME_STATE',
				id: `runtime:${storyId}:${event.actorId}`,
				description: `Runtime state was adjudicated under canonical command ${event.commandId} before the event was committed.`,
			});
		}

		return {
			eventId: event.eventId,
			commandId: event.commandId,
			title: `Why did this happen? — ${event.commandType}`,
			summary: event.summary,
			evidence,
			mutationPaths: event.mutationPaths || [],
			deterministic: true,
			aiUsed: false,
		};
	}
}
