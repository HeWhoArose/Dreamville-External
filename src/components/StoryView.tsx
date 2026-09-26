import React, { useRef, useState } from 'react';
import {
  Location,
  DialogueNode,
  DialogueChoice,
  ActionLog,
  OpeningScene,
  CharacterStartingConditionState,
  ActionAdvice,
  ActionTip,
  CombatTransitionState,
} from '../types';
import { useAudioHaptic } from './AudioHapticManager';
import { apiClient } from '../services/apiClient';
import { mergeSuggestedActionText } from '../utils/storyActionComposer';
import { getCharacterSpeakerTheme } from './voiceResolver';
import { DiceRollAnimation } from './common/DiceRollAnimation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Dices,
  FileText,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';

interface StoryViewProps {
  location: Location;
  activeDialogue: DialogueNode | null;
  dialogueHistory: { speaker: string; text: string; cycle: number }[];
  actionHistory?: ActionLog[];
  onSelectChoice: (choice: DialogueChoice) => void;
  onRequestInspect: () => void;
  onRequestRest: () => void;
  onCustomAction?: (actionText: string) => void;
  pendingActionAdvice?: ActionAdvice | null;
  actionTips?: ActionTip[];
  onAcceptActionAdvice?: (advice: ActionAdvice) => void;
  onRejectActionAdvice?: (advice: ActionAdvice) => void;
  isProcessingAction: boolean;
  openingScene?: OpeningScene | null;
  worldTitle?: string;
  worldId?: string;
  protagonistName?: string;
  protagonistRole?: string;
  protagonistPortraitUrl?: string;
  protagonistPortraitEmoji?: string;
  protagonistConditionState?: CharacterStartingConditionState;
  isLoadingOpening?: boolean;
  openingError?: string | null;
  onRetryOpening?: () => void;
  combatTransition?: CombatTransitionState | null;
  onEnterCombat?: () => void;
}

const StoryCheckCard: React.FC<{
  check: NonNullable<ActionLog['checkResult']>;
  revealed: boolean;
  onReveal: () => void;
}> = ({ check, revealed, onReveal }) => (
  <div className="ml-[3.25rem] rounded-2xl border border-stone-800 bg-stone-950/80 px-4 py-3">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Dices className="h-4 w-4 text-stone-500" />
          <p className="text-xs font-semibold text-stone-300">
            {check.testType === 'SAVING_THROW'
              ? `${check.ability} Saving Throw`
              : `${check.skill} Check`}
          </p>
        </div>
        <p className="mt-1 text-[10px] text-stone-600">{check.ability}
          {check.proficiencyLevel === 'EXPERTISE' ? ' · Expertise' : check.proficiencyLevel === 'PROFICIENT' ? ' · Proficient' : ''}
          {check.proficiencyBonus > 0 ? ` · +${check.proficiencyBonus} proficiency` : ''}
          {check.abilityModifier !== 0 ? ` · ${check.abilityModifier > 0 ? '+' : ''}${check.abilityModifier} ability` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] uppercase tracking-wide text-stone-600">DC</p>
        <p className="text-lg font-semibold text-stone-200">{check.difficultyClass}</p>
      </div>
    </div>

    {check.advantageState !== 'NORMAL' && (
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-md border border-stone-800 bg-stone-900 px-2 py-0.5 text-[10px] text-stone-400">
          {check.advantageState === 'ADVANTAGE' ? 'Advantage · roll 2d20, keep higher' : 'Disadvantage · roll 2d20, keep lower'}
        </span>
      </div>
    )}

    <div className="mt-3">
      <DiceRollAnimation roll={check.roll} onComplete={onReveal} />
    </div>

    {revealed && (
      <>
        {check.modifierSources.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-stone-900 pt-3">
            {check.modifierSources.map((source) => (
              <div key={`${source.kind}-${source.label}`} className="flex items-center justify-between text-[10px]">
                <span className="text-stone-600">{source.label}</span>
                <span className="text-stone-400">{source.value !== undefined ? `${source.value >= 0 ? '+' : ''}${source.value}` : ''}</span>
              </div>
            ))}
          </div>
        )}
        {check.contextNotes.length > 0 && (
          <div className="mt-2 space-y-1">
            {check.contextNotes.map((note) => <p key={note} className="text-[10px] text-stone-600">{note}</p>)}
          </div>
        )}
        <div className={`mt-3 flex items-center justify-between border-t border-stone-900 pt-3 text-xs ${check.success ? 'text-stone-300' : 'text-stone-500'}`}>
          <span className="font-medium">{check.success ? 'Success' : 'Failure'}</span>
          <span className="text-[10px] text-stone-600">{check.total} total {check.totalModifier !== 0 ? `(${check.totalModifier >= 0 ? '+' : ''}${check.totalModifier})` : ''}</span>
        </div>

        {check.consequence && (
          <div className="mt-3 rounded-xl border border-stone-800 bg-stone-900/50 px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                {check.consequence.branch === 'SUCCESS' ? 'Outcome' : 'Consequence'}
              </span>
              <span className="text-[10px] text-stone-600">
                {check.consequence.applied ? 'Committed' : 'No effect'}
              </span>
            </div>
            <p className="text-xs leading-5 text-stone-300">{check.consequence.summary}</p>

            {check.consequence.damage && (
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-stone-500">
                <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">
                  Damage {check.consequence.damage.finalAmount} {check.consequence.damage.damageType}
                </span>
                <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">
                  HP {check.consequence.damage.healthCurrent}
                </span>
                {check.consequence.damage.immune && (
                  <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">Immune</span>
                )}
                {check.consequence.damage.resisted && (
                  <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">Resisted</span>
                )}
                {check.consequence.damage.vulnerable && (
                  <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">Vulnerable</span>
                )}
              </div>
            )}

            {check.consequence.appliedConditions.length > 0 && (
              <p className="mt-2 text-[10px] text-stone-500">
                Applied: {check.consequence.appliedConditions.join(', ')}
              </p>
            )}

            {check.consequence.removedConditions.length > 0 && (
              <p className="mt-1 text-[10px] text-stone-500">
                Removed: {check.consequence.removedConditions.join(', ')}
              </p>
            )}

            {check.consequence.noEffectReason && (
              <p className="mt-1 text-[10px] text-stone-600">{check.consequence.noEffectReason}</p>
            )}
          </div>
        )}
      </>
    )}
  </div>
);
const Portrait: React.FC<{
  imageUrl?: string;
  emoji?: string;
  size?: 'sm' | 'md';
  className?: string;
}> = ({ imageUrl, emoji = '🧙‍♂️', size = 'md', className = '' }) => {
  const [failed, setFailed] = useState(false);
  const dimension = size === 'sm' ? 'h-9 w-9 text-lg' : 'h-12 w-12 text-2xl';

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full border border-stone-700/80 bg-stone-900/90 ${dimension} ${className}`}
    >
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-contain p-0.5"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">{emoji}</div>
      )}
    </div>
  );
};

export const StoryView: React.FC<StoryViewProps> = ({
  location,
  activeDialogue,
  dialogueHistory,
  actionHistory = [],
  onSelectChoice,
  onRequestInspect,
  onRequestRest,
  onCustomAction,
  pendingActionAdvice = null,
  actionTips = [],
  onAcceptActionAdvice,
  onRejectActionAdvice,
  isProcessingAction,
  openingScene,
  worldTitle,
  worldId,
  protagonistName,
  protagonistRole,
  protagonistPortraitUrl,
  protagonistPortraitEmoji,
  protagonistConditionState,
  isLoadingOpening = false,
  openingError = null,
  onRetryOpening,
  combatTransition = null,
  onEnterCombat,
}) => {
  const { playSpeech, isPlayingSpeech, triggerHaptic, playSfx } = useAudioHaptic();

  const [typedAction, setTypedAction] = useState('');
  const [revealedCheckIds, setRevealedCheckIds] = useState<Record<string, boolean>>({});
  const [visibleTurnCount, setVisibleTurnCount] = useState(12);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [sceneChoiceOpen, setSceneChoiceOpen] = useState(false);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [scenePrompt, setScenePrompt] = useState<string | null>(null);
  const [sceneImageUrl, setSceneImageUrl] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setTranscriptionError(null);
    triggerHaptic('light');

    const fallbackTranscribe = async (payload: string, delayMs: number) => {
      setIsTranscribing(true);
      window.setTimeout(async () => {
        try {
          const res = await fetch('/api/game/sensory/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: payload }),
          });
          const data = await res.json();
          if (data.text) setTypedAction((prev) => (prev ? `${prev} ${data.text}` : data.text));
          triggerHaptic('medium');
        } catch {
          setTranscriptionError('Transcription request failed.');
        } finally {
          setIsTranscribing(false);
        }
      }, delayMs);
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      await fallbackTranscribe('sample_audio_capture_payload', 500);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsTranscribing(true);

        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string)?.split(',')[1] || '';
            const res = await fetch('/api/game/sensory/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64Audio }),
            });
            const data = await res.json();
            if (data.text) setTypedAction((prev) => (prev ? `${prev} ${data.text}` : data.text));
            setIsTranscribing(false);
          };
        } catch {
          setTranscriptionError('Failed to transcribe audio.');
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      await fallbackTranscribe('mock_mic_capture', 500);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      triggerHaptic('light');
    }
  };

  const handleSubmitAction = (event: React.FormEvent) => {
    event.preventDefault();
    const actionText = typedAction.trim();
    if (!actionText || isProcessingAction) return;

    triggerHaptic('medium');
    playSfx('ui.click', 'LOW', 0.5);
    onCustomAction?.(actionText);
    setTypedAction('');
  };

  const insertSuggestedAction = (suggestion: string) => {
    const cleanSuggestion = suggestion.trim();
    if (!cleanSuggestion) return;

    setTypedAction((current) => mergeSuggestedActionText(current, cleanSuggestion));
    setSuggestionsOpen(false);
    setSceneMenuOpen(false);
    triggerHaptic('light');
    playSfx('ui.click', 'LOW', 0.35);
  };

  const handleReadAloud = (text: string, speakerId = 'narrator') => {
    triggerHaptic('light');
    playSpeech(text, speakerId);
  };

  const latestTurnAction = actionHistory.find((action) => action.actionType !== 'NOTE_RECORD');

  const requestScenePrompt = async () => {
    setSceneLoading(true);
    setSceneError(null);
    try {
      const result = await apiClient.generateCurrentScenePrompt();
      setScenePrompt(result.prompt);
      setSceneImageUrl(null);
      setSceneChoiceOpen(false);
      setSceneMenuOpen(false);
    } catch (error: any) {
      setSceneError(error?.message || 'Failed to build the current-scene comic prompt.');
    } finally {
      setSceneLoading(false);
    }
  };

  const requestSceneImage = async () => {
    setSceneLoading(true);
    setSceneError(null);
    try {
      const result = await apiClient.generateCurrentSceneImage();
      if (result.imageUrl) {
        setSceneImageUrl(result.imageUrl);
      }
      setScenePrompt(result.prompt || null);
      setSceneChoiceOpen(false);
      setSceneMenuOpen(false);
    } catch (error: any) {
      setSceneError(error?.message || 'Failed to generate the current-scene comic image.');
    } finally {
      setSceneLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-12 text-stone-100">
      {/* Quiet identity bar */}
      <header className="relative overflow-hidden rounded-3xl border border-violet-400/15 bg-gradient-to-br from-violet-500/[0.10] via-fuchsia-500/[0.04] to-transparent px-5 py-4 shadow-[0_18px_60px_rgba(124,58,237,0.08)]">
        <div className="flex flex-wrap items-center gap-3">
          <Portrait
            imageUrl={protagonistPortraitUrl}
            emoji={protagonistPortraitEmoji}
            size="md"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="truncate text-base font-semibold text-stone-100">
                {protagonistName || 'Protagonist'}
              </h1>
              {protagonistRole && (
                <span className="rounded-md border border-stone-800 bg-stone-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-stone-400">
                  {protagonistRole}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
              <span>{location.name}</span>
              {location.region && <span>· {location.region}</span>}
              {openingScene?.worldTime?.formattedTime && (
                <>
                  <span>·</span>
                  <span>{openingScene.worldTime.formattedTime}</span>
                </>
              )}
            </div>
          </div>

          {protagonistConditionState?.instances?.length ? (
            <div className="flex max-w-full flex-wrap items-center gap-1.5 border-t border-stone-900 pt-2">
              {protagonistConditionState.instances.slice(0, 4).map((condition) => (
                <span
                  key={condition.id}
                  className="rounded-md border border-stone-800 bg-stone-900/70 px-2 py-0.5 text-[10px] text-stone-400"
                  title={`Severity ${condition.severity} · Intensity ${condition.intensity}`}
                >
                  {condition.name}{condition.intensity > 1 ? ` ×${condition.intensity}` : ''}
                </span>
              ))}
              {protagonistConditionState.instances.length > 4 && (
                <span className="text-[10px] text-stone-600">
                  +{protagonistConditionState.instances.length - 4} more
                </span>
              )}
            </div>
          ) : null}

          {worldTitle && (
            <div className="hidden max-w-[210px] truncate text-right text-[11px] text-stone-600 md:block">
              {worldTitle}
            </div>
          )}
        </div>
      </header>

      {isLoadingOpening && (
        <div className="rounded-2xl border border-stone-800/80 bg-stone-950/70 px-5 py-8 text-center">
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-stone-500" />
          <p className="text-sm text-stone-300">Preparing the opening scene…</p>
          <p className="mt-1 text-xs text-stone-600">
            Grounding {protagonistName || 'your character'} in {location.name}.
          </p>
        </div>
      )}

      {openingError && !isLoadingOpening && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-900/70 bg-red-950/30 px-4 py-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-red-200">The opening scene could not be generated.</p>
            <p className="mt-1 text-xs text-red-300/70">{openingError}</p>
          </div>
          {onRetryOpening && (
            <button
              onClick={onRetryOpening}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-900 px-2.5 py-1.5 text-xs text-stone-300 transition hover:bg-stone-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Opening scene: one readable piece of narration */}
      {openingScene && (
        <section className="relative overflow-hidden rounded-3xl border border-violet-400/15 bg-gradient-to-br from-[#100a1c] via-[#0b0712] to-[#08050d] px-5 py-6 shadow-[0_24px_80px_rgba(124,58,237,0.10)] md:px-7 md:py-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-violet-300/70">Opening</p>
              <p className="mt-1 text-sm text-fuchsia-200/70">{openingScene.startingLocationName}</p>
            </div>
            <button
              onClick={() => handleReadAloud(openingScene.narrativeText)}
              disabled={isPlayingSpeech}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-900 px-2.5 py-1.5 text-xs text-stone-400 transition hover:text-stone-200 disabled:opacity-50"
            >
              <Headphones className="h-3.5 w-3.5" />
              {isPlayingSpeech ? 'Playing' : 'Listen'}
            </button>
          </div>

          <div className="space-y-3 font-serif text-[16px] leading-8 text-stone-100 md:text-lg md:leading-9">
            {openingScene.narrativeText.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {openingScene.startingSituation && (
            <div className="mt-4 border-l-2 border-fuchsia-400/35 pl-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-300/60">Right now</p>
              <p className="mt-1 text-sm italic leading-6 text-stone-400">{openingScene.startingSituation}</p>
            </div>
          )}
        </section>
      )}

      {/* Quiet world controls — deliberately kept out of the narrative flow. */}
      <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
        <Sparkles className="h-3.5 w-3.5 text-stone-600" />
        <span className="font-medium text-stone-400">{location.name}</span>
        {location.region && <span className="text-stone-700">· {location.region}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            disabled={isProcessingAction}
            onClick={onRequestInspect}
            className="rounded-lg px-2.5 py-1.5 text-stone-500 transition hover:bg-stone-900 hover:text-stone-200 disabled:opacity-50"
          >
            Inspect
          </button>
          <button
            disabled={isProcessingAction}
            onClick={onRequestRest}
            className="rounded-lg px-2.5 py-1.5 text-stone-500 transition hover:bg-stone-900 hover:text-stone-200 disabled:opacity-50"
          >
            Advance time
          </button>
        </div>
      </div>

      {activeDialogue && (() => {
        const theme = getCharacterSpeakerTheme(activeDialogue.speakerName, worldId, activeDialogue.speakerId);
        return (
          <section className={`relative rounded-3xl border ${theme.bubbleBorder} bg-white/[0.025] px-5 py-6 shadow-[0_16px_50px_rgba(0,0,0,0.22)] md:px-7`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full border ${theme.badgeBorder} ${theme.badgeBg} text-lg`}>
                  💬
                </div>
                <div>
                  <p className={`text-sm font-semibold ${theme.nameColor}`}>{activeDialogue.speakerName}</p>
                  <p className="text-[10px] text-stone-500">{activeDialogue.epistemicNote}</p>
                </div>
              </div>
              <button
                onClick={() => handleReadAloud(activeDialogue.text, activeDialogue.speakerName)}
                disabled={isPlayingSpeech}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-900 px-2.5 py-1.5 text-xs text-stone-400 transition hover:text-stone-200 disabled:opacity-50"
              >
                <Volume2 className="h-3.5 w-3.5" />
                Listen
              </button>
            </div>

            <p className="border-l border-stone-700 pl-3 font-serif text-lg italic leading-8 text-white md:text-xl">
              “{activeDialogue.text}”
            </p>

            <div className="mt-4 space-y-2">
              {activeDialogue.choices.map((choice) => (
                <button
                  key={choice.id}
                  disabled={isProcessingAction}
                  onClick={() => onSelectChoice(choice)}
                  className="group flex w-full items-start justify-between gap-4 rounded-xl border border-violet-400/10 bg-gradient-to-r from-white/[0.025] to-violet-500/[0.035] px-4 py-3 text-left transition hover:border-violet-400/25 hover:bg-violet-500/[0.07] disabled:opacity-50"
                >
                  <span className="flex items-start gap-2.5">
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-stone-600 transition group-hover:text-stone-300" />
                    <span className="text-sm text-stone-300 group-hover:text-stone-100">{choice.label}</span>
                  </span>
                  <span className="hidden text-[10px] uppercase tracking-wide text-stone-600 sm:inline">{choice.intent}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })()}

      {pendingActionAdvice?.simulation && (
        <section className={`rounded-2xl border px-4 py-4 shadow-sm ${pendingActionAdvice.proposal ? 'border-amber-800/70 bg-amber-950/20' : 'border-sky-800/60 bg-sky-950/20'}`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {pendingActionAdvice.proposal ? <Sparkles className="h-4 w-4 text-amber-300" /> : <AlertCircle className="h-4 w-4 text-sky-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${pendingActionAdvice.proposal ? 'text-amber-400' : pendingActionAdvice.simulation.status === 'WORLD_FORBIDDEN' ? 'text-red-400' : 'text-sky-400'}`}>
                {pendingActionAdvice.proposal
                  ? 'Potential technique'
                  : pendingActionAdvice.simulation.status === 'WORLD_FORBIDDEN'
                  ? 'Unavailable in this world'
                  : pendingActionAdvice.simulation.status === 'CHARACTER_INCOMPATIBLE'
                  ? 'Not currently learnable'
                  : 'Capability simulation'}
              </p>
              <h3 className="mt-1 text-base font-semibold text-stone-100">
                {pendingActionAdvice.proposal?.alternative?.name || pendingActionAdvice.simulation.candidateCapability?.name || 'Requested capability'}
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-300">{pendingActionAdvice.simulation.explanation}</p>
              {pendingActionAdvice.simulation.blockers.length > 0 && (
                <div className="mt-3 space-y-1">
                  {pendingActionAdvice.simulation.blockers.slice(0, 4).map((blocker) => (
                    <p key={blocker} className="text-xs text-stone-400">• {blocker}</p>
                  ))}
                </div>
              )}
              {pendingActionAdvice.simulation.developmentPath.length > 0 && (
                <div className="mt-3 rounded-xl border border-white/7 bg-black/15 p-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-stone-600">Development path</p>
                  {pendingActionAdvice.simulation.developmentPath.slice(0, 3).map((step) => (
                    <p key={step} className="mt-1 text-xs text-stone-400">{step}</p>
                  ))}
                </div>
              )}
              {pendingActionAdvice.proposal && (
                <p className="mt-3 text-xs text-amber-200/75">This is not learned yet. Choosing the action below is the explicit acquisition decision.</p>
              )}
            </div>
            {pendingActionAdvice.proposal && (
              <div className="flex shrink-0 flex-col gap-2">
                <button type="button" onClick={() => onAcceptActionAdvice?.(pendingActionAdvice)} disabled={isProcessingAction} className="rounded-lg bg-amber-200 px-3 py-2 text-xs font-semibold text-stone-950 transition hover:bg-amber-100 disabled:opacity-50">{pendingActionAdvice.proposal.acceptLabel}</button>
                <button type="button" onClick={() => onRejectActionAdvice?.(pendingActionAdvice)} disabled={isProcessingAction} className="rounded-lg border border-stone-800 bg-stone-900 px-3 py-2 text-xs text-stone-300 transition hover:bg-stone-800 disabled:opacity-50">{pendingActionAdvice.proposal.rejectLabel}</button>
              </div>
            )}
            {!pendingActionAdvice.proposal && (
              <button type="button" onClick={() => onRejectActionAdvice?.(pendingActionAdvice)} className="rounded-lg border border-stone-800 bg-stone-900 p-2 text-stone-500 hover:text-stone-200" aria-label="Dismiss capability simulation">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>
      )}

      {combatTransition && (
        <section className="rounded-3xl border border-red-500/25 bg-gradient-to-br from-red-950/30 via-stone-950/80 to-stone-950/90 px-4 py-5 shadow-[0_18px_60px_rgba(127,29,29,0.14)] md:px-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
              <Dices className="h-5 w-5 text-red-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300/80">Combat transition</p>
              <h3 className="mt-1 text-base font-semibold text-stone-100">{combatTransition.phase === 'PRECOMBAT' ? 'A hostile encounter is unfolding' : combatTransition.phase === 'ENDED' ? 'Combat ended' : 'Combat initiated'}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-300">{combatTransition.narrativeLeadIn || combatTransition.continuationNarrative || 'The encounter is moving from narration into tactical resolution.'}</p>
              {combatTransition.precombatResolution && (
                <div className="mt-3 rounded-2xl border border-violet-500/20 bg-black/20 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-violet-300/70">Mechanical result</div>
                  <div className="mt-1 text-sm font-semibold text-stone-100">{combatTransition.precombatResolution.actionLabel}</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {combatTransition.precombatResolution.rolls.map((roll, index) => (
                      <div key={roll.label + index} className="rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2">
                        <div className="text-[10px] uppercase text-stone-600">{roll.label}</div>
                        <div className="mt-1 text-lg font-bold text-amber-300">{roll.total ?? '—'}</div>
                        {roll.roll?.individualDice?.length ? <div className="text-[10px] font-mono text-stone-500">dice: {roll.roll.individualDice.join(', ')}</div> : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-stone-300">{combatTransition.precombatResolution.mechanicalSummary}</div>
                  {combatTransition.precombatResolution.targetHp?.map((hp) => (
                    <div key={hp.targetId} className="mt-2 flex items-center justify-between rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2 text-xs">
                      <span className="text-stone-500">{hp.targetId}</span>
                      <span className="font-mono text-red-300">{hp.hpCurrent}/{hp.hpMax} HP</span>
                    </div>
                  ))}
                </div>
              )}
              {combatTransition.precombatResolution?.narrativeResponse && (
                <p className="mt-3 font-serif text-sm leading-6 text-stone-200">{combatTransition.precombatResolution.narrativeResponse}</p>
              )}
              {combatTransition.phase !== 'ENDED' ? (
                <button
                  type="button"
                  onClick={combatTransition.precombatActionPending ? onEnterCombat : onEnterCombat}
                  disabled={isProcessingAction || !onEnterCombat}
                  className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                >
                  {combatTransition.precombatActionPending ? 'Resolve opening action' : 'Enter tactical combat'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onEnterCombat}
                  disabled={!onEnterCombat}
                  className="mt-4 rounded-xl bg-violet-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-600 disabled:opacity-50"
                >
                  Return to narration
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      {(() => {
        const history = (actionHistory || [])
          .filter((entry) => !(entry.actionType === 'NOTE_RECORD' && entry.id.includes('act_open_')))
          .slice()
          .reverse();
        const visible = history.slice(Math.max(0, history.length - visibleTurnCount));
        const olderCount = Math.max(0, history.length - visible.length);

        return (
          <section className="space-y-4" aria-label="Story conversation">
            {olderCount > 0 && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleTurnCount((count) => count + 12)}
                  className="rounded-full border border-violet-400/15 bg-violet-500/[0.045] px-4 py-2 text-xs font-medium text-violet-200/80 transition hover:border-violet-400/30 hover:bg-violet-500/[0.09] hover:text-white"
                >
                  Load {Math.min(12, olderCount)} earlier turns
                </button>
              </div>
            )}

            {visible.map((entry) => {
              const narration = entry.narrativeResponse || (
                entry.epistemicValidation === 'REJECTED_BY_ENGINE'
                  ? 'The action could not be carried out.'
                  : entry.authoritativeFeedback || ''
              );
              if (!entry.description && !narration) return null;

              return (
                <div key={entry.id} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[88%] rounded-3xl rounded-br-md border border-fuchsia-400/15 bg-gradient-to-br from-fuchsia-500/[0.10] to-violet-500/[0.06] px-5 py-3 shadow-[0_12px_40px_rgba(236,72,153,0.06)]">
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300/55">You</p>
                      <p className="text-sm leading-6 text-stone-100">{entry.description}</p>
                    </div>
                  </div>

                  {entry.checkResult && (
                    <StoryCheckCard
                      check={entry.checkResult}
                      revealed={Boolean(revealedCheckIds[entry.id])}
                      onReveal={() => setRevealedCheckIds((current) => ({ ...current, [entry.id]: true }))}
                    />
                  )}

                  {narration && (
                    <div className="max-w-[94%] rounded-3xl rounded-tl-md border border-violet-400/15 bg-gradient-to-br from-violet-500/[0.065] via-white/[0.018] to-fuchsia-500/[0.025] px-5 py-5 shadow-[0_14px_45px_rgba(124,58,237,0.06)]">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-300/60">Narrator</p>
                        {entry.narrativeResponse && (
                          <button
                            type="button"
                            onClick={() => handleReadAloud(entry.narrativeResponse || '')}
                            disabled={isPlayingSpeech}
                            className="inline-flex items-center gap-1.5 text-[10px] text-stone-500 transition hover:text-stone-200 disabled:opacity-50"
                          >
                            <Headphones className="h-3 w-3" />
                            Listen
                          </button>
                        )}
                      </div>
                      <p className="whitespace-pre-line font-serif text-[15px] leading-8 text-stone-100 md:text-base md:leading-8">
                        {narration}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })()}
      <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.08] via-fuchsia-500/[0.035] to-transparent px-4 py-4 shadow-[0_18px_60px_rgba(124,58,237,0.10)] md:px-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-violet-300/70">Your turn</p>
            <p className="mt-1 text-base font-serif text-white">What do you do?</p>
          </div>
        </div>

        <form onSubmit={handleSubmitAction} className="flex items-center gap-2">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setSceneMenuOpen((value) => !value);
                setSceneChoiceOpen(false);
                setSuggestionsOpen(false);
                setSceneError(null);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-400/15 bg-violet-500/10 text-violet-200 transition hover:bg-violet-500/15"
              aria-label="Open story tools"
              title="Story tools"
            >
              <Plus className="h-5 w-5" />
            </button>

            {sceneMenuOpen && (
              <div className="absolute bottom-14 left-0 z-50 w-72 rounded-2xl border border-white/10 bg-[#110b1d] p-2 shadow-2xl">
                <button
                  type="button"
                  onClick={() => setSuggestionsOpen((value) => !value)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-stone-200 hover:bg-violet-500/10"
                >
                  <Sparkles className="h-4 w-4 text-violet-300" />
                  <span className="flex-1">Suggestions</span>
                  <span className="text-[10px] text-stone-600">{actionTips.length}</span>
                </button>

                {suggestionsOpen && (
                  <div className="mt-1 max-h-80 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-1">
                    {actionTips.length > 0 ? (
                      actionTips.slice(0, 6).map((tip) => (
                        <button
                          key={tip.id}
                          type="button"
                          onClick={() => insertSuggestedAction(tip.actionText)}
                          disabled={isProcessingAction}
                          className="w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.04] disabled:opacity-50"
                        >
                          <p className="text-xs font-semibold text-stone-200">{tip.title}</p>
                          <p className="mt-1 text-[11px] leading-4 text-stone-500">{tip.description}</p>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-3 text-xs text-stone-500">
                        No suggestions are available yet.
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSceneChoiceOpen(true);
                    setSuggestionsOpen(false);
                  }}
                  className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-stone-200 hover:bg-violet-500/10"
                >
                  <Sparkles className="h-4 w-4 text-violet-300" />
                  Generate Scene
                </button>

                {sceneChoiceOpen && (
                  <div className="mt-1 rounded-xl border border-white/8 bg-black/20 p-1">
                    <button type="button" onClick={requestSceneImage} disabled={sceneLoading} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-stone-300 hover:bg-white/[0.04] disabled:opacity-50">
                      <ImageIcon className="h-4 w-4 text-fuchsia-300" />
                      Generate Image
                    </button>
                    <button type="button" onClick={requestScenePrompt} disabled={sceneLoading} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-stone-300 hover:bg-white/[0.04] disabled:opacity-50">
                      <FileText className="h-4 w-4 text-sky-300" />
                      Generate Prompt
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing || isProcessingAction}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-50 ${
              isRecording
                ? 'border-red-800 bg-red-950/50 text-red-300'
                : 'border-stone-800 bg-stone-900 text-stone-400 hover:text-stone-200'
            }`}
            aria-label="Dictate action"
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>

          <input
            type="text"
            value={typedAction}
            onChange={(event) => setTypedAction(event.target.value)}
            disabled={isProcessingAction || isRecording}
            placeholder={
              isRecording
                ? 'Listening…'
                : isTranscribing
                ? 'Transcribing…'
                : isProcessingAction
                ? 'The world is responding…'
                : 'Describe what you do…'
            }
            className="h-12 min-w-0 flex-1 rounded-2xl border border-violet-400/10 bg-black/20 px-4 text-sm text-stone-100 placeholder:text-stone-600 focus:border-violet-400/40 focus:outline-none focus:ring-2 focus:ring-violet-500/10"
          />

          <button
            type="submit"
            disabled={!typedAction.trim() || isProcessingAction || isRecording}
            className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-300 to-fuchsia-300 px-5 text-sm font-semibold text-[#160b22] transition hover:from-violet-200 hover:to-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isProcessingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>

        {transcriptionError && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            {transcriptionError}
          </p>
        )}
      </section>

      {(scenePrompt || sceneImageUrl || sceneError) && (
        <section className="rounded-3xl border border-white/8 bg-[#0b0813]/75 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-600">Current-scene comic</p>
              <p className="mt-1 text-sm font-semibold text-stone-200">Built from the latest turn only</p>
            </div>
            {sceneLoading && <Loader2 className="h-4 w-4 animate-spin text-violet-300" />}
          </div>
          {sceneError && <p className="mt-3 text-xs text-red-300">{sceneError}</p>}
          {sceneImageUrl && (
            <img src={sceneImageUrl} alt="Current story scene comic page" className="mt-4 w-full rounded-2xl border border-white/8" />
          )}
          {scenePrompt && (
            <details className="mt-4 rounded-2xl border border-white/7 bg-black/15 p-3">
              <summary className="cursor-pointer text-xs font-medium text-stone-400">View generated prompt</summary>
              <pre className="mt-3 whitespace-pre-wrap text-xs leading-5 text-stone-500">{scenePrompt}</pre>
            </details>
          )}
        </section>
      )}

      {/* Past dialogue is intentionally omitted here; active dialogue remains above. */}
    </div>
  );
};
