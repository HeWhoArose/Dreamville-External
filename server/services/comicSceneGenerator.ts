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
  const outcome = latest.checkResult
    ? latest.checkResult.success
      ? `Successful check: ${latest.checkResult.total ?? ''} vs DC ${latest.checkResult.difficultyClass ?? ''}.`
      : `Failed check: ${latest.checkResult.total ?? ''} vs DC ${latest.checkResult.difficultyClass ?? ''}.`
    : '';
  const consequence = latest.checkResult?.consequence?.summary?.trim() || '';

  const cast = [
    `${context.protagonist.name}${context.protagonist.role ? ` (${context.protagonist.role})` : ''}`,
    ...context.visibleCharacters.map((character) =>
      `${character.name}${character.title ? ` — ${character.title}` : ''}${character.role ? ` (${character.role})` : ''}`
    ),
  ];

  const immediateDialogue =
    latest.actionType === 'DIALOGUE_CHOICE' && context.activeDialogue?.text
      ? `${context.activeDialogue.speakerName || 'Speaker'}: ${context.activeDialogue.text}`
      : '';

  const prompt = [
    'Create a comic-book sequential-art page depicting ONLY the LATEST / IMMEDIATE CURRENT STORY TURN.',
    `World: ${context.worldTitle || 'Current story world'}.`,
    `Current location: ${context.location.name}.`,
    context.location.region ? `Location region: ${context.location.region}.` : '',
    context.location.description ? `Current location visual facts: ${context.location.description}.` : '',
    context.location.ambientSensory ? `Current atmosphere: ${context.location.ambientSensory}.` : '',
    `Current cast, and ONLY this cast: ${cast.join('; ')}.`,
    action ? `Immediate player action: ${action}.` : 'Immediate player action: not recorded; show the latest visible scene state.',
    outcome,
    consequence ? `Immediate consequence: ${consequence}.` : '',
    narration ? `Immediate narration from the latest turn: ${narration}.` : '',
    immediateDialogue ? `Current active dialogue only: ${immediateDialogue}.` : '',
    '',
    'Composition requirements:',
    '• One full comic page with 4 distinct panels separated by visible gutters.',
    '• Panel 1 establishes the exact current location and characters.',
    '• Panel 2 depicts the immediate player action at the exact moment it happens.',
    '• Panel 3 depicts the latest mechanical/narrative result and immediate consequence.',
    '• Panel 4 depicts the immediate aftermath, preserving the same location, characters, clothing, injuries, lighting, and spatial continuity.',
    '• Keep character appearance, clothing, equipment, proportions, and relative positions consistent from panel to panel.',
    '• Use comic-style sequential art, expressive framing, cinematic perspective, strong panel composition, and readable visual storytelling.',
    '',
    'Freshness and canon constraints:',
    '• Freshness rule: latest turn only; no prior-scene carryover.',
    '• This is a CURRENT-SCENE illustration, not a recap.',
    '• Use only the latest turn narration/action plus current location and current visible cast supplied above.',
    '• Do NOT use previous dialogue, previous actions, opening-scene events, or old consequences.',
    '• No flashbacks, no time skips, no alternate outcomes, no future events, and no invented characters.',
    '• Do NOT add powers, equipment, injuries, locations, or events that are absent from the supplied immediate turn.',
    '• Do not depict failed actions as successful; failed actions must remain visibly failed. Never depict failed actions as successful.',
    '• Do not turn internal engine mechanics into visible UI text.',
    '• Do not add captions, speech balloons, title cards, watermarks, interface chrome, or arbitrary text unless it is naturally present in the scene.',
  ].filter(Boolean).join('\n');

  return {
    prompt,
    sourceActionId: undefined,
    sourceNarration: narration,
    panelCount: 4,
    aspectRatio: '16:9',
    freshnessRule: 'Immediate latest turn only; no prior-scene carryover.',
  };
}
