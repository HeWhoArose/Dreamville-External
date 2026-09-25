import React, { useEffect, useRef, useState } from 'react';
import {
  Location,
  DialogueNode,
  DialogueChoice,
  ActionLog,
  OpeningScene,
  CharacterStartingConditionState,
  ActionAdvice,
  ActionTip,
} from '../types';
import { useAudioHaptic } from './AudioHapticManager';
import { getCharacterSpeakerTheme } from './voiceResolver';
import { DiceRollAnimation } from './common/DiceRollAnimation';
import { StoryHUDDrawer } from './StoryHUDDrawer';
import { apiClient } from '../services/apiClient';
import {
  AlertCircle,
  ArrowRight,
  Compass,
  Dices,
  Headphones,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
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
  storyId?: string;
  protagonistName?: string;
  protagonistRole?: string;
  protagonistPortraitUrl?: string;
  protagonistPortraitEmoji?: string;
  protagonistConditionState?: CharacterStartingConditionState;
  isLoadingOpening?: boolean;
  openingError?: string | null;
  onRetryOpening?: () => void;
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
  storyId,
  protagonistName,
  protagonistRole,
  protagonistPortraitUrl,
  protagonistPortraitEmoji,
  protagonistConditionState,
  isLoadingOpening = false,
  openingError = null,
  onRetryOpening,
}) => {
  const { playSpeech, isPlayingSpeech, triggerHaptic, playSfx } = useAudioHaptic();

  const [typedAction, setTypedAction] = useState('');
  const [aiRoutingStatus, setAiRoutingStatus] = useState<string>('Auto');
  const [narrationModels, setNarrationModels] = useState<any[]>([]);
  const [selectedNarrationModelKey, setSelectedNarrationModelKey] = useState<string>('');
  const [narrationModelBusy, setNarrationModelBusy] = useState(false);
  const [aiRoutingUsage, setAiRoutingUsage] = useState<{ requests: number; totalTokens: number } | null>(null);
  const [lastAiTelemetry, setLastAiTelemetry] = useState<any | null>(null);
  const [revealedCheckIds, setRevealedCheckIds] = useState<Record<string, boolean>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const refreshAiRouting = async () => {
    try {
      const [operations, telemetry, modelCatalog] = await Promise.all([
        apiClient.getOrchestratorOperations(),
        apiClient.getOrchestratorTelemetry(),
        apiClient.getOrchestratorModels(),
      ]);
      const narrationCategory = operations?.operations?.categories?.find(
        (category: any) => category.category === 'narration'
      );
      setAiRoutingStatus(narrationCategory?.mode === 'MANUAL' ? 'Manual' : 'Auto');
      setSelectedNarrationModelKey(narrationCategory?.activeModelKey || '');
      const narrationTask = 'narrative.generate';
      const eligibleModels = (modelCatalog?.models || []).filter((model: any) => {
        const roles = Array.isArray(model.roleEligibility) ? model.roleEligibility : Array.isArray(model.roles) ? model.roles : [];
        const health = model?.runtime?.operationalStatus || model.health;
        return roles.includes(narrationTask) && health !== 'UNAVAILABLE' && health !== 'DISABLED';
      });
      setNarrationModels(eligibleModels);

      const safeTelemetry = operations?.operations?.safeTelemetry;
      if (safeTelemetry) {
        setAiRoutingUsage({
          requests: Number(safeTelemetry.totalRequests || 0),
          totalTokens: Number(safeTelemetry.totalTokens || 0),
        });
      }
      setLastAiTelemetry(telemetry?.lastTurnTelemetry || null);
    } catch {
      // AI routing UI is advisory; gameplay remains functional when telemetry is unavailable.
    }
  };

  useEffect(() => {
    refreshAiRouting();
  }, [storyId, isProcessingAction]);

  const handleNarrationModelChange = async (modelKey: string) => {
    setNarrationModelBusy(true);
    try {
      await apiClient.setOrchestratorCategoryModel({
        category: 'narration',
        modelKey: modelKey || null,
      });
      await refreshAiRouting();
    } catch {
      setTranscriptionError('Unable to update the narration model. Auto mode remains available.');
    } finally {
      setNarrationModelBusy(false);
    }
  };

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

  const handleReadAloud = (text: string, speakerId = 'narrator') => {
    triggerHaptic('light');
    playSpeech(text, speakerId);
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-10 text-stone-100">
      <StoryHUDDrawer storyId={storyId} />

      {/* Quiet identity bar */}
      <header className="rounded-2xl border border-stone-800/80 bg-stone-950/80 px-4 py-3 shadow-sm">
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
        <section className="rounded-2xl border border-stone-800/80 bg-stone-950/70 px-5 py-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-600">Opening</p>
              <p className="mt-1 text-xs text-stone-500">{openingScene.startingLocationName}</p>
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

          <div className="space-y-3 font-serif text-[15px] leading-7 text-stone-200 md:text-base">
            {openingScene.narrativeText.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {openingScene.startingSituation && (
            <div className="mt-4 border-l border-stone-700 pl-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-stone-600">Right now</p>
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
          <section className={`rounded-2xl border ${theme.bubbleBorder} bg-stone-950/80 px-5 py-5`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full border ${theme.badgeBorder} ${theme.badgeBg} text-lg`}>
                  💬
                </div>
                <div>
                  <p className={`text-sm font-semibold ${theme.nameColor}`}>{activeDialogue.speakerName}</p>
                  <p className="text-[10px] text-stone-600">{activeDialogue.epistemicNote}</p>
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

            <p className="border-l border-stone-700 pl-3 font-serif text-base italic leading-7 text-stone-200">
              “{activeDialogue.text}”
            </p>

            <div className="mt-4 space-y-2">
              {activeDialogue.choices.map((choice) => (
                <button
                  key={choice.id}
                  disabled={isProcessingAction}
                  onClick={() => onSelectChoice(choice)}
                  className="group flex w-full items-start justify-between gap-4 rounded-xl border border-stone-800 bg-stone-900/60 px-4 py-3 text-left transition hover:bg-stone-900 disabled:opacity-50"
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

      {pendingActionAdvice?.proposal && (
        <section className="rounded-2xl border border-amber-800/70 bg-amber-950/20 px-4 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-500">Capability suggestion</p>
              <h3 className="mt-1 text-base font-semibold text-amber-100">{pendingActionAdvice.proposal.alternative.name}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-300">{pendingActionAdvice.proposal.reasonRequestedCapabilityUnavailable}</p>
              <p className="mt-2 text-sm leading-6 text-stone-200">{pendingActionAdvice.proposal.alternative.description}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-stone-500">
                {pendingActionAdvice.proposal.alternative.category && <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">{pendingActionAdvice.proposal.alternative.category}</span>}
                {pendingActionAdvice.proposal.alternative.powerTier && <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">{pendingActionAdvice.proposal.alternative.powerTier}</span>}
                {pendingActionAdvice.proposal.alternative.actionType && <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">{pendingActionAdvice.proposal.alternative.actionType}</span>}
                {pendingActionAdvice.proposal.alternative.rangeScope && <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">{pendingActionAdvice.proposal.alternative.rangeScope}</span>}
                {pendingActionAdvice.proposal.alternative.effectDefinition?.damageType && <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">{pendingActionAdvice.proposal.alternative.effectDefinition.damageType}</span>}
                {pendingActionAdvice.proposal.alternative.effectDefinition?.damageFormula && <span className="rounded-md border border-stone-800 bg-stone-950 px-2 py-1">{pendingActionAdvice.proposal.alternative.effectDefinition.damageFormula}</span>}
              </div>
              {Array.isArray(pendingActionAdvice.proposal.alternative.generatedSkills) && pendingActionAdvice.proposal.alternative.generatedSkills.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Derived techniques</p>
                  {pendingActionAdvice.proposal.alternative.generatedSkills.slice(0, 3).map((skill: any) => (
                    <p key={skill.name} className="text-xs text-stone-400"><span className="font-medium text-stone-300">{skill.name}</span>{skill.description ? ' — ' + skill.description : ''}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button type="button" onClick={() => onAcceptActionAdvice?.(pendingActionAdvice)} disabled={isProcessingAction} className="rounded-lg bg-amber-200 px-3 py-2 text-xs font-semibold text-stone-950 transition hover:bg-amber-100 disabled:opacity-50">{pendingActionAdvice.proposal.acceptLabel}</button>
              <button type="button" onClick={() => onRejectActionAdvice?.(pendingActionAdvice)} disabled={isProcessingAction} className="rounded-lg border border-stone-800 bg-stone-900 px-3 py-2 text-xs text-stone-300 transition hover:bg-stone-800 disabled:opacity-50">{pendingActionAdvice.proposal.rejectLabel}</button>
            </div>
          </div>
        </section>
      )}

      {(actionTips.length > 0 || actionHistory.some((action) => (action.actionAdvice?.tips || []).length > 0)) && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="h-3.5 w-3.5 text-stone-600" />
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-600">Possible approaches</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(actionTips.length > 0
              ? actionTips
              : actionHistory.slice(0, 2).flatMap((action) => action.actionAdvice?.tips || [])
            ).slice(0, 4).map((tip) => (
              <button
                key={tip.id}
                type="button"
                onClick={() => onCustomAction?.(tip.actionText)}
                disabled={isProcessingAction}
                className="w-full rounded-xl border border-stone-800 bg-stone-950/70 px-4 py-3 text-left transition hover:border-stone-700 hover:bg-stone-900 disabled:opacity-50"
              >
                <p className="text-xs font-semibold text-stone-200">{tip.title}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">{tip.description}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Main interaction: deliberately obvious and simple. */}
      <section className="rounded-2xl border border-stone-700/80 bg-stone-950 px-4 py-4 shadow-md md:px-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Your turn</p>
            <p className="mt-1 text-sm text-stone-300">What do you do?</p>
          </div>
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            {(() => {
              const tokenText = aiRoutingUsage
                ? `${aiRoutingUsage.totalTokens.toLocaleString()} tok`
                : 'usage n/a';
              const lastModel = lastAiTelemetry?.selectedModelId;
              return (
                <>
                  <span
                    className="hidden text-[10px] text-stone-600 sm:inline"
                    title="DreamBook AI stays outside canonical world state."
                  >
                    {lastModel ? `Last: ${lastModel} · ${lastAiTelemetry?.latencyMs || 0}ms` : tokenText}
                  </span>
                  <label
                    className="flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-900 px-2 py-1 text-[10px] text-stone-400"
                    title="Narration model selection is scoped to the narration category only."
                  >
                    <span>Narration</span>
                    <select
                      aria-label="Narration model"
                      value={selectedNarrationModelKey}
                      disabled={narrationModelBusy || narrationModels.length === 0}
                      onChange={(event) => void handleNarrationModelChange(event.target.value)}
                      className="max-w-[180px] bg-transparent text-[10px] text-stone-300 outline-none"
                    >
                      <option value="">Auto</option>
                      {narrationModels.map((model: any) => (
                        <option
                          key={model.providerId + '::' + model.modelId}
                          value={model.providerId + '::' + model.modelId}
                        >
                          {model.displayName || model.modelId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-[10px] text-stone-700">
                    {aiRoutingStatus} · {tokenText}
                  </span>
                </>
              );
            })()}
          </div>
        </div>

        <form onSubmit={handleSubmitAction} className="flex items-center gap-2">
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
            className="h-11 min-w-0 flex-1 rounded-xl border border-stone-800 bg-stone-900/80 px-4 text-sm text-stone-100 placeholder:text-stone-600 focus:border-stone-600 focus:outline-none"
          />

          <button
            type="submit"
            disabled={!typedAction.trim() || isProcessingAction || isRecording}
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-stone-100 px-4 text-sm font-semibold text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
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

      {/* Narrative feed: action first, engine implementation details hidden. */}
      {(dialogueHistory.length > 0 || actionHistory.length > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-600">Recent actions</p>
            <span className="text-[10px] text-stone-700">
              {actionHistory.length} actions
            </span>
          </div>

          <div className="space-y-3">
            {actionHistory.slice(0, 4).map((action) => (
              <article key={action.id} className="space-y-2">
                <div className="flex items-start gap-2.5">
                  <Portrait
                    imageUrl={protagonistPortraitUrl}
                    emoji={protagonistPortraitEmoji}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-stone-800 bg-stone-900/70 px-4 py-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-stone-400">{protagonistName || 'You'}</span>
                      <span className="text-[10px] text-stone-700">{action.timestamp}</span>
                    </div>
                    <p className="text-sm leading-6 text-stone-300">“{action.description}”</p>
                  </div>
                </div>

                {action.checkResult && (
                  <StoryCheckCard
                    check={action.checkResult}
                    revealed={Boolean(revealedCheckIds[action.id])}
                    onReveal={() => setRevealedCheckIds((current) => ({ ...current, [action.id]: true }))}
                  />
                )}

                {(!action.checkResult || revealedCheckIds[action.id]) &&
                  (action.narrativeResponse || action.authoritativeFeedback) && (
                    <div className="ml-[3.25rem] rounded-2xl rounded-tl-md border border-stone-800/80 bg-stone-950/60 px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-stone-600">Narrator</span>
                      </div>
                      <p className="whitespace-pre-line font-serif text-sm leading-6 text-stone-200">
                        {action.narrativeResponse || (
                          action.epistemicValidation === 'REJECTED_BY_ENGINE'
                            ? 'That action could not be carried out.'
                            : action.authoritativeFeedback
                        )}
                      </p>
                      {action.narrativeResponse && (
                        <button
                          onClick={() => handleReadAloud(action.narrativeResponse || '')}
                          disabled={isPlayingSpeech}
                          className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-stone-600 transition hover:text-stone-300 disabled:opacity-50"
                        >
                          <Headphones className="h-3 w-3" />
                          Listen
                        </button>
                      )}
                    </div>
                  )}
              </article>
            ))}

            {/* Past dialogue is intentionally omitted here; active dialogue remains above. */}
          </div>
        </section>
      )}
    </div>
  );
};
