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
	return (Array.isArray(situation.playerKnowledge?.knownFacts) ? situation.playerKnowledge.knownFacts : []).some((known) => normalize(JSON.stringify(known)) === serialized);
}

export const NON_DISTINCTIVE_NAME_TOKENS = new Set([
	// Honorifics & titles
	'mr', 'mrs', 'ms', 'miss', 'mister', 'master',
	'dr', 'doc', 'doctor',
	'prof', 'professor',
	'sir', 'dame', 'lord', 'lady', 'baron', 'baroness', 'count', 'countess', 'duke', 'duchess',
	'father', 'mother', 'brother', 'sister', 'pastor', 'reverend', 'rev', 'priest', 'bishop', 'rabbi', 'imam', 'monk',
	'officer', 'detective', 'inspector', 'constable', 'sergeant', 'sgt', 'lieutenant', 'lt', 'captain', 'capt', 'major', 'colonel', 'col', 'general', 'gen', 'commander', 'cmdr', 'chief', 'sheriff', 'deputy', 'agent',
	'judge', 'justice', 'mayor', 'governor', 'chancellor', 'minister', 'president', 'senator',
	'nurse', 'coach', 'chef',
	// Grammatical particles & articles
	'the', 'a', 'an', 'von', 'van', 'der', 'den', 'del', 'della', 'de', 'da', 'di', 'du', 'la', 'le', 'lo', 'san', 'st', 'saint',
	// Generational & academic suffixes
	'jr', 'junior', 'sr', 'senior', 'esq', 'esquire', 'phd', 'md',
	'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
]);

export const COMMON_DICTIONARY_NAME_WORDS = new Set([
	// Virtues & mental/emotional states
	'hope', 'faith', 'grace', 'joy', 'peace', 'prudence', 'charity', 'patience', 'mercy', 'glory', 'honor', 'honour', 'justice', 'truth',
	// Cardinal directions & spatial
	'north', 'south', 'east', 'west',
	// Nature, flora, fauna, elements
	'rose', 'daisy', 'lily', 'violet', 'ivy', 'hazel', 'holly', 'willow', 'ash', 'autumn', 'summer', 'winter', 'spring', 'dawn', 'dusk', 'frost', 'storm', 'snow', 'rain', 'river', 'brook', 'brooks', 'cliff', 'clay', 'stone', 'wood', 'woods', 'robin', 'wren', 'falcon', 'fox', 'wolf', 'hawk',
	// Common homograph verbs, adjectives, nouns
	'will', 'may', 'mark', 'grant', 'chase', 'frank', 'miles', 'penny', 'bill', 'art', 'bob', 'pat', 'sandy', 'rusty', 'short', 'young', 'long', 'little', 'brown', 'white', 'black', 'gray', 'grey', 'green', 'bell', 'ford', 'page', 'ward', 'hall', 'lane', 'cross', 'cook', 'baker', 'miller', 'hunter', 'fisher', 'smith', 'king', 'queen', 'prince', 'knight',
]);

export interface ExtractedNameTokens {
	compositeNames: string[];
	distinctiveTokens: string[];
	dictionaryTokens: string[];
}

export function extractEntityNameTokens(
	entity: { name?: string; originalName?: string; displayName?: string; aliases?: string[]; card?: any },
): ExtractedNameTokens {
	const displayNorm = String(entity.displayName || '').trim().toLowerCase();
	const displayTokens = new Set(
		displayNorm
			.split(/[^a-zA-Z0-9]+/)
			.filter(Boolean)
	);

	const rawCandidates: string[] = [
		entity.name,
		(entity as any).originalName,
		...((entity as any).aliases || []),
		...((entity as any).card?.identity?.aliases || []),
	].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);

	const compositeNames = new Set<string>();
	const distinctiveTokens = new Set<string>();
	const dictionaryTokens = new Set<string>();

	for (const raw of rawCandidates) {
		const trimmed = raw.trim();
		if (trimmed.length < 3) continue;

		const lower = trimmed.toLowerCase();
		if (displayNorm && (lower === displayNorm || displayNorm.includes(lower))) continue;

		if (!NON_DISTINCTIVE_NAME_TOKENS.has(lower)) {
			compositeNames.add(trimmed);
		}

		const subTokens = trimmed.split(/[\s\-_]+/);
		for (const sub of subTokens) {
			const cleaned = sub.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
			if (cleaned.length < 3) continue;

			const cleanLower = cleaned.toLowerCase();
			if (displayTokens.has(cleanLower) || (displayNorm && displayNorm.includes(cleanLower))) continue;
			if (NON_DISTINCTIVE_NAME_TOKENS.has(cleanLower)) continue;

			if (COMMON_DICTIONARY_NAME_WORDS.has(cleanLower)) {
				dictionaryTokens.add(cleaned);
			} else {
				distinctiveTokens.add(cleaned);
			}

			if (cleaned.includes("'")) {
				const parts = cleaned.split("'").filter((p) => p.length >= 3);
				for (const part of parts) {
					const partLower = part.toLowerCase();
					if (displayTokens.has(partLower) || (displayNorm && displayNorm.includes(partLower)) || NON_DISTINCTIVE_NAME_TOKENS.has(partLower)) {
						continue;
					}
					if (COMMON_DICTIONARY_NAME_WORDS.has(partLower)) {
						dictionaryTokens.add(part);
					} else {
						distinctiveTokens.add(part);
					}
				}
			}
		}
	}

	return {
		compositeNames: Array.from(compositeNames),
		distinctiveTokens: Array.from(distinctiveTokens),
		dictionaryTokens: Array.from(dictionaryTokens),
	};
}

function matchesForbiddenAnchor(text: string, anchor: string): boolean {
	if (anchor.length >= 8 || /\s/.test(anchor)) {
		return text.includes(anchor);
	}
	const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const regex = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'i');
	return regex.test(text);
}

function forbiddenAnchors(situation: CurrentSituation): string[] {
	// Text the player already legitimately holds. A hidden fact whose object is merely a name or place the player
	// already knows ("Victor Lang killed -> Arthur Pendelton") must not redact every public fact that mentions it.
	const knownText = normalize([
		...(Array.isArray(situation.playerKnowledge?.knownFacts) ? situation.playerKnowledge.knownFacts : []).map((known) => JSON.stringify(known)),
		...(Array.isArray(situation.nearbyEntities) ? situation.nearbyEntities : []).filter((entity) => entity.identityKnown !== false).map((entity) => entity.name),
	].join(' '));
	const factAnchors = (Array.isArray(situation.worldFacts) ? situation.worldFacts : [])
		.filter((fact) => !factAuthorized(situation, fact))
		.flatMap((fact) => [
			normalize(fact.objectValue) && knownText.includes(normalize(fact.objectValue)) ? '' : fact.objectValue,
			[fact.subjectEntityId, fact.predicate, fact.objectValue].filter(Boolean).join(' '),
		])
		.map(normalize)
		.filter((value) => value.length >= 8);

	const unintroducedEntityAnchors = (Array.isArray(situation.nearbyEntities) ? situation.nearbyEntities : [])
		.filter((entity) => entity.identityKnown === false)
		.flatMap((entity) => {
			const { compositeNames, distinctiveTokens } = extractEntityNameTokens(entity);
			return [...compositeNames, ...distinctiveTokens]
				.map(normalize)
				.filter((val) => val.length >= 3);
		});

	return Array.from(new Set([...factAnchors, ...unintroducedEntityAnchors]));
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
			const forbidden = anchors.some((anchor) => matchesForbiddenAnchor(content, anchor));
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
			if (anchors.some((anchor) => matchesForbiddenAnchor(normalized, anchor))) {
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
