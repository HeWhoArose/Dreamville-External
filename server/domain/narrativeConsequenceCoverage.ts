/**
 * Shared narrative consequence-coverage contract (Phase 1A).
 *
 * Exactly one calibrated matcher judges whether a narration *conveys the
 * meaning* of a required canonical consequence. This replaces the two
 * near-duplicate token matchers that previously lived inline in
 * `aiOrchestrator.evaluateActionConsequenceFidelity` and in
 * `serverMockAuthority.liveNarrativeConsequenceCoverage` and had drifted
 * apart (different stop sets, different judgements for identical prose).
 *
 * Calibration principle (agreed Phase 1A decision):
 * - The matcher judges whether the OUTCOME was conveyed in human prose via
 *   semantic word-families:
 *     knockdown (knocked prone / crumbling / sprawling),
 *     impact    (struck / slammed / collided / crashing),
 *     lodging   (lodged / embedded / embedded-in),
 *     movement  (pushed / shoved / hurled backward),
 *     obstacle  (barrier / wall / crate / ground a body can hit),
 *     reaction  and fire (unchanged from the original contract).
 * - Schema bookkeeping nouns ("Applied condition:", "resolved", "remains",
 *   "Target", entity-id prefixes) are never required anchors: grounded prose
 *   never contains filing-cabinet labels, so demanding them makes the gate
 *   unsatisfiable and forces a deterministic fallback even when the rewrite
 *   was faithful.
 * - Obstacle collision is conveyed by
 *     (impact-family AND obstacle-family) OR (movement-family AND obstacle-family).
 *   Knock-back is forced movement (flying backwards into a wall) and is
 *   distinct from Prone (down on the ground); both are separate required
 *   outcomes, order-free.
 * - Safety floor: phrasing that maps to no known family is still REJECTED
 *   (deterministic fallback, never silently waved through). Every
 *   established rejection regression in tests/live-narration-quality-gate.test.ts
 *   keeps passing; this module only widens the acceptable ways to state the
 *   truth, never what counts as the truth.
 */

export interface ConsequenceCoverageResult {
	covered: boolean;
	matchedAnchors: string[];
	requiredAnchors: string[];
}

const STOP_WORDS = new Set([
	'the','and','that','this','with','from','into','then','than','they','their','there','were','was','have','has','had','will','would','could','should','your','you','for','are','but','not','his','her','him','she','its','our','out','over','under','after','before','about','what','when','where','which','while','just','only','very','some','i','a','an','to','of','on','in',
	// General projection boilerplate.
	'action','effect','result','visible','player','character','person','thing','nearby',
	// Schema bookkeeping nouns/adjectives. Human narration never contains these
	// labels, so requiring them as anchors makes grounded prose fail by construction.
	'resolved','successfully','success','applied','condition','conditions',
	'impassable','remain','remains','target','targets','enemy',
]);

const FAMILIES: Record<string, string[]> = {
	reaction: ['react','reacts','reacted','reaction','turn','turns','turned','look','looks','looked','glance','glances','glanced','lift','lifts','lifted','raise','raises','raised','notice','notices','noticed','attention','draw','draws','drew','catch','catches','caught','snap','snaps','snapped','pause','pauses','paused','freeze','freezes','froze','frozen','stop','stops','stopped','shift','shifts','shifted','face','faces','faced','peer','peers','peered','startle','startles','startled','stiffen','stiffens','stiffened','flinch','flinches','flinched','recoil','recoils','recoiled'],
	impact: ['strike','strikes','struck','hit','hits','impact','clang','clangs','clanged','collide','collides','collided','slam','slams','slammed','smash','smashes','smashed','crash','crashes','crashed','collision','damage','damages','damaged'],
	fire: ['fire','fires','fired','flame','flames','flaming','ignite','ignites','ignited','burn','burns','burned','burning','alight'],
	knockdown: ['knock','knocks','knocked','prone','fall','falls','fell','fallen','stagger','staggers','staggered','collapse','collapses','collapsed','crumple','crumples','crumpled','crumpling','sprawl','sprawls','sprawled','sprawling','facefirst'],
	lodging: ['lodge','lodges','lodged','lodging','embed','embeds','embedded','embedding','pierce','pierces','pierced','piercing','stick','sticks','stuck','sticking','wedge','wedges','wedged','wedging'],
	movement: ['push','pushes','pushed','pushing','shove','shoves','shoved','shoving','hurl','hurls','hurled','hurling','hurtle','hurtles','hurtled','hurtling','backward','backwards','fly','flies','flew','flying','flung','fling','flings','flinging'],
	obstacle: ['barrier','barriers','wall','walls','obstacle','obstacles','door','doors','doorway','column','columns','pillar','pillars','boulder','boulders','tree','trees','trunk','crate','crates','table','tables','railing','fence','fences','stone','stones','ground','floors'],
};

const FAMILY_NAMES = new Set(Object.keys(FAMILIES));

const ACTION_TERMS = new Set([
	'reaction','impact','fire','knockdown','lodging','movement','obstacle',
	'strike','lodge','embed','pierce','split','splinter','break','open','close','damage','restore','heal',
	'move','shift','change','stop','turn','retreat','approach','notice','react','draw','catch','raise','lower','look','glance','freeze','stiffen',
	'step','burn','ignite','knock','stagger','collapse','engulf','set','alight','fall','lift','pause','face','peer','startle','recoil','grind','drop',
]);

const isActionTerm = (token: string): boolean => ACTION_TERMS.has(token);

const normalizeToken = (token: string): string => {
	for (const [group, members] of Object.entries(FAMILIES)) {
		if (members.includes(token)) return group;
	}
	if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
	if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
	if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
	return token;
};

const stripPossessive = (token: string): string => token.replace(/['’]s$/, '');

const tokenize = (value: string) => Array.from(new Set(
	String(value || '')
		.toLowerCase()
		.split(/[^a-z0-9'-]+/)
		.map((token) => stripPossessive(token.replace(/^['-]+|['-]+$/g, '')))
		.filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
		.map(normalizeToken),
));

const orderedTokens = (value: string) => String(value || '')
	.toLowerCase()
	.split(/[^a-z0-9'-]+/)
	.map((token) => stripPossessive(token.replace(/^['-]+|['-]+$/g, '')))
	.filter((token) => token.length >= 4 && !STOP_WORDS.has(token))
	.map(normalizeToken);

const buildObservedBigrams = (observedOrdered: string[]) => new Set(
	observedOrdered.slice(0, -1).map((token, index) => token + ' ' + observedOrdered[index + 1]),
);

const nounBigramsOf = (requiredOrdered: string[]) => requiredOrdered.slice(0, -1)
	.map((token, index) => [token, requiredOrdered[index + 1]] as const)
	.filter(([left, right]) => !isActionTerm(left) && !isActionTerm(right) && left.length >= 4 && right.length >= 4)
	.map(([left, right]) => left + ' ' + right);

const nounTokensOf = (requiredOrdered: string[]) => requiredOrdered.filter((token) => !isActionTerm(token));

const hasNounAnchorOrNone = (requiredOrdered: string[], observedOrdered: string[], observed: Set<string>): boolean => {
	const nounBigrams = nounBigramsOf(requiredOrdered);
	if (nounBigrams.length) {
		// Prefer a specific noun phrase ("front goblin", "guarded door") so an
		// unrelated effect on a different entity cannot share outcome vocabulary.
		const observedBigrams = buildObservedBigrams(observedOrdered);
		return nounBigrams.some((phrase) => observedBigrams.has(phrase));
	}
	const nouns = nounTokensOf(requiredOrdered);
	if (nouns.length) return nouns.some((token) => observed.has(token));
	// No object/person named in the consequence: family conveyance is the whole requirement.
	return true;
};

export function isConsequenceCovered(narrativeText: string, consequenceText: string): ConsequenceCoverageResult {
	const requiredOrdered = orderedTokens(consequenceText);
	const observedOrdered = orderedTokens(narrativeText);
	const requiredAnchors = Array.from(new Set(requiredOrdered));
	const observed = new Set(observedOrdered);
	const matchedAnchors = requiredAnchors.filter((token) => observed.has(token));
	if (requiredAnchors.length === 0) return { covered: true, matchedAnchors, requiredAnchors };

	const observedFamilies = new Set(observedOrdered.filter((token) => FAMILY_NAMES.has(token)));
	const requiredFamilies = Array.from(new Set(requiredAnchors.filter((token) => FAMILY_NAMES.has(token))));

	// Obstacle-collision rule (Phase 1A decision): an impact OR movement beat
	// against an obstacle surface conveys "Target collided with ... obstacle
	// for N collision damage". Knock-back forced movement (hurling him backward
	// into the barrier) and a direct impact-slam are semantically equivalent.
	// Only applies when collision is the whole outcome: a required lodging is a
	// separate outcome family and keeps the every-family rule.
	const collisionLikeOutcome = requiredAnchors.includes('obstacle') &&
		requiredFamilies.every((family) => family === 'impact' || family === 'movement' || family === 'obstacle');
	if (collisionLikeOutcome) {
		const covered = observedFamilies.has('obstacle') &&
			(observedFamilies.has('impact') || observedFamilies.has('movement'));
		return { covered, matchedAnchors, requiredAnchors };
	}

	if (requiredFamilies.length > 0) {
		// Every required outcome family must be conveyed...
		const familiesConveyed = requiredFamilies.every((family) => observedFamilies.has(family));
		if (!familiesConveyed) return { covered: false, matchedAnchors, requiredAnchors };
		// ...and a specific object/person anchor, so an unrelated effect on a
		// different entity cannot satisfy this one by sharing outcome vocabulary.
		const anchored = hasNounAnchorOrNone(requiredOrdered, observedOrdered, observed);
		return { covered: anchored, matchedAnchors, requiredAnchors };
	}

	// Entity/state line without an outcome family (e.g. "Target enemy_warden
	// remains at 23 HP."): it is conveyed when the narration stays anchored
	// to the entity the consequence concerns.
	if (nounTokensOf(requiredOrdered).length > 0) {
		return { covered: hasNounAnchorOrNone(requiredOrdered, observedOrdered, observed), matchedAnchors, requiredAnchors };
	}
	// Deterministic fallback for any string with no recognized semantics at
	// all: fall back to the original strict anchor-count gate.
	const minimumMatches = requiredAnchors.length <= 2 ? requiredAnchors.length : 2;
	const coverage = matchedAnchors.length / requiredAnchors.length;
	return {
		covered: matchedAnchors.length >= minimumMatches && coverage >= 0.2,
		matchedAnchors,
		requiredAnchors,
	};
}

/**
 * Builds the required-consequence list for a resolved action: trims, drops
 * empty entries and canonical-position fillers, dedupes case-insensitively,
 * then removes COMPOSITE summary lines that merely repeat (subsume) their own
 * per-effect strings. Per-effect strings are what prose must cover; a
 * "Capability: resolved. Damage: N. Applied condition: X. Target collided..."
 * top-line cannot be demanded of natural narration on top of its own members.
 */
export function buildRequiredConsequences(parts: {
	physicalConsequences?: readonly string[] | undefined;
	playerVisibleConsequences?: readonly string[] | undefined;
}): string[] {
	const unique = Array.from(new Map(
		[
			...(parts.physicalConsequences || []),
			...(parts.playerVisibleConsequences || []),
		]
			.map((value) => String(value || '').trim())
			.filter((value) => Boolean(value) && !/^the character is now canonically positioned\b/i.test(value))
			.map((value) => [value.toLocaleLowerCase(), value] as const),
	).values());
	return unique.filter((value) => {
		const lower = value.toLocaleLowerCase();
		return !unique.some((other) => other !== value && other.length < value.length && lower.includes(other.toLocaleLowerCase()));
	});
}
