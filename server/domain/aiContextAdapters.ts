import type { WorldRepository } from '../repositories/worldRepository';
import { WorkingContextEngine } from './workingContextEngine';
import { NarrativeContinuityEngine, type NarrativeResearchPacket } from './narrativeContinuityEngine';
import { projectPlayerCapabilities } from '../api/playerCapabilityProjection';

export interface ResearchBriefContext {
	storyId: string;
	viewerActorId?: string;
	packet: NarrativeResearchPacket;
}

export interface WorldGenerationContext {
	premise: string;
	title?: string;
	genreTags?: string[];
	toneTags?: string[];
	rulesetId?: string;
	constraints?: string[];
}

export interface CharacterGenerationContext {
	storyId?: string;
	worldId?: string;
	world: {
		worldId?: string;
		title?: string;
		setting?: string;
		genreTags?: string[];
		toneTags?: string[];
		rulesetId?: string;
		dndRulesMode?: string;
		summary?: string;
		description?: string;
	};
	naturalLanguageConcept?: string;
	existingDraft?: unknown;
	rulesProfile?: unknown;
}

export interface RulesOutcomeContext {
	storyId: string;
	actorId: string;
	rulesProfile: unknown;
	playerProjection: Record<string, unknown>;
	canonicalEvents: unknown[];
}

export interface CombatAIContext {
	storyId: string;
	actorId: string;
	combatProjection: unknown;
	capabilities: unknown;
	conditions: unknown;
	progression: unknown;
	rulesProfile: unknown;
}

export interface NarrativeOutcomeContext {
	storyId: string;
	viewerActorId?: string;
	assembledText: string;
	totalTokens: number;
	contextChunks: unknown[];
	research: NarrativeResearchPacket;
}

export interface OocContext extends NarrativeOutcomeContext {
	allowedToolModes: Array<'READ' | 'MUTATE'>;
}

function safeWorld(world: any): CharacterGenerationContext['world'] {
	if (!world) return {};
	return {
		worldId: world.worldId,
		title: world.title,
		setting: world.setting,
		genreTags: Array.isArray(world.genreTags) ? [...world.genreTags] : undefined,
		toneTags: Array.isArray(world.toneTags) ? [...world.toneTags] : undefined,
		rulesetId: world.rulesetId,
		dndRulesMode: world.dndRulesMode,
		summary: world.summary,
		description: world.description,
	};
}

export class AiContextAdapters {
	public static buildResearchBrief(repository: WorldRepository, storyId: string, viewerActorId?: string, query = 'current story context'): ResearchBriefContext {
		return {
			storyId,
			viewerActorId,
			packet: NarrativeContinuityEngine.research(repository, storyId, query, viewerActorId, { persist: false }),
		};
	}

	public static buildWorldGenerationContext(input: {
		premise: string;
		title?: string;
		genreTags?: string[];
		toneTags?: string[];
		rulesetId?: string;
		constraints?: string[];
	}): WorldGenerationContext {
		return {
			premise: String(input.premise || '').trim(),
			title: input.title?.trim() || undefined,
			genreTags: Array.isArray(input.genreTags) ? [...input.genreTags] : undefined,
			toneTags: Array.isArray(input.toneTags) ? [...input.toneTags] : undefined,
			rulesetId: input.rulesetId?.trim() || undefined,
			constraints: Array.isArray(input.constraints) ? [...input.constraints] : undefined,
		};
	}

	public static buildCharacterGenerationContext(repository: WorldRepository, input: {
		storyId?: string;
		worldId?: string;
		naturalLanguageConcept?: string;
		existingDraft?: unknown;
	}): CharacterGenerationContext {
		const world = input.worldId ? repository.getWorldTemplate(input.worldId) : undefined;
		const storyRules = input.storyId ? repository.getRulesProfile(input.storyId) : undefined;
		return {
			storyId: input.storyId,
			worldId: input.worldId,
			world: safeWorld(world),
			naturalLanguageConcept: input.naturalLanguageConcept,
			existingDraft: input.existingDraft,
			rulesProfile: storyRules,
		};
	}

	public static buildRulesOutcomeContext(repository: WorldRepository, storyId: string, actorId: string): RulesOutcomeContext {
		return {
			storyId,
			actorId,
			rulesProfile: repository.getRulesProfile(storyId),
			playerProjection: projectPlayerCapabilities(repository, storyId, actorId) as unknown as Record<string, unknown>,
			canonicalEvents: repository.getCanonicalCommandEvents(storyId).slice(-12),
		};
	}

	public static buildCombatAIContext(repository: WorldRepository, storyId: string, actorId: string): CombatAIContext {
		const combat = repository.getCombatEngine(storyId);
		const player = repository.getPlayerLifecycle(storyId);
		return {
			storyId,
			actorId,
			combatProjection: combat.projectCombatForActor(
				actorId,
				repository.getCombatPerceptionOptions(storyId, actorId),
			),
			capabilities: projectPlayerCapabilities(repository, storyId, actorId),
			conditions: player?.injuries ? JSON.parse(JSON.stringify(player.injuries)) : [],
			progression: repository.getCharacterProgressionEngine(storyId).getState(actorId),
			rulesProfile: repository.getRulesProfile(storyId),
		};
	}

	public static buildNarrativeOutcomeContext(repository: WorldRepository, params: {
		storyId: string;
		viewerActorId?: string;
		playerAction?: string;
		committedOutcome?: string;
		hardTokenBudget?: number;
		customChunks?: Parameters<typeof WorkingContextEngine.assembleTurnContext>[0]['customChunks'];
	}): NarrativeOutcomeContext {
		const research = NarrativeContinuityEngine.research(
			repository,
			params.storyId,
			params.playerAction || 'current story context',
			params.viewerActorId,
			{ persist: false },
		);
		const assembled = WorkingContextEngine.assembleTurnContext({
			storyId: params.storyId,
			viewerActorId: params.viewerActorId,
			playerAction: params.playerAction,
			committedOutcome: params.committedOutcome,
			hardTokenBudget: params.hardTokenBudget || 1400,
			worldRepo: repository,
			customChunks: params.customChunks,
		});
		return {
			storyId: params.storyId,
			viewerActorId: params.viewerActorId,
			assembledText: assembled.assembledText,
			totalTokens: assembled.totalTokens,
			contextChunks: assembled.chunks,
			research,
		};
	}

	public static buildOocContext(repository: WorldRepository, params: {
		storyId: string;
		viewerActorId?: string;
		message: string;
		toolManifest?: string;
		hardTokenBudget?: number;
	}): OocContext {
		const customChunks = params.toolManifest
			? [{
				id: 'ooc_tool_registry',
				band: 'B1_CRITICAL' as const,
				label: 'Canonical OOC Tool Registry',
				content: params.toolManifest,
				estimatedTokens: WorkingContextEngine.estimateTokens(params.toolManifest),
				sourceAuthority: 'OocToolRegistry',
				isProtected: true,
				relevanceScore: 1,
			}]
			: undefined;
		const context = this.buildNarrativeOutcomeContext(repository, {
			storyId: params.storyId,
			viewerActorId: params.viewerActorId,
			playerAction: params.message,
			hardTokenBudget: params.hardTokenBudget || 1400,
			customChunks,
		});
		return {
			...context,
			allowedToolModes: ['READ', 'MUTATE'],
		};
	}
}

export const aiContextAdapters = AiContextAdapters;
