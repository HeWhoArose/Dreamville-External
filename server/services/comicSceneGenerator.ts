export interface ComicSceneContext {
  worldTitle?: string;
  location: {
    name: string;
    region?: string;
    description?: string;
    ambientSensory?: string;
  };
  protagonist: {
    name: string;
    role?: string;
    portraitEmoji?: string;
    portraitUrl?: string;
  };
  visibleCharacters: Array<{
    name: string;
    role?: string;
    title?: string;
    portraitEmoji?: string;
  }>;
  latestAction?: {
    id?: string;
    actionType?: string;
    visualCues?: string[];
    description?: string;
    narrativeResponse?: string;
    authoritativeFeedback?: string;
    checkResult?: {
      success?: boolean;
      total?: number;
      difficultyClass?: number;
      consequence?: {
        summary?: string;
      };
    };
  };
  activeDialogue?: {
    speakerName?: string;
    text?: string;
  } | null;
  actionType?: string;
  currentSituation?: string;
  latestVisibleNarrative?: string;
};

export interface ComicSceneVisualMoment {
  mode: "CURRENT_TURN" | "OPENING_STATE";
  primaryAction: string;
  visibleCharacters: string[];
  location: string;
  immediateVisibleResult?: string;
  currentDialogue?: string;
  supportingNarrative?: string;
  visualBeats?: string[];
  canonicalOutcome?: "SUCCESS" | "FAILURE";
};

export interface ComicScenePromptResult {
  prompt: string;
  sourceActionId?: string;
  sourceNarration: string;
  panelCount: number;
  aspectRatio: "16:9";
  freshnessRule: string;
  visualMoment: ComicSceneVisualMoment;
}

function cleanText(value?: string): string {
  return String(value || "").trim();
}

function formatCharacter(character: { name: string; role?: string; title?: string }): string {
  return [
    character.name,
    character.title ? "— " + character.title : "",
    character.role ? " (" + character.role + ")" : "",
  ].filter(Boolean).join("");
}

export function resolveComicSceneVisualMoment(context: ComicSceneContext): ComicSceneVisualMoment {
  const latest = context.latestAction;
  const action = cleanText(latest?.description);
  const narrative = cleanText(latest?.narrativeResponse);
  const consequence = cleanText(latest?.checkResult?.consequence?.summary);
  const dialogueText = latest?.actionType === "DIALOGUE_CHOICE" ? cleanText(context.activeDialogue?.text) : "";

  const visibleCharacters = [
    formatCharacter({ name: context.protagonist.name, role: context.protagonist.role }),
    ...context.visibleCharacters.map(formatCharacter),
  ];

  if (latest && (action || narrative || consequence || dialogueText)) {
    const currentDialogue = dialogueText
      ? (cleanText(context.activeDialogue?.speakerName) || "Speaker") + " says: \"" + dialogueText + "\""
      : undefined;

    return {
      mode: "CURRENT_TURN",
      primaryAction:
        action ||
        currentDialogue ||
        "Depict the exact current committed story state described by the current-turn narrative.",
      visibleCharacters,
      location: [
        context.location.name,
        context.location.region ? "— " + context.location.region : "",
      ].filter(Boolean).join(" "),
      immediateVisibleResult: consequence || narrative || undefined,
      currentDialogue,
      supportingNarrative: narrative || undefined,
      visualBeats: (latest.visualCues || []).map((cue) => cleanText(cue)).filter(Boolean).slice(0, 4),
      canonicalOutcome:
        typeof latest.checkResult?.success === "boolean"
          ? (latest.checkResult.success ? "SUCCESS" : "FAILURE")
          : undefined,
    };
  }

  const openingNarrative = cleanText(context.latestVisibleNarrative) || cleanText(context.currentSituation);

  return {
    mode: "OPENING_STATE",
    primaryAction: openingNarrative || "Depict the current visible story state exactly as supplied.",
    visibleCharacters,
    location: [
      context.location.name,
      context.location.region ? "— " + context.location.region : "",
    ].filter(Boolean).join(" "),
    supportingNarrative: openingNarrative || undefined,
    visualBeats: openingNarrative ? [openingNarrative] : [],
  };
}

// PANEL LOGIC: adaptive panel logic is intentionally resolved to exactly one panel for
// the current visual moment so previous/future beats cannot be merged into one image.
export function buildComicScenePrompt(context: ComicSceneContext): ComicScenePromptResult {
  const visualMoment = resolveComicSceneVisualMoment(context);
  const latest = context.latestAction;
  const sourceNarration = cleanText(
    latest?.narrativeResponse || latest?.authoritativeFeedback || context.latestVisibleNarrative
  );

  const visualBeats = visualMoment.visualBeats?.length
    ? visualMoment.visualBeats
    : [visualMoment.primaryAction + (visualMoment.immediateVisibleResult ? " " + visualMoment.immediateVisibleResult : "")];

  const characterList = visualMoment.visibleCharacters.length
    ? visualMoment.visibleCharacters.map((character) => "- " + character).join("\n")
    : "- No additional visible characters.";

  const panelInstructions = visualBeats.slice(0, 4).map((beat, index) =>
    "Panel " + (index + 1) + ": depict ONLY this chronological visual beat from the current turn: " + beat
  );

  const outcomeInstruction =
    visualMoment.canonicalOutcome === "FAILURE"
      ? "The canonical action failed. Show the failure and only its immediate visible consequence. Never convert the failure into a success."
      : visualMoment.canonicalOutcome === "SUCCESS"
        ? "The canonical action succeeded. Show only the supplied successful visible result. Do not invent additional rewards or events."
        : "No separate success/failure outcome was supplied. Do not invent one. Show only what is explicitly described in the current visual moment.";

  const prompt = [
    "Create ONE standalone comic-book illustration of the exact current visual moment.",
    "This is a single frozen moment, NOT a summary of the story and NOT a sequence of past, present, and future events.",
    "",
    "SCENE RESET",
    "Treat this image as an independent visual request.",
    "Do not recreate the previous image or reuse its composition.",
    "Story continuity may preserve character identity and physical location, but the current action determines the composition.",
    "",
    "CURRENT SCENE VISUAL BRIEF",
    "The following is the exact current visual moment. It is the only story moment that may be depicted.",
    "EXACT CURRENT TURN VISUAL SEQUENCE",
    "The following panels represent only the current committed turn. They are chronological parts of one turn, not prior-scene recap.",
    ...panelInstructions,
    "Primary action: " + visualMoment.primaryAction,
    "Location: " + visualMoment.location + ".",
    "Visible characters:",
    characterList,
    visualMoment.currentDialogue ? "Current dialogue: " + visualMoment.currentDialogue : "",
    visualMoment.immediateVisibleResult
      ? "Immediate visible result: " + visualMoment.immediateVisibleResult
      : "Immediate visible result: none supplied; do not invent one.",
    visualMoment.supportingNarrative
      ? "Current-turn narrative evidence: " + visualMoment.supportingNarrative
      : "",
    outcomeInstruction,
    "",
    "COMPOSITION",
    "Choose the camera angle, framing, pose, and character placement specifically for this exact current moment.",
    "Make the primary action visually unmistakable.",
    "Use exactly " + panelInstructions.length + " panel" + (panelInstructions.length === 1 ? "" : "s") + ".",
    "Every panel must depict one supplied current-turn visual beat and nothing else.",
    "Do not add panels for setup, recap, or future events.",
    "Do not reuse the previous image composition merely because the location or characters are the same.",
    "",
    "CONTINUITY",
    "Preserve established character identity only where it is explicitly available: face, hairstyle, species, body proportions, clothing, armor, major equipment, and existing injuries.",
    "Change pose, position, expression, camera angle, and visual focus whenever the current action requires it.",
    "Preserve the current physical location only as environmental context; do not reconstruct unrelated earlier staging.",
    "",
    "COMIC-BOOK ART DIRECTION",
    "Professional modern graphic-novel / comic-book illustration.",
    "Strong ink linework, confident outlines, readable silhouettes, expressive anatomy, controlled cel shading, deliberate color blocking, dramatic but coherent lighting, cinematic perspective, polished illustrated surfaces, and clear visual storytelling.",
    "The result must look drawn and inked rather than photorealistic, like finished sequential comic art.",
    "",
    "STRICT EXCLUSIONS",
    "Do not depict previous actions.",
    "Do not depict future events.",
    "Do not depict an earlier opening scene.",
    "Do not depict alternate outcomes.",
    "Do not add characters, creatures, weapons, powers, injuries, objects, or environmental effects that are not supported by the current visual moment.",
    "Do not expose engine internals, dice totals, DC numbers, API fields, canonical IDs, actionType values, or rule-system labels as visible text.",
    "Do not add title cards, captions, speech balloons, watermarks, interface elements, or arbitrary text unless explicitly required by the current scene.",
    "",
    "FINAL PRIORITY",
    "The exact current visual moment above is the sole subject of the image.",
    "Everything else is supporting context only.",
  ].filter(Boolean).join("\n");

  return {
    prompt,
    sourceActionId: latest?.id,
    sourceNarration,
    panelCount: Math.max(1, Math.min(4, visualBeats.length)),
    aspectRatio: "16:9",
    freshnessRule: "Exact current visual moment only; committed-turn state overrides opening/previous-scene context.",
    visualMoment,
  };
}


import type { VisualSceneContext } from '../domain/visualSceneContext';

/**
 * Phase 16 adapter: converts the canonical CurrentSituation + latest authoritative
 * player-action turn into the existing comic prompt contract. This is the only
 * scene-prompt entry point that should be used by gameplay routes.
 */
export function buildComicScenePromptFromVisualContext(
	visualContext: VisualSceneContext,
): ComicScenePromptResult {
	const situation = visualContext.currentSituation;
	const latest = visualContext.latestTurn;

	const context: ComicSceneContext = {
		location: {
			name: situation.location.name,
			region: situation.location.regionId,
			description: situation.location.description,
			ambientSensory: situation.location.ambientSensory,
		},
		protagonist: {
			name: situation.player.name,
			role: 'Protagonist',
		},
		visibleCharacters: visualContext.visibleCharacters.map((character) => ({
			name: character.name,
			role: character.role,
		})),
		latestAction: latest
			? {
				id: latest.id,
				actionType: latest.actionType,
				visualCues: visualContext.latestVisualCues,
				description: visualContext.latestPlayerAction,
				narrativeResponse: visualContext.latestNarrative,
				authoritativeFeedback: latest.authoritativeFeedback,
				checkResult: latest.checkResult
					? {
						success: latest.checkResult.success,
						total: latest.checkResult.total,
						difficultyClass: latest.checkResult.difficultyClass,
						consequence: latest.checkResult.consequence
							? { summary: latest.checkResult.consequence.summary }
							: undefined,
					}
					: undefined,
			}
			: undefined,
		activeDialogue: visualContext.latestDialogue
			? {
				speakerName: visualContext.latestDialogue.speakerName,
				text: visualContext.latestDialogue.text,
			}
			: null,
		currentSituation: visualContext.openingState
			? [
					situation.location.name,
					situation.location.description,
					situation.worldTime,
				].filter(Boolean).join('. ')
			: undefined,
		latestVisibleNarrative: visualContext.openingState
			? situation.location.description
			: undefined,
	};

	return buildComicScenePrompt(context);
}
