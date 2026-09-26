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
    actionType?: string;
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
}

export interface ComicScenePromptResult {
  prompt: string;
  sourceActionId?: string;
  sourceNarration: string;
  panelCount: number;
  aspectRatio: '16:9';
  freshnessRule: string;
}

export function buildComicScenePrompt(context: ComicSceneContext): ComicScenePromptResult {
  const latest = context.latestAction || {};
  const narration = (latest.narrativeResponse || latest.authoritativeFeedback || '').trim();
  const action = (latest.description || '').trim();
  const consequence = latest.checkResult?.consequence?.summary?.trim() || '';
  const checkOutcome = latest.checkResult
    ? latest.checkResult.success
      ? 'The latest check succeeded. Show the successful visible result without exposing dice, DC numbers, or engine terminology.'
      : 'The latest check failed. Show the failure and its immediate visible consequence. Never turn the failure into success.'
    : '';

  const cast = [
    `${context.protagonist.name}${context.protagonist.role ? ` (${context.protagonist.role})` : ''}`,
    ...context.visibleCharacters.map((character) =>
      `${character.name}${character.title ? ` — ${character.title}` : ''}${character.role ? ` (${character.role})` : ''}`
    ),
  ];

  const dialogue =
    latest.actionType === 'DIALOGUE_CHOICE' && context.activeDialogue?.text
      ? `${context.activeDialogue.speakerName || 'Speaker'} says: "${context.activeDialogue.text}"`
      : '';

  const sceneBrief = [
    `World identity: ${context.worldTitle || 'Current story world'}.`,
    `Exact location: ${context.location.name}${context.location.region ? ` — ${context.location.region}` : ''}.`,
    context.location.description ? `Physical appearance and spatial facts: ${context.location.description}.` : '',
    context.location.ambientSensory ? `Atmosphere and sensory cues: ${context.location.ambientSensory}.` : '',
    `Visible cast only: ${cast.join('; ')}.`,
    action ? `Immediate action: ${action}.` : 'No new player action was recorded; depict the latest visible state exactly as supplied.',
    narration ? `Latest narrative beat: ${narration}.` : '',
    consequence ? `Immediate consequence: ${consequence}.` : '',
    dialogue ? `Current dialogue beat: ${dialogue}.` : '',
    checkOutcome,
  ].filter(Boolean).join('\\n');

  const beatCount = [action, narration, consequence, dialogue].filter(Boolean).length;
  const panelCount: 1 | 2 | 3 | 4 =
    !action && !dialogue ? 1 :
    consequence && dialogue ? 4 :
    consequence || narration.length > 180 ? 3 :
    2;

  const panelPlan =
    panelCount === 1
      ? ['Panel 1 / splash: depict the exact current scene state as one strong establishing composition. Do not invent a prior or later event merely to fill space.']
      : panelCount === 2
        ? [
            'Panel 1: establish the exact current location, atmosphere, and visible cast.',
            'Panel 2: depict the immediate current action or dialogue beat exactly as supplied.',
          ]
        : panelCount === 3
          ? [
              'Panel 1: establish the exact current location, atmosphere, and visible cast.',
              'Panel 2: depict the immediate action or dialogue beat at the exact moment it occurs.',
              'Panel 3: depict the latest canonical result and only its immediate visible consequence.',
            ]
          : [
              'Panel 1: establish the exact current location, atmosphere, and visible cast.',
              'Panel 2: depict the immediate player action or dialogue beat.',
              'Panel 3: depict the latest canonical result and immediate visible consequence.',
              'Panel 4: depict only the immediate aftermath, preserving spatial and character continuity.',
            ];

  const prompt = [
    'Create a polished comic-book sequential-art page depicting ONLY the LATEST / IMMEDIATE CURRENT STORY TURN.',
    '',
    'CURRENT SCENE VISUAL BRIEF',
    sceneBrief,
    '',
    'PANEL LOGIC',
    `There are ${beatCount} supplied immediate story beats. Use exactly ${panelCount} panel${panelCount === 1 ? '' : 's'}; never invent additional story beats to fill panels.`,
    ...panelPlan,
    '',
    'VISUAL CONTINUITY',
    'Keep every named character visually consistent from panel to panel: face, hairstyle, body proportions, species traits, clothing, armor, equipment, injuries, colors, and relative position.',
    'Keep the same physical environment, terrain, architecture, lighting direction, weather, and spatial relationships unless the immediate action explicitly changes them.',
    'Use cinematic comic-book composition, readable silhouettes, expressive perspective, strong panel gutters, and clear sequential visual storytelling.',
    '',
    'CANON / FRESHNESS RULES',
    'Use only the current location, current visible cast, latest action, latest narration, current dialogue, and immediate consequence supplied above.',
    'Do not recap prior scenes. No flashbacks, time skips, future events, alternate outcomes, invented characters, invented powers, invented equipment, invented injuries, or invented environmental effects.',
    'Do not expose engine internals such as actionType, DC, roll totals, API fields, canonical IDs, or internal rule labels as UI text.',
    'A failed action must remain visibly failed. A successful action must remain consistent with the supplied result.',
    'No title cards, captions, speech balloons, watermarks, interface chrome, or arbitrary text unless natural in-world text is explicitly part of the supplied current scene.',
  ].join('\\n');

  return {
    prompt,
    sourceActionId: undefined,
    sourceNarration: narration,
    panelCount,
    aspectRatio: '16:9',
    freshnessRule: 'Immediate latest turn only; no prior-scene carryover.',
  };
}
}
