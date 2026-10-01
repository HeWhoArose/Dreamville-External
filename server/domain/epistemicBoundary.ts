import type { CurrentSituation } from './currentSituation';
import type { NarrativeResearchResult } from './narrativeResearchPipeline';

export interface EpistemicBoundaryReport {
	viewerActorId: string;
	unauthorizedFactCount: number;
	removedResearchBlockIds: string[];
	removedContextLineCount: number;
	playerSafe: boolean;
	reasons: string[];
}

function normalize(value: unknown): string {
	return String(value ?? '').trim().toLowerCase();
}

function factAuthorized(situation: CurrentSituation, fact: CurrentSituation['worldFacts'][number]): boolean {
	const factId = normalize(fact.id);
	if (factId && Array.isArray(situation.playerKnowledge.authorizedFactIds) && situation.playerKnowledge.authorizedFactIds.includes(factId)) return true;
	const serialized = normalize(JSON.stringify(fact));
	return situation.playerKnowledge.knownFacts.some((known) => normalize(JSON.stringify(known)) === serialized);
}

function forbiddenAnchors(situation: CurrentSituation): string[] {
	return situation.worldFacts
		.filter((fact) => !factAuthorized(situation, fact))
		.flatMap((fact) => [
			fact.objectValue,
			[fact.subjectEntityId, fact.predicate, fact.objectValue].filter(Boolean).join(' '),
		])
		.map(normalize)
		.filter((value) => value.length >= 8);
}

export class EpistemicBoundaryEnforcer {
	public static sanitizeResearch(
		result: NarrativeResearchResult,
		situation: CurrentSituation,
	): { result: NarrativeResearchResult; report: EpistemicBoundaryReport } {
		const anchors = forbiddenAnchors(situation);
		const removedResearchBlockIds: string[] = [];
		const safeBlocks = result.blocks.filter((block) => {
			const content = normalize(block.content);
			const forbidden = anchors.some((anchor) => content.includes(anchor));
			if (forbidden) removedResearchBlockIds.push(block.id);
			return !forbidden;
		});
		const promptContext = safeBlocks.map((block) =>
			'[' + block.kind + '] ' + block.content
		).join('\n');
		const safeResult: NarrativeResearchResult = {
			...result,
			blocks: safeBlocks,
			promptContext: promptContext || '[no player-authorized research available]',
			totalTokens: safeBlocks.reduce((sum, block) => sum + block.estimatedTokens, 0),
		};
		return {
			result: safeResult,
			report: {
				viewerActorId: situation.playerKnowledge.viewerActorId,
				unauthorizedFactCount: anchors.length,
				removedResearchBlockIds,
				removedContextLineCount: 0,
				playerSafe: removedResearchBlockIds.length === 0,
				reasons: removedResearchBlockIds.length > 0 ? ['Research block contained an unauthorized world-truth anchor.'] : [],
			},
		};
	}

	public static sanitizeContext(
		text: string,
		situation: CurrentSituation,
	): { text: string; report: EpistemicBoundaryReport } {
		const anchors = forbiddenAnchors(situation);
		const lines = String(text || '').split('\n');
		const safeLines: string[] = [];
		let removed = 0;
		for (const line of lines) {
			const normalized = normalize(line);
			if (anchors.some((anchor) => normalized.includes(anchor))) {
				removed += 1;
				continue;
			}
			safeLines.push(line);
		}
		return {
			text: safeLines.join('\n'),
			report: {
				viewerActorId: situation.playerKnowledge.viewerActorId,
				unauthorizedFactCount: anchors.length,
				removedResearchBlockIds: [],
				removedContextLineCount: removed,
				playerSafe: removed === 0,
				reasons: removed > 0 ? ['Supporting context contained unauthorized world-truth anchors.'] : [],
			},
		};
	}

	public static playerSafeSituation(situation: CurrentSituation): Omit<CurrentSituation, 'worldFacts'> & { worldFactsOmitted: true } {
		return CurrentSituationBuilderSafeProjection(situation);
	}
}

function CurrentSituationBuilderSafeProjection(situation: CurrentSituation): Omit<CurrentSituation, 'worldFacts'> & { worldFactsOmitted: true } {
	const safe = JSON.parse(JSON.stringify(situation)) as any;
	delete safe.worldFacts;
	if (safe.activeDialogue) delete safe.activeDialogue.epistemicNote;
	return { ...safe, worldFactsOmitted: true };
}

export const epistemicBoundaryEnforcer = EpistemicBoundaryEnforcer;
