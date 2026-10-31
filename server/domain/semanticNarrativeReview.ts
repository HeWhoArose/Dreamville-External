import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { EphemeralNarrativePlan } from './narrativeDirector';
import type { StructuredTurnPackage } from './aiOrchestrator';
import type { ActionResolution } from './actionResolution';
import { NarrativeQualityContractEngine, type NarrativeQualityContract } from './narrativeQualityContract';

export type NarrativeReviewDecision = 'ACCEPT' | 'REWRITE' | 'REJECT';

export interface NarrativeViolation {
	code:
		| 'SEMANTIC_MISMATCH'
		| 'MISSING_MOVEMENT'
		| 'MISSING_OBSERVATION'
		| 'MISSING_INFORMATION'
		| 'MISSING_VISIBLE_CONSEQUENCE'
		| 'UNAUTHORIZED_SPEECH'
		| 'PLAYER_AGENCY'
		| 'UNSUPPORTED_CLAIM'
		| 'UNSUPPORTED_STATE_PROPOSAL'
		| 'CANONICAL_CONTRADICTION';
	message: string;
	severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface NarrativeReview {
	decision: NarrativeReviewDecision;
	violations: NarrativeViolation[];
	missingRequirements: string[];
	unsupportedClaims: string[];
	playerAgencyViolation: boolean;
	semanticMismatch: boolean;
	source: 'DETERMINISTIC' | 'AI' | 'HYBRID';
	confidence: number;
}

function normalize(value: unknown): string {
	return String(value ?? '').trim().toLowerCase();
}

function tokens(value: unknown): string[] {
	return Array.from(new Set(
		normalize(value)
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length >= 5),
	));
}

function overlap(a: string, b: string): number {
	const left = new Set(tokens(a));
	const right = tokens(b);
	if (!left.size || !right.length) return 0;
	return right.filter((token) => left.has(token)).length / Math.min(left.size, right.length, 12);
}

function containsAny(text: string, pattern: RegExp): boolean {
	return pattern.test(text);
}

function buildForbiddenKnowledgeSet(situation: CurrentSituation): string[] {
	const authorized = situation.playerKnowledge.knownFacts.map((fact) => normalize(JSON.stringify(fact)));
	const playerVisibleContext = [
		situation.location.name,
		situation.location.description,
		situation.location.ambientSensory,
		situation.activeDialogue?.text || '',
		...situation.visibleEvents.map((event) => event.summary),
		...situation.relevantLore.map((fact) => [fact.predicate, fact.objectValue].join(' ')),
		...situation.openThreads.map((thread) => [thread.title, thread.summary].filter(Boolean).join(' ')),
		situation.plot.summary,
	]
		.map(normalize)
		.filter(Boolean)
		.join(' ');

	const forbidden: string[] = [];
	for (const fact of situation.worldFacts) {
		if (authorized.includes(normalize(JSON.stringify(fact)))) continue;

		const candidates = [
			String(fact.subjectEntityId || ''),
			String(fact.predicate || ''),
			String(fact.objectValue || ''),
			[String(fact.subjectEntityId || ''), String(fact.predicate || ''), String(fact.objectValue || '')].join(' '),
		]
			.map(normalize)
			.filter((value) => value.length >= 8)
			.filter((value) => value.split(/\s+/).filter(Boolean).length >= 2);

		for (const candidate of candidates) {
			if (playerVisibleContext.includes(candidate)) continue;
			forbidden.push(candidate);
		}
	}

	return Array.from(new Set(forbidden));
}

const ABSTRACT_OR_BASELINE_SCENE_NOUNS = new Set([
	'silence', 'stillness', 'hush', 'quiet', 'air', 'breeze', 'wind', 'draft',
	'light', 'daylight', 'sunlight', 'starlight', 'moonlight', 'shadow', 'shadows', 'darkness', 'gloom',
	'sky', 'horizon', 'ground', 'earth', 'floor', 'paving', 'stone', 'stones',
	'room', 'area', 'space', 'scene', 'surroundings', 'distance', 'center', 'middle', 'edge', 'side', 'corner', 'path', 'way',
	'tension', 'atmosphere', 'mood', 'question', 'answer', 'rumor', 'rumour', 'whisper', 'whispers', 'murmur', 'murmurs',
	'sound', 'sounds', 'voice', 'voices', 'echo', 'echoes', 'crowd', 'people', 'group', 'figure', 'figures',
	'moment', 'instant', 'pause', 'breath', 'gaze', 'eyes', 'attention', 'hand', 'hands', 'footsteps',
]);

const EXPLICIT_PROP_OR_STRUCTURE_NOUNS = new Set([
	'lamp', 'lantern', 'torch', 'candle', 'chandelier', 'brazier',
	'chair', 'table', 'desk', 'bench', 'stool', 'throne', 'bed', 'couch',
	'pedestal', 'pillar', 'column', 'statue', 'altar', 'shrine', 'fountain', 'well',
	'balcony', 'railing', 'staircase', 'stairs', 'ladder', 'bridge', 'archway', 'gate', 'door', 'window',
	'moss', 'vine', 'vines', 'tree', 'trees', 'bush', 'hedge', 'flower', 'flowers',
	'beam', 'rafter', 'chandelier', 'tapestry', 'rug', 'carpet', 'curtain', 'banner',
	'docks', 'dock', 'pier', 'wharf', 'boat', 'ship', 'cart', 'wagon', 'carriage',
	'chest', 'crate', 'barrel', 'box', 'sack', 'cage', 'rack', 'shelf', 'bookshelf',
	'sword', 'blade', 'dagger', 'spear', 'shield', 'bow', 'staff', 'wand', 'orb', 'scroll', 'book', 'tome', 'key', 'coin', 'bottle', 'cup', 'goblet',
]);

function isNegatedClaimPrefix(text: string, matchIndex: number): boolean {
	const prefix = text.slice(Math.max(0, matchIndex - 48), matchIndex);
	return /\b(?:no|not|never|neither|without|lacks?|missing|absent|free\s+of|devoid\s+of)\s+(?:any\s+)?(?:sign\s+of\s+|trace\s+of\s+)?(?:a\s+|an\s+|the\s+|any\s+)?$/i.test(prefix);
}

function isBaselineNonPropClaim(claim: string): boolean {
	const tokens = normalize(claim).split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return true;
	if (tokens.some((token) => EXPLICIT_PROP_OR_STRUCTURE_NOUNS.has(token))) return false;
	const headNoun = tokens[tokens.length - 1];
	return ABSTRACT_OR_BASELINE_SCENE_NOUNS.has(headNoun);
}

function extractConcreteObjectClaims(narration: string): string[] {
	const claims: string[] = [];
	const patterns = [
		/\b(?:a|an|the)\s+([a-z][a-z'-]{2,}(?:\s+[a-z][a-z'-]{2,}){0,2})\s+(?:stands?|rests?|lies?|sits?|leans?|hangs?|glows?|flickers?|waits?|is\s+(?:nearby|present|there))\b/gi,
		/\b(?:you|your)\s+(?:gaze|eyes|attention|hands?)\s+(?:settles?|locks?|reaches?|grabs?|finds?)\s+(?:on|for)\s+(?:a|an|the)\s+([a-z][a-z'-]{2,}(?:\s+[a-z][a-z'-]{2,}){0,2})\b/gi,
	];
	for (const pattern of patterns) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(narration)) !== null) {
			if (isNegatedClaimPrefix(narration, match.index)) continue;
			let claim = normalize(match[1]).replace(/\b(?:nearby|there|present)\b/g, '').trim();
			claim = claim.replace(/\s+(?:where|when|which|that|who|whose|whom|without|standing|sitting|leaning|resting|lying|hanging|with|into|onto|over|under|above|below|beside|behind|near|before|after|while|during|because|since|unless|until|although|though|if|and|or|but|to|from|for)\b.*$/gi, '').trim();
			if (!claim || isBaselineNonPropClaim(claim)) continue;
			if (!claims.includes(claim)) claims.push(claim);
		}
	}
	return claims;
}

function extractEnvironmentalClaims(narration: string): string[] {
	const claims: string[] = [];
	const patterns = [
		/\b(?:on|onto|inside|within|beneath|above|beside|behind|near)\s+(?:a|an|the)\s+([a-z][a-z'-]{2,}(?:\s+[a-z][a-z'-]{2,}){0,2})\b/gi,
		/\b(?:a|an|the)\s+([a-z][a-z'-]{2,}(?:\s+[a-z][a-z'-]{2,}){0,2})\s+(?:rises?|stands?|stretches?|spans?|clings?|grows?|hangs?|extends?|runs?|leads?)\b/gi,
	];
	for (const pattern of patterns) {
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(narration)) !== null) {
			if (isNegatedClaimPrefix(narration, match.index)) continue;
			let claim = normalize(match[1]).trim();
			claim = claim.replace(/\s+(?:where|when|which|that|who|whose|whom|without|standing|sitting|leaning|resting|lying|hanging|with|into|onto|over|under|above|below|beside|behind|near|before|after|while|during|because|since|unless|until|although|though|if|and|or|but|to|from|for)\b.*$/gi, '').trim();
			if (!claim || isBaselineNonPropClaim(claim)) continue;
			if (!claims.includes(claim)) claims.push(claim);
		}
	}
	return claims;
}

function isConcreteClaimSupported(claim: string, situation: CurrentSituation): boolean {
	const normalizedClaim = normalize(claim);
	if (isBaselineNonPropClaim(normalizedClaim)) return true;

	const visibleObjects = (situation.sceneObjects || [])
		.filter((object) => object.visibleToPlayer)
		.map((object) => normalize(object.name));

	// Discrete physical-object claims must resolve to an explicit canonical
	// scene object. We deliberately do not use location prose, ambient prose,
	// lore, or arbitrary token overlap as object existence evidence.
	if (visibleObjects.some((name) => name === normalizedClaim || normalizedClaim.includes(name) || name.includes(normalizedClaim))) {
		return true;
	}

	// Character/entity claims are separately authoritative through the visible
	// entity projection.
	const visibleEntities = situation.nearbyEntities
		.filter((entity) => entity.visibleToPlayer)
		.flatMap((entity) => [normalize(entity.name), normalize(entity.displayName || '')])
		.filter(Boolean);
	if (visibleEntities.some((name) => name === normalizedClaim || normalizedClaim.includes(name) || name.includes(normalizedClaim))) {
		return true;
	}

	const structures = [
		...(situation.sceneEvidence?.structures || []),
		...(situation.sceneEvidence?.environment?.features || []),
	].map(normalize);
	if (structures.some((name) => name === normalizedClaim || normalizedClaim.includes(name) || name.includes(normalizedClaim))) {
		return true;
	}

	// Water established by the canonical environment is valid evidence for
	// describing the channel/pond/stream the world actually declares.
	const water = situation.sceneEvidence?.environment?.water;
	if (water?.present) {
		const waterTerms = ['water', 'puddle', 'stream', 'channel', 'drain', 'drainage', 'runoff', 'pond', 'pool'];
		if (waterTerms.some((term) => normalizedClaim.includes(term))) return true;
	}

	// A location's own canonical name, visible events, active dialogue, and exact authored
	// environmental phrases are valid evidence for broad environmental claims.
	const authoredEnvironment = [
		situation.location.name,
		situation.location.description,
		situation.location.ambientSensory,
		...(situation.sceneEvidence?.sensory || []),
		...(situation.visibleEvents || []).map((event) => event.summary),
		situation.activeDialogue?.text || '',
	].map(normalize).filter(Boolean);
	if (authoredEnvironment.some((source) =>
		source === normalizedClaim ||
		source.includes(normalizedClaim) ||
		normalizedClaim.includes(source) && source.length >= 8
	)) {
		return true;
	}

	// Word/stem overlap support for multi-word claims against authored environment
	const claimWords = normalizedClaim.split(/\s+/).filter((w) => w.length >= 3);
	if (claimWords.length > 0) {
		for (const source of authoredEnvironment) {
			const sourceWords = source.split(/\s+/).filter((w) => w.length >= 3);
			const matchedAll = claimWords.every((word) =>
				sourceWords.some((sw) => sw === word || sw.startsWith(word) || word.startsWith(sw) || sw.replace(/s$/, '') === word.replace(/s$/, ''))
			);
			if (matchedAll) return true;
		}
	}

	return false;
}

function hasMajorAgencyTakeover(narration: string): boolean {
	return containsAny(
		narration,
		/\b(?:you|the protagonist|your character)\s+(?:decide|decides|decided|choose|chooses|chose|agree|agrees|agreed|follow|follows|followed|leave|leaves|left|attack|attacks|attacked|kill|kills|killed)\b/i,
	);
}

function isConditionDepictedInProse(narrationLower: string, rawCondition: string): boolean {
	const cond = normalize(rawCondition).replace(/[_-]+/g, ' ').trim();
	if (!cond) return true;
	if (narrationLower.includes(cond)) return true;
	const words = cond.split(/\s+/).filter((w) => w.length >= 4);
	if (words.some((w) => narrationLower.includes(w) || narrationLower.includes(w.replace(/(?:ed|ing|en|s)$/, '')))) {
		return true;
	}
	if (/\bprone\b/.test(cond)) {
		return /\b(?:prone|knock(?:s|ed)?\s+(?:down|off\s+(?:his|her|their|its|your)\s+feet)|falls?\s+(?:to|onto)\s+the\s+(?:ground|floor|stone|earth|mud|cobbles|paving)|sprawl(?:s|ed|ing)?|toppl(?:es|ed)?|collaps(?:es|ed)?|flat\s+on|on\s+the\s+(?:ground|floor)|off\s+balance|hits?\s+the\s+(?:ground|floor)|swept\s+off)\b/i.test(narrationLower);
	}
	if (/\b(?:restrained|grappled|entangled|bound|pinned)\b/.test(cond)) {
		return /\b(?:restrain(?:s|ed)?|grappl(?:es|ed)?|bind(?:s|ing)?|bound|entangl(?:es|ed)?|pin(?:s|ned)?|hold(?:s|ing)?\s+fast|trapp?(?:ed|ing)|snar(?:es|ed)?|immobiliz(?:es|ed)?|clasp(?:s|ed)?|seiz(?:es|ed)?|grip(?:s|ped)?|lock(?:s|ed)?\s+in\s+place|coils?\s+around|wraps?\s+around)\b/i.test(narrationLower);
	}
	if (/\b(?:stunned|dazed|incapacitated)\b/.test(cond)) {
		return /\b(?:stun(?:s|ned)?|daz(?:es|ed)?|stagger(?:s|ed)?|reel(?:s|ing|ed)?|disorient(?:s|ed)?|incapacitat(?:es|ed)?|senseless|unable\s+to\s+act|shakes?\s+(?:his|her|their|its)\s+head)\b/i.test(narrationLower);
	}
	if (/\b(?:paralyzed|frozen|petrified)\b/.test(cond)) {
		return /\b(?:paralyz(?:es|ed)?|freez(?:es|ing)|froze|frozen|petrif(?:ies|ied)|rigid|immobile|locked\s+stiff|unable\s+to\s+move|statue)\b/i.test(narrationLower);
	}
	if (/\bblinded\b/.test(cond)) {
		return /\b(?:blind(?:s|ed|ing)?|sightless|vision\s+(?:blurs?|darkens?|fails?|goes\s+dark)|cannot\s+see|eyes?\s+(?:burn|cloud|darken|water|shut))\b/i.test(narrationLower);
	}
	if (/\b(?:frightened|shaken|terrified|feared)\b/.test(cond)) {
		return /\b(?:frighten(?:s|ed)?|terrif(?:ies|ied)|panic(?:s|ked)?|fear|dread|cower(?:s|ed)?|recoil(?:s|ed)?|shaken|trembl(?:es|ing|ed)|flinch(?:es|ed)?|shrink(?:s|ing)?\s+back)\b/i.test(narrationLower);
	}
	if (/\b(?:poisoned|venom|toxic)\b/.test(cond)) {
		return /\b(?:poison(?:s|ed)?|venom(?:ous)?|toxin|sicken(?:s|ed|ing)?|nausea|cough(?:s|ing)?|pale|weaken(?:s|ed)?|ill)\b/i.test(narrationLower);
	}
	if (/\b(?:burning|ignited|ablaze|scorched)\b/.test(cond)) {
		return /\b(?:burn(?:s|ed|ing)?|ignit(?:es|ed)?|flames?|fire|scorch(?:es|ed)?|sear(?:s|ed|ing)?|smolder(?:s|ing)?|ablaze|char(?:s|red)?)\b/i.test(narrationLower);
	}
	if (/\bbleeding\b/.test(cond)) {
		return /\b(?:bleed(?:s|ing)?|blood|hemorrhag(?:es|ing)?|gash|wound\s+opens?|crimson)\b/i.test(narrationLower);
	}
	return /\b(?:afflict(?:s|ed)?|succumb(?:s|ed)?|overcome|wrack(?:s|ed)?|stricken|status|condition)\b/i.test(narrationLower);
}

function findMissingVisibleConsequences(narration: string, actionResolution?: ActionResolution): string[] {
	if (!actionResolution) return [];
	const lower = normalize(narration);
	const missing: string[] = [];
	const stateChanges = Array.isArray(actionResolution.canonicalStateChanges) ? actionResolution.canonicalStateChanges : [];
	const visibleList = Array.isArray(actionResolution.playerVisibleConsequences) ? actionResolution.playerVisibleConsequences : [];

	// 1. Applied conditions
	const appliedConditions = new Set<string>();
	for (const change of stateChanges) {
		if (change.kind === 'COMBAT_CONDITION_APPLIED' || change.kind === 'CONDITION_APPLIED') {
			const val = change.value as any;
			if (typeof val?.condition === 'string' && val.condition.trim()) {
				appliedConditions.add(val.condition.trim());
			} else if (Array.isArray(val?.conditions)) {
				for (const c of val.conditions) if (typeof c === 'string' && c.trim()) appliedConditions.add(c.trim());
			}
		}
	}
	for (const entry of visibleList) {
		const m = String(entry || '').match(/\bapplied conditions?:\s*([^.]+)/i);
		if (m?.[1]) {
			for (const c of m[1].split(',')) {
				if (c.trim()) appliedConditions.add(c.trim());
			}
		}
	}
	for (const cond of appliedConditions) {
		if (!isConditionDepictedInProse(lower, cond)) {
			missing.push(`Depict the applied condition (${cond}) in natural scene language.`);
		}
	}

	// 2. Removed conditions
	const removedConditions = new Set<string>();
	for (const change of stateChanges) {
		if (change.kind === 'COMBAT_CONDITION_REMOVED' || change.kind === 'CONDITION_REMOVED') {
			const val = change.value as any;
			if (typeof val?.condition === 'string' && val.condition.trim()) {
				removedConditions.add(val.condition.trim());
			} else if (Array.isArray(val?.conditions)) {
				for (const c of val.conditions) if (typeof c === 'string' && c.trim()) removedConditions.add(c.trim());
			}
		}
	}
	for (const entry of visibleList) {
		const m = String(entry || '').match(/\bremoved conditions?:\s*([^.]+)/i);
		if (m?.[1]) {
			for (const c of m[1].split(',')) {
				if (c.trim()) removedConditions.add(c.trim());
			}
		}
	}
	for (const cond of removedConditions) {
		const hasRemovedCue =
			isConditionDepictedInProse(lower, cond) ||
			/\b(?:clear(?:s|ed)?|fade(?:s|d)?|lift(?:s|ed)?|break(?:s|ing)?\s+free|shak(?:es|ing|en)\s+off|recover(?:s|ed)?|subside(?:s|d)?|end(?:s|ed)?|reliev(?:es|ed)?|freed?|unfettered|stead(?:ies|ied)|regain(?:s|ed)?)\b/i.test(lower);
		if (!hasRemovedCue) {
			missing.push(`Depict the removal or relief of the condition (${cond}) in natural language.`);
		}
	}

	// 3. Forced movement and obstacle collision
	let hasForcedMovement = false;
	let hasCollision = false;
	let obstacleName: string | undefined;
	for (const change of stateChanges) {
		if (change.kind === 'COMBAT_FORCED_MOVEMENT') {
			const val = change.value as any;
			if (val?.moved) hasForcedMovement = true;
			if (val?.collided) {
				hasCollision = true;
				if (typeof val?.obstacleName === 'string' && val.obstacleName.trim()) obstacleName = val.obstacleName.trim();
			}
		}
		if (change.kind === 'COMBAT_COLLISION_DAMAGE') {
			hasCollision = true;
			const val = change.value as any;
			if (typeof val?.obstacleName === 'string' && val.obstacleName.trim()) obstacleName = val.obstacleName.trim();
		}
	}
	for (const entry of visibleList) {
		if (/\bforced to move\b|\bforced movement\b/i.test(String(entry || ''))) hasForcedMovement = true;
		if (/\btarget collided\b|\bcollision damage\b/i.test(String(entry || ''))) hasCollision = true;
	}
	if (hasForcedMovement) {
		const forcedMoveDepicted = /\b(?:push(?:es|ed|ing)?|pull(?:s|ed|ing)?|shov(?:es|ed|ing)?|hurl(?:s|ed|ing)?|knock(?:s|ed|ing)?\s+(?:him|her|them|it|you\s+)?(?:back|backward|backwards|away|across|into|against)|driv(?:e|es|en|ing)\s+(?:him|her|them|it|you\s+)?(?:back|backward|backwards|into|against)|drove|slam(?:s|med|ming)?|send(?:s|ing)?|sent\s+(?:flying|back|backward|across|into|against|sprawling)|throw(?:n|s|ing)?|threw|flung|fling(?:s|ing)?|blast(?:s|ed|ing)?\s+(?:him|her|them|it|you\s+)?(?:back|backward|away|across|into|against)|forc(?:es|ed|ing)?\s+(?:him|her|them|it|you\s+)?(?:back|backward|to\s+move|across|into|against)|slide(?:s|d)?|sliding|slid|skid(?:s|ded|ding)?|stumble(?:s|d)?\s+(?:back|backward)|stumbling\s+(?:back|backward)|reel(?:s|ed|ing)?\s+(?:back|backward)|drag(?:s|ged|ging)?|yank(?:s|ed|ing)?|displac(?:es|ed|ing)?|telep(?:ort|orts|orted|orting)|swept\s+(?:back|away)|driven\s+(?:back|backward)|backward|backwards)\b/i.test(lower);
		if (!forcedMoveDepicted) {
			missing.push('Depict the forced movement or displacement of the target in natural language.');
		}
	}
	if (hasCollision) {
		const obstacleToken = obstacleName ? normalize(obstacleName).split(/\s+/).find((w) => w.length >= 3) : undefined;
		const collisionDepicted =
			(obstacleToken ? lower.includes(obstacleToken) : false) ||
			/\b(?:collid(?:es|ed|ing)?|collision|crash(?:es|ed|ing)?|slam(?:s|med|ming)?\s+(?:into|against)|smash(?:es|ed|ing)?\s+(?:into|against)|strik(?:e|es|ing)\s+(?:the|a|an)|struck\s+(?:the|a|an)|hit(?:s|ting)?\s+(?:the|a|an)\s+(?:[a-z]+\s+)?(?:wall|pillar|column|tree|rock|stone|barrier|obstacle|crate|table)|impact(?:s|ed|ing)?|(?:into|against)\s+(?:the|a|an)\s+(?:[a-z]+\s+)?(?:wall|pillar|column|tree|rock|stone|barrier|obstacle|crate|table|arch|railing))\b/i.test(lower);
		if (!collisionDepicted) {
			missing.push(`Depict the collision${obstacleName ? ' with ' + obstacleName : ''} in natural language.`);
		}
	}

	// 4. Concentration break
	let hasConcentrationBreak = false;
	for (const change of stateChanges) {
		if (change.kind === 'COMBAT_CONCENTRATION') {
			const val = change.value as any;
			if (val?.brokenPreviousSpellName || val?.targetBrokenSpellName) {
				hasConcentrationBreak = true;
			}
		}
	}
	for (const entry of visibleList) {
		if (/\blost concentration on\b|\bprevious concentration on .* ended\b/i.test(String(entry || ''))) {
			hasConcentrationBreak = true;
		}
	}
	if (hasConcentrationBreak) {
		const concentrationDepicted = /\b(?:concentration|focus|spell|weave|hold|ward|aura|channel(?:ing)?|falter(?:s|ed)?|shatter(?:s|ed)?|break(?:s)?|broke|broken|unravel(?:s|ed)?|dissipat(?:es|ed)?|fade(?:s|d)?|slip(?:s|ped)?|lost|loses|drop(?:s|ped)?|end(?:s|ed)?)\b/i.test(lower);
		if (!concentrationDepicted) {
			missing.push('Depict the broken or ended spell concentration in natural language.');
		}
	}

	// 5. Combat or hazard damage (when explicitly resolved as a state change alongside other effects or in combat/hazard resolution)
	let hasResolvedDamage = false;
	for (const change of stateChanges) {
		if (change.kind === 'COMBAT_DAMAGE' || change.kind === 'DAMAGE') {
			const val = change.value as any;
			if (Number(val?.damage || val?.amount || 0) > 0) hasResolvedDamage = true;
		}
		if (change.kind === 'CONDITION') {
			const val = change.value as any;
			if (typeof val?.healthBefore === 'number' && typeof val?.healthCurrent === 'number' && val.healthCurrent < val.healthBefore) {
				hasResolvedDamage = true;
			}
		}
	}
	if (hasResolvedDamage) {
		const damageDepicted = /\b(?:hit(?:s|ting)?|strik(?:e|es|ing)|struck|slash(?:es|ed|ing)?|pierc(?:e|es|ed|ing)|stab(?:s|bed|bing)?|cut(?:s|ting)?|wound(?:s|ed|ing)?|injur(?:e|es|ed|ing|y)|hurt(?:s|ing)?|harm(?:s|ed|ing)?|burn(?:s|ed|t|ing)?|scorch(?:es|ed|ing)?|sear(?:s|ed|ing)?|freez(?:e|es|ing)|froze|frost|shock(?:s|ed|ing)?|jolt(?:s|ed|ing)?|blast(?:s|ed|ing)?|smite(?:s)?|smote|crush(?:es|ed|ing)?|bruis(?:e|es|ed|ing)|batter(?:s|ed|ing)?|dent(?:s|ed|ing)?|blood|bleed(?:s|ing)?|pain|ache(?:s|d|ing)?|winc(?:e|es|ed|ing)|flinch(?:es|ed|ing)?|recoil(?:s|ed|ing)?|stagger(?:s|ed|ing)?|reel(?:s|ed|ing)?|impact(?:s|ed|ing)?|blow|force|damage(?:s|d|ing)?|char(?:s|red|ring)?|crack(?:s|ed|ing)?|shatter(?:s|ed|ing)?|tear(?:s|ing)?|tore|ripp?(?:ed|s|ing)?|slam(?:s|med|ming)?|knock(?:s|ed|ing)?|hurl(?:s|ed|ing)?|fall(?:s|ing)?|fell|land(?:s|ed|ing)?\s+hard|strain|toll|drain(?:s|ed|ing)?|suffer(?:s|ed|ing)?|bite(?:s|ing)?|bit|claw(?:s|ed|ing)?|smash(?:es|ed|ing)?)\b/i.test(lower);
		if (!damageDepicted) {
			missing.push('Depict the physical impact or harm of the resolved damage in natural language.');
		}
	}

	// 6. Healing / restoration
	let hasResolvedHealing = false;
	for (const change of stateChanges) {
		if (change.kind === 'COMBAT_HEALING' || (change.kind === 'HEALTH' && Number((change.value as any)?.restored || 0) > 0)) {
			hasResolvedHealing = true;
		}
	}
	if (hasResolvedHealing) {
		const healingDepicted = /\b(?:heal(?:s|ed|ing)?|mend(?:s|ed|ing)?|restor(?:es|ed|ing)?|recover(?:s|ed|y)?|relief|reliev(?:es|ed)?|sooth(?:es|ed|ing)?|clos(?:es|ed|ing)|knit(?:s|ted|ting)?|vitality|strength|stead(?:ies|ied)|reviv(?:es|ed)?|warmth|ease(?:s|d)?)\b/i.test(lower);
		if (!healingDepicted) {
			missing.push('Depict the visible healing or physical recovery in natural language.');
		}
	}

	// 7. Target defeat
	const hasDefeat = stateChanges.some((c) => c.kind === 'COMBAT_DEFEAT' || (c.kind === 'CONDITION' && Boolean((c.value as any)?.dead)));
	if (hasDefeat) {
		const defeatDepicted = /\b(?:defeat(?:s|ed)?|fall(?:s)?|fell|fallen|collaps(?:es|ed)?|drop(?:s|ped)?|crumpl(?:es|ed)?|slump(?:s|ed)?|down(?:ed)?|still|motionless|dead|dying|lifeless|unconscious|overcome|slain)\b/i.test(lower);
		if (!defeatDepicted) {
			missing.push('Depict the target collapse or defeat in natural language.');
		}
	}

	return missing;
}

export class SemanticNarrativeReview {
	public static review(params: {
		intent: PlayerIntent;
		situation: CurrentSituation;
		plan: EphemeralNarrativePlan;
		turnPackage: StructuredTurnPackage;
		narrativeQualityContract?: NarrativeQualityContract;
		actionResolution?: ActionResolution;
	}): NarrativeReview {
		const { intent, situation, plan, turnPackage, actionResolution } = params;
		const narration = turnPackage.narrative.join(' ').trim();
		const violations: NarrativeViolation[] = [];
		const missingRequirements: string[] = [];
		const unsupportedClaims: string[] = [];
		const qualityContract = params.narrativeQualityContract || NarrativeQualityContractEngine.resolve(intent);
		const qualityValidation = NarrativeQualityContractEngine.validate(narration, qualityContract);

		if (!narration) {
			violations.push({ code: 'SEMANTIC_MISMATCH', message: 'Narrative output is empty.', severity: 'HIGH' });
			return {
				decision: 'REJECT',
				violations,
				missingRequirements: ['A non-empty player-facing narrative is required.'],
				unsupportedClaims,
				playerAgencyViolation: false,
				semanticMismatch: true,
				source: 'DETERMINISTIC',
				confidence: 1,
			};
		}

		const lower = normalize(narration);

		for (const reason of qualityValidation.reasons) {
			if (!violations.some((violation) => violation.message === reason)) {
				violations.push({ code: 'SEMANTIC_MISMATCH', message: 'N1 narrative quality contract: ' + reason, severity: qualityContract.controls.enforcement === 'REJECT' ? 'HIGH' : 'MEDIUM' });
			}
		}

		if (intent.speechIntent === false && intent.observationIntent) {
			const sentences = lower.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
			const hasUnauthorizedSpeech = sentences.some((sentence) =>
				/\b(?:you|the protagonist|your character)\b/i.test(sentence) &&
				/\b(?:you|the protagonist|your character)\s+(?:(?!\b(?:them|him|her|they|someone|someone else|one|enforcer|guard|target|npc)\b)[a-z'-]+\s+){0,6}(?:ask|asks|asked|say|says|said|speak|speaks|spoke|tell|tells|told|reply|replies|replied|shout|shouts|shouted|call out|calls out)\b/i.test(sentence)
			);
			if (hasUnauthorizedSpeech) {
				violations.push({ code: 'UNAUTHORIZED_SPEECH', message: 'Narration converted a non-speaking observation/listening action into protagonist speech.', severity: 'HIGH' });
			}
		}

		if (intent.movementIntent && !containsAny(lower, /\b(?:move|moves|moved|approach|approaches|approached|step|steps|stepped|walk|walks|walked|head|heads|headed|travel|travels|traveled|enter|enters|entered|leave|leaves|left|closer|toward|towards|nearer|proceed|continued|continue|journey|way toward|way towards)\b/i)) {
			missingRequirements.push('The immediate physical movement/position change should be represented.');
			violations.push({ code: 'MISSING_MOVEMENT', message: 'The player requested movement, but the narration does not depict a corresponding movement or position change.', severity: 'MEDIUM' });
		}
		if (intent.movementIntent && intent.locationTarget?.name && !lower.includes(normalize(intent.locationTarget.name))) {
			missingRequirements.push('Keep the intended destination visible in the movement narration without claiming arrival unless canonical spatial state confirms it.');
			violations.push({ code: 'MISSING_MOVEMENT', message: 'The narration omits the player’s established movement destination: ' + intent.locationTarget.name + '.', severity: 'MEDIUM' });
		}

		if (intent.observationIntent && !containsAny(lower, /\b(?:hear|hears|heard|hearing|listen|listens|listened|listening|overhear|overhears|overheard|overhearing|notice|notices|noticed|noticing|observe|observes|observed|observing|watch|watches|watched|watching|see|sees|saw|seeing|look|looks|looked|looking|spot|spots|spotted|spotting|inspect|inspects|inspected|inspecting|examine|examines|examined|examining|sense|senses|sensed|sensing|detect|detects|detected|detecting|attend|attends|attended|attending|attention|attentive|focus|focuses|focused|focusing|scan|scans|scanned|scanning|study|studies|studied|studying|survey|surveys|surveyed|surveying|peer|peers|peered|peering|glance|glances|glanced|glancing|gaze|gazes|gazed|gazing|stare|stares|stared|staring|search|searches|searched|searching|check|checks|checked|checking|read|reads|reading|find|finds|found|finding|discover|discovers|discovered|discovering|reveal|reveals|revealed|revealing|perceive|perceives|perceived|perceiving|discern|discerns|discerned|discerning|make out|makes out|made out|take in|takes in|took in|catch sight|catches sight|caught sight|catch a glimpse|caught a glimpse|ear|ears|eye|eyes|view|sight|conversation|whisper|whispers|whispered|whispering|murmur|murmurs|murmured|murmuring|sound|sounds|voice|voices|rumou?r|rumou?rs|hearsay|silence|silent|quiet|stillness|echo|echoes|footsteps|visible|audible|unclear|indistinct|faint|distant|detail|details|trace|traces|clue|clues|sign|signs|nothing new|no sign|no one|nobody|empty|unoccupied)\b/i)) {
			missingRequirements.push('The requested observation should produce an observable result or limitation.');
			violations.push({ code: 'MISSING_OBSERVATION', message: 'The player requested observation/listening, but no observable result or grounded limitation was narrated.', severity: 'MEDIUM' });
		}

		if (intent.informationGoal && !intent.speechIntent) {
			const researchAnchors = [
				...situation.visibleEvents.map((event) => event.summary),
				...situation.relevantLore.map((fact) => [fact.predicate, fact.objectValue].join(' ')),
				...situation.openThreads.map((thread) => [thread.title, thread.summary].filter(Boolean).join(' ')),
				situation.plot.summary,
				situation.activeDialogue?.text || '',
				...plan.informationToReveal.map((reveal) => reveal.topic),
			].join(' ');
			if (overlap(narration, researchAnchors) < 0.08 && !/\b(?:nothing|no one|nobody|unclear|uncertain|unknown|unverified|could not|couldn't|refused|silent|silence)\b/i.test(lower)) {
				missingRequirements.push('The information-seeking action should resolve against the established scene lead or clearly state that no reliable information was obtained.');
				violations.push({ code: 'MISSING_INFORMATION', message: 'The narration did not visibly connect the information-seeking action to the current researched scene.', severity: 'MEDIUM' });
			}
		}

		// Observation turns have an additional grounding requirement: concrete
		// physical props must be supported by the canonical player-visible scene.
		// This prevents a narrator from inventing a lamp/chair/weapon and then
		// treating that invention as world fact on the next turn.
		if (intent.observationIntent) {
			const unsupportedObjects = extractConcreteObjectClaims(narration)
				.filter((claim) => !isConcreteClaimSupported(claim, situation));
			const unsupportedEnvironment = extractEnvironmentalClaims(narration)
				.filter((claim) => !isConcreteClaimSupported(claim, situation));
			const unsupportedConcreteClaims = Array.from(new Set([...unsupportedObjects, ...unsupportedEnvironment])).slice(0, 8);
			if (unsupportedConcreteClaims.length > 0) {
				unsupportedClaims.push(...unsupportedConcreteClaims);
				violations.push({
					code: 'UNSUPPORTED_CLAIM',
					message: 'Observation narration introduced concrete physical/environmental details not supported by canonical scene evidence: ' + unsupportedConcreteClaims.join(', ') + '.',
					severity: 'HIGH',
				});
			}
		}

		const forbidden = buildForbiddenKnowledgeSet(situation);
		const likelyForbidden = forbidden.filter((value) => value && lower.includes(value));
		if (likelyForbidden.length > 0) {
			unsupportedClaims.push(...likelyForbidden.slice(0, 6));
			violations.push({ code: 'UNSUPPORTED_CLAIM', message: 'Narration appears to expose canonical facts outside the viewer knowledge boundary.', severity: 'HIGH' });
		}

		if (hasMajorAgencyTakeover(narration) && !/\b(?:you must|you cannot|you can|you may|you are able)\b/i.test(lower)) {
			violations.push({ code: 'PLAYER_AGENCY', message: 'Narration appears to decide a consequential player choice rather than present the consequence and leave the decision open.', severity: 'MEDIUM' });
		}

		const proposedStateKinds = new Set((turnPackage.stateChanges || []).map((change) => normalize(change.kind)));
		if (proposedStateKinds.has('location') && !intent.movementIntent) {
			violations.push({ code: 'UNSUPPORTED_STATE_PROPOSAL', message: 'The generated package proposes a location mutation even though the player intent contains no movement.', severity: 'HIGH' });
		}

		for (const forbiddenAssumption of plan.forbiddenAssumptions) {
			if (forbiddenAssumption && lower.includes(normalize(forbiddenAssumption))) {
				violations.push({ code: 'UNSUPPORTED_CLAIM', message: 'Narration directly repeats a forbidden assumption from the one-turn narrative plan.', severity: 'HIGH' });
			}
		}

		const missingVisibleConsequences = findMissingVisibleConsequences(narration, actionResolution);
		if (missingVisibleConsequences.length > 0) {
			missingRequirements.push(...missingVisibleConsequences);
			violations.push({
				code: 'MISSING_VISIBLE_CONSEQUENCE',
				message: 'Narration omitted resolved player-visible consequences: ' + missingVisibleConsequences.join(' '),
				severity: 'MEDIUM',
			});
		}

		const high = violations.filter((violation) => violation.severity === 'HIGH').length;
		const medium = violations.filter((violation) => violation.severity === 'MEDIUM').length;
		const semanticMismatch = violations.some((violation) =>
			['SEMANTIC_MISMATCH', 'MISSING_MOVEMENT', 'MISSING_OBSERVATION', 'MISSING_INFORMATION', 'MISSING_VISIBLE_CONSEQUENCE', 'UNAUTHORIZED_SPEECH'].includes(violation.code)
		);
		const playerAgencyViolation = violations.some((violation) => violation.code === 'PLAYER_AGENCY');

		return {
			decision: high > 0 ? 'REJECT' : (medium > 0 || missingRequirements.length > 0 ? 'REWRITE' : 'ACCEPT'),
			violations,
			missingRequirements,
			unsupportedClaims,
			playerAgencyViolation,
			semanticMismatch,
			source: 'DETERMINISTIC',
			confidence: high > 0 ? 0.98 : medium > 0 ? 0.9 : 0.82,
		};
	}

	public static buildRewritePrompt(params: {
		intent: PlayerIntent;
		situation: CurrentSituation;
		plan: EphemeralNarrativePlan;
		turnPackage: StructuredTurnPackage;
		review: NarrativeReview;
		actionResolution?: ActionResolution;
	}): string {
		return [
			'Rewrite the following Dreamville narrative turn once.',
			'Preserve canonical facts and the player agency boundary.',
			'Fix only the listed semantic review violations; do not introduce new facts or a new plot direction.',
			'Player intent: ' + JSON.stringify(params.intent),
			'Narrative plan: ' + JSON.stringify(params.plan),
			...(params.actionResolution
				? ['Canonical action resolution (depict all playerVisibleConsequences in natural fiction without raw engine labels): ' + JSON.stringify({
						actualEffect: params.actionResolution.actualEffect,
						physicalConsequences: params.actionResolution.physicalConsequences,
						playerVisibleConsequences: params.actionResolution.playerVisibleConsequences,
					})]
				: []),
			'Review: ' + JSON.stringify(params.review),
			'Current situation: ' + JSON.stringify({
				location: params.situation.location,
				nearbyEntities: params.situation.nearbyEntities.filter((entity) => entity.visibleToPlayer).slice(0, 8).map((entity) => ({
					...entity,
					name: entity.displayName || entity.name,
				})),
				visibleEvents: params.situation.visibleEvents.slice(0, 6),
				activeDialogue: params.situation.activeDialogue,
			}),
			'Original structured turn: ' + JSON.stringify(params.turnPackage),
			'Return the complete structured turn package as JSON only with narrative, dialogue, events, stateChanges, memoryCandidates, audioCues, and visualCues.',
		].join('\n');
	}
}
