import type { CurrentSituation } from './currentSituation';

export type PlayerIntentInteractionMode =
	| 'PASSIVE_OBSERVATION'
	| 'DIRECT_INTERACTION'
	| 'DIALOGUE'
	| 'MOVEMENT'
	| 'COMBAT'
	| 'MANIPULATION'
	| 'INFORMATION_SEEKING'
	| 'EXPLORATION'
	| 'OTHER';

export interface IntentEntityReference {
	id?: string;
	name: string;
	kind?: string;
	source: 'EXPLICIT' | 'IMPLIED';
}

export interface IntentLocationReference {
	id?: string;
	name: string;
	source: 'EXPLICIT' | 'IMPLIED';
}

export interface PlayerIntent {
	action: string;
	goal?: string;
	target?: IntentEntityReference;
	locationTarget?: IntentLocationReference;
	interactionMode: PlayerIntentInteractionMode;
	speechIntent: boolean;
	movementIntent: boolean;
	observationIntent: boolean;
	informationGoal?: string;
	explicitTargets: IntentEntityReference[];
	impliedTargets: IntentEntityReference[];
	confidence: number;
	source: 'DETERMINISTIC' | 'AI' | 'HYBRID';
	originalText: string;
}

export interface PlayerIntentInterpretation {
	intent: PlayerIntent;
	modelId?: string;
	providerId?: string;
	fallbackReason?: string;
}

const MOVEMENT_PATTERN = /\b(?:move|walk|step|approach|go|head|travel|enter|leave|return|come|follow|run|sneak|creep|draw closer|move closer)\b/i;
const COMBAT_PATTERN = /\b(?:attack|strike|hit|shoot|fire|stab|slash|punch|kick|fight|cast at|defend|parry)\b/i;
const ITEM_USE_PATTERN = /\b(?:use|drink|eat|consume|activate|equip|wear|open|unlock|pick up|take|grasp|hold|decipher|translate)\b/i;
const DIALOGUE_PATTERN = /\b(?:ask|tell|say|speak|talk|reply|answer|question|inquire|consult|call out|shout|yell)\b/i;
const PASSIVE_OBSERVATION_PATTERN = /\b(?:listen|hear|overhear|eavesdrop|observe|watch|look|look around|look for|notice|study|scan|inspect)\b/i;
const INFORMATION_PATTERN = /\b(?:learn|find out|discover|gather information|information|rumou?r|gossip|what happened|who|why|where|when|how|hear about|listen for|overhear)\b/i;
const OOC_PATTERN = /^(?:ooc|out of character|system|meta)\s*[:>]/i;
const DICE_PATTERN = /\b(?:roll|rolls|rolled|check|skill check|ability check|saving throw|dice|d20|2d6|2d20)\b/i;

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

function clampConfidence(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function normalize(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ');
}

function unique<T>(values: T[], key: (value: T) => string): T[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		const k = key(value);
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

function explicitEntities(text: string, situation?: CurrentSituation): IntentEntityReference[] {
	if (!situation) return [];
	const normalized = normalize(text);
	return situation.nearbyEntities
		.filter((entity) => entity.kind !== 'PLAYER')
		.filter((entity) => {
			const name = normalize(entity.name);
			return name.length >= 3 && normalized.includes(name);
		})
		.map((entity) => ({
			id: entity.id,
			name: entity.name,
			kind: entity.kind,
			source: 'EXPLICIT' as const,
		}));
}

function explicitLocation(text: string, situation?: CurrentSituation): IntentLocationReference | undefined {
	if (!situation) return undefined;
	const normalized = normalize(text);
	const locations = [
		{ id: situation.location.id, name: situation.location.name },
		...situation.location.connectedLocations.map((location) => ({ id: location.id, name: location.name })),
	];
	const found = locations.find((location) => {
		const name = normalize(location.name);
		return name.length >= 3 && normalized.includes(name);
	});
	return found ? { ...found, source: 'EXPLICIT' } : undefined;
}

function extractedTarget(text: string): string | undefined {
	const quoted = text.match(/["“”']([^"“”']{2,80})["“”']/);
	if (quoted?.[1]) return clean(quoted[1]);
	const patterns = [
		/\b(?:about|regarding|concerning|on)\s+(?:the\s+)?(.+?)(?:[.!?]|$)/i,
		/\b(?:toward|towards|to|into|at)\s+(?:the\s+)?(.+?)(?:[.!?]|\s+(?:and|then|while|before|after)\b|$)/i,
		/\b(?:inspect|examine|study|read|decipher|translate|use|take|pick up|hold)\s+(?:the\s+)?(.+?)(?:[.!?]|\s+(?:and|then|while|before|after)\b|$)/i,
	];
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match?.[1]) return clean(match[1]).slice(0, 120);
	}
	return undefined;
}

function actionLabel(text: string, mode: PlayerIntentInteractionMode): string {
	if (/(listen|hear|overhear|eavesdrop)/i.test(text) && /(move|approach|closer|step|walk)/i.test(text)) return 'approach_and_listen';
	if (/(listen|hear|overhear|eavesdrop)/i.test(text)) return 'listen_and_observe';
	if (/(observe|watch|look around|scan)/i.test(text)) return 'observe';
	if (/(ask|question|inquire|consult)/i.test(text)) return 'ask';
	if (/(tell|say|speak|talk|reply|answer)/i.test(text)) return 'speak';
	if (/(shout|yell|call out)/i.test(text)) return 'shout';
	if (COMBAT_PATTERN.test(text)) return 'attack_or_defend';
	if (ITEM_USE_PATTERN.test(text)) return 'inspect_or_use';
	if (MOVEMENT_PATTERN.test(text)) return 'move';
	return mode === 'EXPLORATION' ? 'explore' : 'attempt_action';
}

export class PlayerIntentInterpreter {
	public static deterministic(text: string, situation?: CurrentSituation): PlayerIntent {
		const originalText = clean(text);
		if (!originalText) {
			return {
				action: 'no_action',
				interactionMode: 'OTHER',
				speechIntent: false,
				movementIntent: false,
				observationIntent: false,
				explicitTargets: [],
				impliedTargets: [],
				confidence: 0,
				source: 'DETERMINISTIC',
				originalText: '',
			};
		}

		const passive = PASSIVE_OBSERVATION_PATTERN.test(originalText);
		const dialogue = DIALOGUE_PATTERN.test(originalText);
		const movement = MOVEMENT_PATTERN.test(originalText);
		const combat = COMBAT_PATTERN.test(originalText);
		const information = INFORMATION_PATTERN.test(originalText);
		const manipulation = ITEM_USE_PATTERN.test(originalText);
		const ooc = OOC_PATTERN.test(originalText);
		const dice = DICE_PATTERN.test(originalText);

		let interactionMode: PlayerIntentInteractionMode = 'OTHER';
		if (ooc) interactionMode = 'OTHER';
		else if (combat) interactionMode = 'COMBAT';
		else if (dialogue) interactionMode = 'DIALOGUE';
		else if (passive && information) interactionMode = 'PASSIVE_OBSERVATION';
		else if (movement && passive) interactionMode = 'EXPLORATION';
		else if (movement) interactionMode = 'MOVEMENT';
		else if (manipulation) interactionMode = 'MANIPULATION';
		else if (information) interactionMode = 'INFORMATION_SEEKING';
		else if (passive) interactionMode = 'PASSIVE_OBSERVATION';

		const explicitTargets = unique(explicitEntities(originalText, situation), (target) => target.id || target.name.toLowerCase());
		const targetText = extractedTarget(originalText);
		const explicitLocationTarget = explicitLocation(originalText, situation);

		let goal: string | undefined;
		let informationGoal: string | undefined;
		if (information) {
			goal = 'gather_information';
			informationGoal = targetText || 'learn what can be discovered from the current scene';
		} else if (combat) goal = 'resolve_threat';
		else if (movement) goal = 'change_position_or_approach_target';
		else if (manipulation) goal = 'interact_with_or_examine_target';
		else if (dialogue) goal = 'communicate_with_target';
		else if (passive) goal = 'observe_current_scene';

		return {
			action: actionLabel(originalText, interactionMode),
			goal,
			target: explicitTargets[0],
			locationTarget: explicitLocationTarget,
			interactionMode,
			speechIntent: dialogue,
			movementIntent: movement,
			observationIntent: passive,
			informationGoal,
			explicitTargets,
			impliedTargets: [],
			confidence: information || combat || dialogue || movement || manipulation || passive ? 0.9 : dice ? 0.75 : 0.45,
			source: 'DETERMINISTIC',
			originalText,
		};
	}

	public static fromModel(raw: unknown, originalText: string, situation?: CurrentSituation): PlayerIntent | null {
		if (!raw || typeof raw !== 'object') return null;
		const value = raw as Record<string, unknown>;
		const fallback = this.deterministic(originalText, situation);
		const modes: PlayerIntentInteractionMode[] = [
			'PASSIVE_OBSERVATION', 'DIRECT_INTERACTION', 'DIALOGUE', 'MOVEMENT',
			'COMBAT', 'MANIPULATION', 'INFORMATION_SEEKING', 'EXPLORATION', 'OTHER',
		];
		const mode = clean(value.interactionMode).toUpperCase() as PlayerIntentInteractionMode;
		if (!modes.includes(mode)) return null;

		const mapTarget = (entry: unknown, source: 'EXPLICIT' | 'IMPLIED'): IntentEntityReference | null => {
			if (!entry || typeof entry !== 'object') return null;
			const item = entry as Record<string, unknown>;
			const name = clean(item.name);
			return name ? { id: clean(item.id) || undefined, name, kind: clean(item.kind) || undefined, source } : null;
		};

		const modelExplicitTargets = Array.isArray(value.explicitTargets)
			? value.explicitTargets.map((entry) => mapTarget(entry, 'EXPLICIT')).filter((entry): entry is IntentEntityReference => Boolean(entry))
			: [];
		const modelImpliedTargets = Array.isArray(value.impliedTargets)
			? value.impliedTargets.map((entry) => mapTarget(entry, 'IMPLIED')).filter((entry): entry is IntentEntityReference => Boolean(entry))
			: [];
		const textNormalized = normalize(originalText);
		const knownEntities = situation?.nearbyEntities || [];
		const targetIsGrounded = (target: IntentEntityReference): boolean => {
			const targetName = normalize(target.name);
			return textNormalized.includes(targetName) ||
				knownEntities.some((entity) => entity.id === target.id && entity.visibleToPlayer);
		};
		const explicitTargets = modelExplicitTargets.filter(targetIsGrounded);
		const impliedTargets = modelImpliedTargets.filter(targetIsGrounded);
		const safeSpeech = fallback.speechIntent || Boolean(value.speechIntent && DIALOGUE_PATTERN.test(originalText));
		const safeMovement = fallback.movementIntent || Boolean(value.movementIntent && MOVEMENT_PATTERN.test(originalText));
		const safeObservation = fallback.observationIntent || Boolean(value.observationIntent && PASSIVE_OBSERVATION_PATTERN.test(originalText));
		const safeMode =
			fallback.speechIntent
				? 'DIALOGUE'
				: fallback.interactionMode === 'COMBAT'
					? 'COMBAT'
					: fallback.interactionMode === 'PASSIVE_OBSERVATION'
						? 'PASSIVE_OBSERVATION'
						: fallback.interactionMode === 'EXPLORATION'
							? 'EXPLORATION'
							: fallback.interactionMode === 'MOVEMENT'
								? 'MOVEMENT'
								: mode;

		return {
			action: clean(value.action) || fallback.action,
			goal: clean(value.goal) || fallback.goal,
			target: explicitTargets[0],
			locationTarget: value.locationTarget && typeof value.locationTarget === 'object'
				? {
					id: clean((value.locationTarget as Record<string, unknown>).id) || undefined,
					name: clean((value.locationTarget as Record<string, unknown>).name),
					source: 'EXPLICIT',
				}
				: fallback.locationTarget,
			interactionMode: safeMode,
			speechIntent: safeSpeech,
			movementIntent: safeMovement,
			observationIntent: safeObservation,
			informationGoal: clean(value.informationGoal) || fallback.informationGoal,
			explicitTargets,
			impliedTargets,
			confidence: clampConfidence(value.confidence, 0.65),
			source: 'AI',
			originalText,
		};
	}

	public static buildPrompt(text: string, situation?: CurrentSituation): string {
		const scene = situation
			? [
				'Current location: ' + situation.location.name + ' (' + situation.location.id + ')',
				'Nearby entities: ' + (situation.nearbyEntities.filter((entity) => entity.visibleToPlayer).slice(0, 12).map((entity) => entity.name + ' [' + entity.kind + ']').join('; ') || 'None'),
				'Available locations: ' + (situation.location.connectedLocations.slice(0, 8).map((location) => location.name).join('; ') || 'None'),
				'Active dialogue: ' + (situation.activeDialogue ? situation.activeDialogue.speakerName + ': ' + situation.activeDialogue.text : 'None'),
			].join('\n')
			: 'Current scene context unavailable.';

		return [
			'Interpret the player intent semantically. Return JSON only; never write narrative prose.',
			'Required fields: action, goal, interactionMode, speechIntent, movementIntent, observationIntent, informationGoal, explicitTargets, impliedTargets, locationTarget, confidence.',
			'Allowed interactionMode values: PASSIVE_OBSERVATION, DIRECT_INTERACTION, DIALOGUE, MOVEMENT, COMBAT, MANIPULATION, INFORMATION_SEEKING, EXPLORATION, OTHER.',
			'Explicit speech requires an explicit communication verb in the player text. Listening, hearing, observing, approaching, and eavesdropping are NOT speech.',
			'Movement and observation may both be true. Preserve both when the player combines them.',
			'Do not invent a target, location, fact, motivation, or action not supported by the player text or supplied scene.',
			'Example: "I move closer to hear the rumors" => action=approach_and_listen, goal=gather_information, interactionMode=PASSIVE_OBSERVATION, speechIntent=false, movementIntent=true, observationIntent=true.',
			'Example: "I ask the guard what happened" => interactionMode=DIALOGUE, speechIntent=true.',
			'Example: "I listen for anything about the missing caravan" => passive information-seeking; speechIntent=false.',
			scene,
			'Player text: ' + text,
		].join('\n');
	}
}
