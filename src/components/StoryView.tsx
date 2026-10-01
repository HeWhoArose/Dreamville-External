import React, { useRef, useState, useEffect, useCallback } from 'react';
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
import { DICE_THEME_PRESETS } from './common/diceThemes';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Dices,
  FileText,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Pencil,
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
  onRefreshSuggestions?: () => void | Promise<void>;
  isRefreshingSuggestions?: boolean;
  actionError?: string | null;
  onRetryLastAction?: () => void;
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
  combatTransition?: CombatTransitionState | null;
  onEnterCombat?: () => void;
  onNarrationUpdated?: (viewState: import('../types').ExternalViewState) => void;
}

export function shouldShowNarrationForAction(hasCheck: boolean, revealed: boolean, hasNarration: boolean): boolean {
	return hasNarration && (!hasCheck || revealed);
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
      <DiceRollAnimation
			roll={check.roll}
			onComplete={onReveal}
			title={check.testType === 'SAVING_THROW' ? `${check.ability} Saving Throw` : `${check.skill} Check`}
			subtitle={`${check.roll.formula} · ${check.ability}`}
			defenseLabel="DC"
			defenseValue={check.difficultyClass}
			outcome={revealed ? (check.success ? 'SUCCESS' : 'FAILURE') : 'NEUTRAL'}
			showRollButton
			revealedOverride={revealed}
		/>
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
          <div className="mt-2 space-y-1.5">
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
  onRefreshSuggestions,
  isRefreshingSuggestions = false,
  actionError,
  onRetryLastAction,
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
  combatTransition = null,
  onEnterCombat,
  onNarrationUpdated,
}) => {
  const { playSpeech, isPlayingSpeech, triggerHaptic, playSfx, settings, updateSettings } = useAudioHaptic();

  const [typedAction, setTypedAction] = useState('');
  const [inputMode, setInputMode] = useState<'STORY' | 'OOC'>('STORY');
  const [oocHistory, setOocHistory] = useState<Array<{ role: 'player' | 'assistant'; text: string }>>([]);
  const [isProcessingOoc, setIsProcessingOoc] = useState(false);
  const [revealedCheckIds, setRevealedCheckIds] = useState<Record<string, boolean>>({});
  const [visibleTurnCount, setVisibleTurnCount] = useState(12);

  const checkRevealStorageKey = storyId ? `dreamville:revealed-checks:${storyId}` : null;
  const checkIdsForPersistence = actionHistory
    .filter((entry) => Boolean(entry.checkResult))
    .map((entry) => entry.id)
    .join('|');

  useEffect(() => {
    if (!checkRevealStorageKey) {
      setRevealedCheckIds({});
      return;
    }

    try {
      const raw = window.sessionStorage.getItem(checkRevealStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const validIds = new Set(
        actionHistory
          .filter((entry) => Boolean(entry.checkResult))
          .map((entry) => entry.id),
      );
      const restored = Object.fromEntries(
        Object.entries(parsed || {}).filter(([id, revealed]) => validIds.has(id) && revealed === true),
      ) as Record<string, boolean>;
      setRevealedCheckIds(restored);
    } catch {
      setRevealedCheckIds({});
    }
  }, [checkRevealStorageKey, checkIdsForPersistence]);

  const revealCheck = useCallback((actionId: string) => {
    setRevealedCheckIds((current) => {
      const next = { ...current, [actionId]: true };
      if (checkRevealStorageKey) {
        try {
          window.sessionStorage.setItem(checkRevealStorageKey, JSON.stringify(next));
        } catch {
          // Session storage is optional; the in-memory state remains authoritative for this mount.
        }
      }
      return next;
    });
  }, [checkRevealStorageKey]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [diceSettingsOpen, setDiceSettingsOpen] = useState(false);
  const [sceneChoiceOpen, setSceneChoiceOpen] = useState(false);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [scenePrompt, setScenePrompt] = useState<string | null>(null);
  const [sceneImageUrl, setSceneImageUrl] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [narrationBusyActionId, setNarrationBusyActionId] = useState<string | null>(null);
  const [narrationEditActionId, setNarrationEditActionId] = useState<string | null>(null);
  const [narrationEditInstruction, setNarrationEditInstruction] = useState('');
  const [narrationPickerOpen, setNarrationPickerOpen] = useState(false);
  const [narrationModels, setNarrationModels] = useState<any[]>([]);
  const [narrationCategoryState, setNarrationCategoryState] = useState<any | null>(null);
  const [narrationModelLoading, setNarrationModelLoading] = useState(false);
  const [narrationModelError, setNarrationModelError] = useState<string | null>(null);
  const [narrationLastExecution, setNarrationLastExecution] = useState<any | null>(null);
  const [narrationCurrentOperation, setNarrationCurrentOperation] = useState<any | null>(null);
  const [actionEditActionId, setActionEditActionId] = useState<string | null>(null);
  const [actionEditText, setActionEditText] = useState('');
  const [actionEditBusy, setActionEditBusy] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const narrationMenuRef = useRef<HTMLDivElement | null>(null);
  const storyTimelineEndRef = useRef<HTMLDivElement | null>(null);
  const userWasNearStoryEndRef = useRef(true);
  const previousActionCountRef = useRef(actionHistory.length);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const actionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const speechRecognitionRef = useRef<any | null>(null);

  useEffect(() => {
    loadNarrationModels();
  }, []);

  useEffect(() => {
    if (!sceneMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && narrationMenuRef.current?.contains(target)) return;
      setSceneMenuOpen(false);
      setSuggestionsOpen(false);
      setDiceSettingsOpen(false);
      setSceneChoiceOpen(false);
      setNarrationPickerOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [sceneMenuOpen]);

  const resolveModelDisplayName = useCallback(
    (entry?: ActionLog) => {
      const rawModelId =
        entry?.narrativeGeneration?.modelId || entry?.narrativeError?.modelId;

      if (rawModelId) {
        const matched = narrationModels.find(
          (m: any) =>
            m.modelId === rawModelId ||
            `${m.providerId}::${m.modelId}` === rawModelId ||
            m.id === rawModelId
        );
        if (matched?.displayName) return matched.displayName;
        if (rawModelId === 'local-story-fallback' || rawModelId === 'provider_local_story_fallback::local-story-fallback') {
          return 'Local Story Fallback';
        }
        if (rawModelId.includes('gemini')) {
          return rawModelId.replace(/^models\//, '').replace(/^google\//, '');
        }
        return rawModelId.split('::').pop()?.split('/').pop() || rawModelId;
      }

      if (narrationCategoryState?.activeModelKey) {
        const activeKey = narrationCategoryState.activeModelKey;
        const matched = narrationModels.find(
          (m: any) =>
            m.modelId === activeKey ||
            `${m.providerId}::${m.modelId}` === activeKey ||
            m.id === activeKey
        );
        if (matched?.displayName) return matched.displayName;
        return activeKey.split('::').pop()?.split('/').pop() || activeKey;
      }

      if (narrationCategoryState?.fallbackChain?.length) {
        const primary = narrationCategoryState.fallbackChain[0];
        const matched = narrationModels.find(
          (m: any) =>
            m.modelId === primary ||
            `${m.providerId}::${m.modelId}` === primary ||
            m.id === primary
        );
        if (matched?.displayName) return matched.displayName;
        return primary.split('::').pop()?.split('/').pop() || primary;
      }

      return 'Gemini 2.5 Flash';
    },
    [narrationModels, narrationCategoryState]
  );

  const startRecording = async () => {
    setTranscriptionError(null);
    triggerHaptic('light');

    const SpeechRecognitionCtor =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (SpeechRecognitionCtor) {
      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = navigator.language || 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          let finalText = '';
          for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (result?.isFinal) {
              finalText += String(result[0]?.transcript || '');
            }
          }

          const normalized = finalText.trim();
          if (normalized) {
            setTypedAction((previous) => (previous ? `${previous} ${normalized}` : normalized));
            triggerHaptic('medium');
          }
        };
        recognition.onerror = (event: any) => {
          if (event?.error !== 'aborted') {
            const reason =
              event?.error === 'not-allowed'
                ? 'Microphone permission was denied. Allow microphone access and try again.'
                : event?.error === 'audio-capture'
                ? 'No usable microphone was found.'
                : `Voice transcription failed: ${event?.error || 'unknown error'}.`;
            setTranscriptionError(reason);
          }
          setIsRecording(false);
          speechRecognitionRef.current = null;
        };
        recognition.onend = () => {
          setIsRecording(false);
          speechRecognitionRef.current = null;
        };

        speechRecognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
        return;
      } catch (error) {
        speechRecognitionRef.current = null;
        setTranscriptionError(
          error instanceof Error
            ? `Could not start microphone transcription: ${error.message}`
            : 'Could not start microphone transcription.',
        );
        return;
      }
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setTranscriptionError(
        'Voice transcription is not available in this browser. Use a browser with microphone and speech-recognition support.',
      );
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
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });

        try {
          const base64Audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Failed to read the microphone recording.'));
            reader.onloadend = () => resolve((reader.result as string)?.split(',')[1] || '');
            reader.readAsDataURL(audioBlob);
          });

          if (!base64Audio) {
            throw new Error('The microphone recording was empty.');
          }

          setIsTranscribing(true);
          const transcription = await apiClient.transcribeAudio({
            storyId,
            audioBase64: base64Audio,
            audioMimeType: mediaRecorder.mimeType || audioBlob.type || 'audio/webm',
          });

          const text = transcription.text.trim();
          setTypedAction((previous) => (previous ? `${previous} ${text}` : text));
          triggerHaptic('medium');
        } catch (error) {
          setTranscriptionError(
            error instanceof Error ? error.message : 'Failed to transcribe the microphone recording.',
          );
        } finally {
          setIsTranscribing(false);
          mediaRecorderRef.current = null;
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow microphone access and try again.'
          : error instanceof DOMException && error.name === 'NotFoundError'
          ? 'No microphone was found on this device.'
          : error instanceof Error
          ? error.message
          : 'Could not access the microphone.';
      setTranscriptionError(message);
      mediaRecorderRef.current = null;
    }
  };

  const stopRecording = () => {
    if (speechRecognitionRef.current && isRecording) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
      setIsRecording(false);
      triggerHaptic('light');
      return;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      triggerHaptic('light');
    }
  };

  const handleSubmitAction = async (event: React.FormEvent) => {
    event.preventDefault();
    const actionText = typedAction.trim();
    if (!actionText || isProcessingAction || isProcessingOoc) return;

    triggerHaptic('medium');
    playSfx('ui.click', 'LOW', 0.5);

    if (inputMode === 'OOC') {
      setIsProcessingOoc(true);
      setOocHistory((history) => [...history, { role: 'player', text: actionText }]);
      setTypedAction('');
      try {
        const result = await apiClient.sendOocMessage(actionText, storyId);
        setOocHistory((history) => [
          ...history,
          { role: 'assistant', text: result.response || 'I could not produce an OOC response.' },
        ]);
      } catch (error: any) {
        const detail = error?.data?.errorReason || error?.message || 'The OOC assistant could not respond.';
        const attempts = Array.isArray(error?.data?.attemptsTrail)
          ? error.data.attemptsTrail.filter((attempt: any) => attempt.status === 'FAILED').map((attempt: any) => attempt.error).filter(Boolean).slice(0, 3).join(' | ')
          : '';
        setOocHistory((history) => [
          ...history,
          { role: 'assistant', text: attempts ? detail + '\n\nAttempts: ' + attempts : detail },
        ]);
      } finally {
        setIsProcessingOoc(false);
      }
      return;
    }

    onCustomAction?.(actionText);
    setTypedAction('');
  };

  const handleContinueStory = () => {
    if (isProcessingAction || isProcessingOoc) return;
    triggerHaptic('medium');
    playSfx('ui.click', 'LOW', 0.5);
    onCustomAction?.('Continue the story naturally from the current moment without introducing an out-of-character explanation.');
  };

  const storyHasNarration = actionHistory.some((entry) =>
    Boolean(entry.narrativeResponse || entry.presentationFeedback || entry.narrativeError),
  );

  const syncStoryTimelineScrollState = useCallback(() => {
    const anchor = storyTimelineEndRef.current;
    if (!anchor) return;

    const distanceBelowViewport = anchor.getBoundingClientRect().top - window.innerHeight;
    const nearLatest = distanceBelowViewport <= 180;
    userWasNearStoryEndRef.current = nearLatest;
    setShowJumpToLatest(storyHasNarration && !nearLatest);
  }, [storyHasNarration]);

  useEffect(() => {
    const handleScroll = () => {
      window.requestAnimationFrame(syncStoryTimelineScrollState);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    const frame = window.requestAnimationFrame(handleScroll);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [syncStoryTimelineScrollState]);

  useEffect(() => {
    const actionCountChanged = actionHistory.length !== previousActionCountRef.current;
    previousActionCountRef.current = actionHistory.length;
    if (!actionCountChanged) return;

    if (userWasNearStoryEndRef.current) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          storyTimelineEndRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
          });
        });
      });
      return;
    }

    setShowJumpToLatest(storyHasNarration);
  }, [actionHistory.length, storyHasNarration]);

  const jumpToLatestNarration = () => {
    triggerHaptic('light');
    playSfx('ui.click', 'LOW', 0.35);
    storyTimelineEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
    window.setTimeout(() => {
      userWasNearStoryEndRef.current = true;
      setShowJumpToLatest(false);
    }, 350);
  };

  const insertSuggestedAction = (suggestion: string) => {
    const cleanSuggestion = suggestion.trim();
    if (!cleanSuggestion) return;

    setTypedAction((current) => mergeSuggestedActionText(current, cleanSuggestion));
    setSuggestionsOpen(false);
    setSceneMenuOpen(false);
    window.requestAnimationFrame(() => {
      actionInputRef.current?.focus();
      actionInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    triggerHaptic('light');
    playSfx('ui.click', 'LOW', 0.35);
  };

  const handleReadAloud = (text: string, speakerId = 'narrator') => {
    triggerHaptic('light');
    playSpeech(text, speakerId);
  };

  const loadNarrationModels = async () => {
    setNarrationModelLoading(true);
    setNarrationModelError(null);
    try {
      const [modelResponse, categories] = await Promise.all([
        apiClient.getOrchestratorModels(),
        apiClient.getOrchestratorCategoryStates(),
      ]);
      const category = categories.find((entry: any) => entry.category === 'narration');
      setNarrationCurrentOperation(category?.currentOperation || null);
      setNarrationLastExecution(category?.lastExecution || null);
      const allRegisteredModels = Array.isArray(modelResponse.models) ? modelResponse.models : [];
      const modelsByKey = new Map(
        allRegisteredModels.map((model: any) => [
          `${model.providerId}::${model.modelId}`,
          model,
        ]),
      );

      // Prefer the exact narrative.generate task route. Category-level fallbackChain
      // can be empty when the category contains multiple tasks with different routes.
      const narrativeTaskRoute =
        Array.isArray(category?.taskRoutes)
          ? category.taskRoutes.find((route: any) => route.task === 'narrative.generate')
          : undefined;
      const fallbackChain = Array.isArray(narrativeTaskRoute?.fallbackChain)
        ? narrativeTaskRoute.fallbackChain
        : Array.isArray(category?.fallbackChain)
          ? category.fallbackChain
          : [];

      // Show every non-emergency model actually assigned to the narration route,
      // regardless of billing/free-tier classification. Free verification remains
      // visible as metadata on each model instead of hiding configured fallbacks.
      const routeModels = fallbackChain
        .filter((key: string) => !key.includes('emergency-fallback-local'))
        .map((key: string) => {
          const direct = modelsByKey.get(key);
          if (direct) return direct;
          return allRegisteredModels.find(
            (model: any) =>
              model.modelId === key ||
              `${model.providerId}::${model.modelId}` === key,
          );
        })
        .filter(Boolean);

      setNarrationModels(routeModels);
      setNarrationCategoryState(category || null);
    } catch (error: any) {
      setNarrationModelError(error?.message || 'Failed to load narration models.');
    } finally {
      setNarrationModelLoading(false);
    }
  };

  const refreshNarrationModelStatus = async () => {
    await loadNarrationModels();
  };

  const openNarrationModelPicker = async () => {
    setSceneMenuOpen(true);
    setSuggestionsOpen(false);
    setSceneChoiceOpen(false);
    setNarrationPickerOpen(true);
    await loadNarrationModels();
  };

  const selectNarrationModel = async (modelKey: string | null) => {
    setNarrationModelLoading(true);
    setNarrationModelError(null);
    try {
      await apiClient.setOrchestratorCategoryModel({ category: 'narration', modelKey });
      await loadNarrationModels();
    } catch (error: any) {
      setNarrationModelError(error?.message || 'Failed to change the narration model.');
    } finally {
      setNarrationModelLoading(false);
    }
  };

  const editPastAction = async (entry: ActionLog) => {
    const replacement = actionEditText.trim();
    if (!storyId || !replacement || actionEditBusy || narrationBusyActionId) return;

    setActionEditBusy(true);
    setNarrationModelError(null);
    try {
      const result = await apiClient.editPastAction({
        storyId,
        actionId: entry.id,
        newActionText: replacement,
      });
      onNarrationUpdated?.(result.viewState);
      setActionEditActionId(null);
      setActionEditText('');
      setVisibleTurnCount(12);
      setRevealedCheckIds({});
    } catch (error: any) {
      setNarrationModelError(error?.data?.errorReason || error?.message || 'Past action edit failed.');
    } finally {
      setActionEditBusy(false);
    }
  };

  const regenerateNarration = async (entry: ActionLog, editInstruction = '') => {
    if (!storyId || narrationBusyActionId) return;
    setNarrationBusyActionId(entry.id);
    try {
      const result = await apiClient.regenerateNarration({
        storyId,
        actionId: entry.id,
        // The narration picker is already a category-level preference. Do not send
        // the same selection again as a hard forceModelId override; the orchestrator
        // owns failover and will move to the next configured model when the preferred
        // provider is exhausted, cooling down, context-ineligible, or otherwise unavailable.
        editInstruction: editInstruction.trim() || undefined,
      });
      onNarrationUpdated?.(result.viewState);
      setNarrationEditActionId(null);
      setNarrationEditInstruction('');
    } catch (error: any) {
      setNarrationModelError(error?.data?.errorReason || error?.message || 'Narration regeneration failed.');
    } finally {
      setNarrationBusyActionId(null);
    }
  };

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

      {/* Opening scene: groupchat-style narration with model attribution */}
      {openingScene && (
        <div className="flex items-start justify-end gap-3">
          <section className="relative max-w-[95%] sm:max-w-[90%] overflow-hidden rounded-3xl rounded-tr-md border border-violet-400/25 bg-gradient-to-br from-[#130b24] via-[#0c0716] to-[#08050e] px-5 py-5 shadow-[0_20px_60px_rgba(124,58,237,0.12)] md:px-7 md:py-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-violet-500/15 pb-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-violet-200">
                  Narrator
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-violet-200 shadow-sm"
                  title={`Generated by: ${resolveModelDisplayName()}`}
                >
                  <Sparkles className="h-2.5 w-2.5 text-violet-300" />
                  <span>{resolveModelDisplayName()}</span>
                </span>
                <span className="text-[10px] text-fuchsia-300/70">· {openingScene.startingLocationName}</span>
              </div>
              <button
                onClick={() => handleReadAloud(openingScene.narrativeText)}
                disabled={isPlayingSpeech}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-900 px-2.5 py-1 text-xs text-stone-400 transition hover:text-stone-200 disabled:opacity-50"
              >
                <Headphones className="h-3.5 w-3.5" />
                {isPlayingSpeech ? 'Playing' : 'Listen'}
              </button>
            </div>

            <div className="space-y-3 font-serif text-[15px] leading-8 text-stone-100 md:text-base md:leading-8">
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
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-400/40 bg-violet-500/20 text-base shadow-[0_4px_16px_rgba(124,58,237,0.25)] ring-2 ring-violet-400/20"
            title={`Narrator (${resolveModelDisplayName()})`}
          >
            📖
          </div>
        </div>
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
                      roll.roll ? (
                        <DiceRollAnimation
                          key={roll.label + index}
                          roll={roll.roll}
                          title={roll.label}
                          subtitle={roll.roll.formula}
                          defenseLabel={roll.kind === 'DAMAGE' ? 'TARGET' : 'ARMOR CLASS'}
                          defenseValue={combatTransition.targetName || undefined}
                          outcome={
                            roll.kind === 'DAMAGE'
                              ? 'DAMAGE'
                              : combatTransition.precombatResolution?.hits === false
                                ? 'FAILURE'
                                : 'SUCCESS'
                          }
                          resultSuffix={roll.kind === 'DAMAGE' ? 'Damage' : ''}
                          showRollButton
                        />
                      ) : (
                        <div key={roll.label + index} className="rounded-2xl border border-amber-300/25 bg-[#100b2f]/90 px-4 py-4">
                          <div className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/75">{roll.label}</div>
                          <div className="mt-2 text-3xl font-black text-white">{roll.total ?? '—'}</div>
                        </div>
                      )
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
        // The server stores actionHistory newest-first because new actions are
        // prepended for efficient writes. The story conversation must render the
        // canonical timeline oldest-first so Turn #1 stays above Turn #2, etc.
        const history = (actionHistory || [])
          .filter((entry) => !(entry.actionType === 'NOTE_RECORD' && entry.id.includes('act_open_')));
        const chronologicalHistory = [...history].reverse();
        const fallbackTurnNumbers = new Map<string, number>();
        let fallbackTurn = 0;
        for (const entry of chronologicalHistory) {
          if (entry.actionType !== 'NOTE_RECORD') fallbackTurn += 1;
          fallbackTurnNumbers.set(
            entry.id,
            entry.turnNumber ?? (entry.actionType === 'NOTE_RECORD' ? 0 : fallbackTurn),
          );
        }
        const visible = [...history.slice(0, visibleTurnCount)].reverse();
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
                entry.narrativeError
                  ? ''
                  : entry.epistemicValidation === 'REJECTED_BY_ENGINE'
                    ? 'The action could not be carried out.'
                    : entry.presentationFeedback || ''
              );
              if (!entry.description && !narration && !entry.narrativeError) return null;
              const modelLabel = resolveModelDisplayName(entry);

              return (
                <div key={entry.id} className="space-y-3.5 py-1">
                  {/* Player Message: LEFT-ALIGNED like groupchat */}
                  {entry.description && (
                    <div className="flex items-start justify-start gap-2.5 sm:gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-400/30 bg-amber-500/10 shadow-[0_4px_16px_rgba(245,158,11,0.15)] ring-2 ring-amber-400/20"
                        title={protagonistName || 'Player Character'}
                        aria-label={protagonistName || 'Player Character'}
                      >
                        {protagonistPortraitUrl ? (
                          <img
                            src={protagonistPortraitUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-base">{protagonistPortraitEmoji || '🧙'}</span>
                        )}
                      </div>

                      <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl rounded-tl-sm border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.08] via-[#140f0c] to-[#0d0a08] px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="text-xs font-semibold text-amber-300">
                            {protagonistName || 'You'}
                          </span>
                          {protagonistRole && (
                            <span className="rounded bg-amber-400/10 px-1.5 py-0.2 text-[9px] font-medium uppercase tracking-wider text-amber-300/70 border border-amber-400/20">
                              {protagonistRole}
                            </span>
                          )}
                          <span className="text-[9px] text-stone-500 font-mono">
                            Turn #{fallbackTurnNumbers.get(entry.id) || 1}
                          </span>
                          {entry.actionType === 'CUSTOM_ACTION' && entry.canonicalCommandId && (
                            <button
                              type="button"
                              onClick={() => {
                                setActionEditActionId(actionEditActionId === entry.id ? null : entry.id);
                                setActionEditText(entry.description || '');
                              }}
                              disabled={actionEditBusy || Boolean(narrationBusyActionId)}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-amber-300/70 transition hover:bg-amber-500/10 hover:text-amber-200 disabled:opacity-40"
                              title="Edit this action and remove all actions after it"
                              aria-label="Edit this action"
                            >
                              <Pencil className="h-3 w-3" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                          )}
                        </div>
                        <p className="text-sm leading-6 text-stone-100 whitespace-pre-wrap">{entry.description}</p>
                        {actionEditActionId === entry.id && entry.actionType === 'CUSTOM_ACTION' && entry.canonicalCommandId && (
                          <div className="mt-3 rounded-2xl border border-amber-300/10 bg-black/20 p-3">
                            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/65">Edit past action</label>
                            <p className="mt-1 text-[10px] leading-4 text-stone-500">This replaces this action and removes every later action from the story timeline.</p>
                            <textarea
                              value={actionEditText}
                              onChange={(event) => setActionEditText(event.target.value)}
                              rows={3}
                              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-stone-200 outline-none focus:border-amber-300/30"
                            />
                            <div className="mt-2 flex justify-end gap-2">
                              <button type="button" onClick={() => { setActionEditActionId(null); setActionEditText(''); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-semibold text-stone-400 hover:text-stone-200">Cancel</button>
                              <button type="button" onClick={() => void editPastAction(entry)} disabled={!actionEditText.trim() || actionEditBusy} className="rounded-lg bg-amber-200 px-3 py-1.5 text-[10px] font-bold text-[#22170a] disabled:opacity-40">
                                {actionEditBusy ? 'Rewriting timeline…' : 'Replace & rewind'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Skill / D20 Roll Check Card (Integrated in groupchat stream) */}
                  {entry.checkResult && (
                    <div className="my-1 pl-11 sm:pl-12 max-w-[92%] sm:max-w-[85%]">
                      <StoryCheckCard
                        check={entry.checkResult}
                        revealed={Boolean(revealedCheckIds[entry.id])}
                        onReveal={() => revealCheck(entry.id)}
                      />
                    </div>
                  )}

                  {/* Narrator Message: RIGHT-ALIGNED like groupchat with Model Attribution */}
                  {shouldShowNarrationForAction(Boolean(entry.checkResult), Boolean(revealedCheckIds[entry.id]), Boolean(narration || entry.narrativeError)) && (
                    <div className="flex items-start justify-end gap-2.5 sm:gap-3">
                      <div className="max-w-[90%] sm:max-w-[82%] rounded-2xl rounded-tr-sm border border-violet-400/25 bg-gradient-to-br from-violet-950/40 via-stone-900/95 to-[#0e0a1a] px-4 py-3.5 sm:px-5 sm:py-4 shadow-[0_12px_36px_rgba(124,58,237,0.12)]">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-violet-500/15 pb-2">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-violet-200">
                              Narrator
                            </span>
                            {/* The action's persisted generation metadata is authoritative for what actually generated this turn. */}
                            <span
                              className="inline-flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-violet-200 shadow-sm"
                              title={entry.narrativeGeneration?.source ? `Generated by ${modelLabel} · ${entry.narrativeGeneration.source}` : `Generated by AI Model: ${modelLabel}`}
                            >
                              <Sparkles className="h-2.5 w-2.5 text-violet-300" />
                              <span>{modelLabel}</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {entry.narrativeResponse && (
                              <button
                                type="button"
                                onClick={() => handleReadAloud(entry.narrativeResponse || '')}
                                disabled={isPlayingSpeech}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-stone-400 transition hover:bg-violet-500/10 hover:text-stone-200 disabled:opacity-50"
                              >
                                <Headphones className="h-3 w-3" />
                                <span className="hidden xs:inline">Listen</span>
                              </button>
                            )}
                            {entry.narrativeResponse && (
                              <button
                                type="button"
                                onClick={() => regenerateNarration(entry)}
                                disabled={Boolean(narrationBusyActionId)}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-cyan-300/80 transition hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-40"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span className="hidden xs:inline">{narrationBusyActionId === entry.id ? 'Regenerating…' : 'Retry'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setNarrationEditActionId(narrationEditActionId === entry.id ? null : entry.id);
                                setNarrationEditInstruction('');
                              }}
                              className="rounded px-1.5 py-0.5 text-[10px] text-stone-400 transition hover:bg-violet-500/10 hover:text-stone-200"
                            >
                              Edit
                            </button>
                          </div>
                        </div>

                        {entry.narrativeError ? (
                          <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3">
                            <p className="text-xs font-semibold text-red-200">Narration AI unavailable</p>
                            <p className="mt-1 text-xs leading-5 text-red-100/75">{entry.narrativeError.message}</p>
                            {entry.narrativeError.attemptsTrail?.length ? (
                              <p className="mt-2 text-[10px] leading-4 text-red-100/55">
                                {entry.narrativeError.attemptsTrail
                                  .filter((attempt) => attempt.status === 'FAILED')
                                  .map((attempt) => attempt.modelId + ': ' + (attempt.error || 'failed'))
                                  .slice(0, 3)
                                  .join(' • ')}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => regenerateNarration(entry)}
                              disabled={Boolean(narrationBusyActionId)}
                              className="mt-3 rounded-lg border border-red-200/20 bg-red-200/10 px-3 py-1.5 text-[10px] font-semibold text-red-100 hover:bg-red-200/15 disabled:opacity-40"
                            >
                              {narrationBusyActionId === entry.id ? 'Trying again…' : 'Retry narration'}
                            </button>
                          </div>
                        ) : (
                          <p className="whitespace-pre-line font-serif text-[15px] leading-7 text-stone-100 md:text-base md:leading-8">
                            {narration}
                          </p>
                        )}

                        {narrationEditActionId === entry.id && (
                          <div className="mt-3 rounded-2xl border border-cyan-300/10 bg-black/25 p-3">
                            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/65">
                              Narration edit instruction
                            </label>
                            <textarea
                              value={narrationEditInstruction}
                              onChange={(event) => setNarrationEditInstruction(event.target.value)}
                              placeholder="Example: Make this more cinematic and focus on the temporal resonance."
                              rows={3}
                              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-stone-200 outline-none focus:border-cyan-300/30"
                            />
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => regenerateNarration(entry, narrationEditInstruction)}
                                disabled={!narrationEditInstruction.trim() || Boolean(narrationBusyActionId)}
                                className="rounded-lg bg-cyan-200 px-3 py-1.5 text-[10px] font-bold text-[#08131a] disabled:opacity-40"
                              >
                                Regenerate with instruction
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Narrator Avatar on the right */}
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-400/40 bg-violet-500/20 text-base shadow-[0_4px_16px_rgba(124,58,237,0.25)] ring-2 ring-violet-400/20"
                        title={`Narrator (${modelLabel})`}
                      >
                        📖
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })()}
      <div ref={storyTimelineEndRef} aria-hidden="true" className="h-px w-full" />
      <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.08] via-fuchsia-500/[0.035] to-transparent px-4 py-4 shadow-[0_18px_60px_rgba(124,58,237,0.10)] md:px-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-violet-300/70">Your turn</p>
            <p className="mt-1 text-base font-serif text-white">What do you do?</p>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/8 bg-[#0b0813]/70 p-1.5">
          <button
            type="button"
            onClick={() => setInputMode('STORY')}
            className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${inputMode === 'STORY' ? 'bg-violet-300 text-[#170c25]' : 'text-stone-500 hover:bg-white/[0.04] hover:text-stone-200'}`}
          >
            Story
          </button>
          <button
            type="button"
            onClick={() => setInputMode('OOC')}
            className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${inputMode === 'OOC' ? 'bg-sky-300 text-[#07131d]' : 'text-stone-500 hover:bg-white/[0.04] hover:text-stone-200'}`}
          >
            OOC
          </button>
          <button
            type="button"
            onClick={handleContinueStory}
            disabled={isProcessingAction || isProcessingOoc}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 px-3 py-1.5 text-[11px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-300/15 disabled:opacity-40"
            title="Ask the narrator to continue from the current moment"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Continue
          </button>
        </div>

        {inputMode === 'OOC' && oocHistory.length > 0 && (
          <div className="mb-3 max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-sky-300/10 bg-sky-400/[0.03] p-3">
            {oocHistory.slice(-8).map((entry, index) => (
              <div key={`ooc-${index}`} className={entry.role === 'player' ? 'text-right' : 'text-left'}>
                <div className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-5 ${entry.role === 'player' ? 'bg-sky-300/10 text-sky-100' : 'bg-white/[0.04] text-stone-300'}`}>
                  <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.16em] opacity-50">
                    {entry.role === 'player' ? 'OOC' : 'DreamBook OOC'}
                  </div>
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmitAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex items-center gap-2 sm:contents">
          <div ref={narrationMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setSceneMenuOpen((value) => !value);
                setSceneChoiceOpen(false);
                setSuggestionsOpen(false);
                setDiceSettingsOpen(false);
                setSceneError(null);
              }}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-violet-400/15 bg-violet-500/10 px-3 text-violet-200 transition hover:bg-violet-500/15"
              aria-label="Open More story tools"
              aria-expanded={sceneMenuOpen}
              aria-haspopup="menu"
              title="More"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs font-semibold">More</span>
            </button>

            {sceneMenuOpen && (
              <div className="absolute bottom-14 left-0 z-50 max-h-[min(72vh,40rem)] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#110b1d] p-2 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setSuggestionsOpen((value) => !value);
                    setDiceSettingsOpen(false);
                    setSceneChoiceOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-stone-200 hover:bg-violet-500/10 disabled:opacity-50"
                  aria-expanded={suggestionsOpen}
                  aria-controls="story-suggestions-panel"
                >
                  <Sparkles className="h-4 w-4 text-violet-300" />
                  <span className="flex-1">Suggestions</span>
                  <span className="text-[10px] text-stone-600">{actionTips.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDiceSettingsOpen((value) => !value);
                    setSuggestionsOpen(false);
                    setSceneChoiceOpen(false);
                  }}
                  className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-stone-200 hover:bg-violet-500/10"
                  aria-expanded={diceSettingsOpen}
                >
                  <Dices className="h-4 w-4 text-amber-300" />
                  <span className="flex-1">Dice Settings</span>
                  <span className="max-w-28 truncate text-[9px] text-amber-200/60">
                    {DICE_THEME_PRESETS.find((theme) => theme.id === settings.diceTheme)?.label || 'Classic Ivory'}
                  </span>
                </button>

                {diceSettingsOpen && (
                  <div className="mt-1 space-y-2 rounded-xl border border-amber-200/10 bg-[#090611]/95 p-2 shadow-inner">
                    <div className="mb-2 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Dices className="h-3.5 w-3.5 text-amber-300" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100/70">Dice appearance</p>
                          <p className="mt-0.5 text-[9px] leading-4 text-stone-600">Choose physical 3D dice or lightweight 2D illustrated dice.</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/6 bg-black/20 p-1">
                      {(['3D', '2D'] as const).map((mode) => {
                        const active = DICE_THEME_PRESETS.find((theme) => theme.id === settings.diceTheme)?.mode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => {
                              const firstTheme = DICE_THEME_PRESETS.find((theme) => theme.mode === mode);
                              if (firstTheme) void updateSettings({ diceTheme: firstTheme.id });
                            }}
                            className={"rounded-md px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition " + (active ? 'bg-amber-300 text-[#24170a]' : 'text-stone-500 hover:bg-white/[0.04] hover:text-stone-200')}
                            aria-pressed={active}
                          >
                            {mode === '3D' ? '3D Physical' : '2D Illustrated'}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 space-y-1">
                      {(['3D', '2D'] as const).map((mode) => {
                        const themes = DICE_THEME_PRESETS.filter((theme) => theme.mode === mode);
                        const modeActive = themes.some((theme) => theme.id === settings.diceTheme);
                        return (
                          <div key={mode} className={modeActive ? '' : 'hidden'}>
                            <div className="px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-stone-600">
                              {mode === '3D' ? '3D Physical Dice' : '2D Illustrated Dice'}
                            </div>
                            {themes.map((theme) => {
                              const active = settings.diceTheme === theme.id;
                              return (
                                <button
                                  key={theme.id}
                                  type="button"
                                  onClick={() => void updateSettings({ diceTheme: theme.id })}
                                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.04]"
                                  aria-pressed={active}
                                >
                                  <span
                                    className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/10 shadow-inner"
                                    style={{ background: theme.previewTable }}
                                  >
                                    <span
                                      className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-md border text-[8px] font-black"
                                      style={{ background: theme.customColorset.background, color: theme.customColorset.foreground, borderColor: theme.customColorset.outline }}
                                    >
                                      {mode === '2D' ? '2D' : '3D'}
                                    </span>
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-semibold text-stone-200">{theme.label}</span>
                                    <span className="mt-0.5 block text-[9px] leading-4 text-stone-500">{theme.description}</span>
                                  </span>
                                  {active && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {suggestionsOpen && (
                  <div
                    id="story-suggestions-panel"
                    role="region"
                    aria-label="Story action suggestions"
                    className="mt-1 max-h-80 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-1"
                  >
                    <div className="flex items-center justify-between gap-2 px-2 py-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-stone-600">Current situation</p>
                      <button
                        type="button"
                        onClick={() => void onRefreshSuggestions?.()}
                        disabled={isRefreshingSuggestions || isProcessingAction}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[9px] font-semibold text-stone-400 hover:text-stone-200 disabled:opacity-40"
                        aria-label="Refresh story suggestions"
                      >
                        {isRefreshingSuggestions ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Refresh
                      </button>
                    </div>
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

                <div className="mt-1 flex items-center gap-2 rounded-xl border border-cyan-200/10 bg-cyan-500/[0.03] px-3 py-2.5">
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-stone-200">Narration AI</span>
                      {narrationCurrentOperation ? (
                        <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[9px] font-mono text-cyan-300">
                          Running · {narrationCurrentOperation.displayName || narrationCurrentOperation.modelId}
                        </span>
                      ) : narrationLastExecution ? (
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-mono ${narrationLastExecution.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                          {narrationLastExecution.status === 'SUCCESS' ? 'Last run' : 'Last failed'} · {narrationLastExecution.displayName || narrationLastExecution.modelId}
                        </span>
                      ) : (
                        <span className="text-[9px] text-stone-600">No narration run recorded in this session</span>
                      )}
                    </div>
                    {narrationLastExecution?.finishedAt ? (
                      <div className="mt-0.5 text-[9px] text-stone-600">Updated {new Date(narrationLastExecution.finishedAt).toLocaleTimeString()}</div>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => void refreshNarrationModelStatus()} disabled={narrationModelLoading} className="rounded-md p-1.5 text-stone-500 hover:bg-white/[0.05] hover:text-cyan-300 disabled:opacity-40" title="Refresh narration model status">
                    <RotateCcw className={`h-3.5 w-3.5 ${narrationModelLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <button type="button" onClick={openNarrationModelPicker} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-stone-200 hover:bg-violet-500/10">
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                  <span className="flex-1">Narration AI Model</span>
                  {narrationCategoryState?.activeModelKey && (
                    <span className="max-w-24 truncate text-[9px] text-cyan-200/50">
                      {narrationCategoryState.mode === 'MANUAL' ? narrationCategoryState.activeModelKey.split('::').pop() : 'Automatic'}
                    </span>
                  )}
                </button>
                {narrationPickerOpen && (
                  <div className="mt-1 rounded-xl border border-cyan-200/10 bg-black/20 p-1">
                    {narrationCategoryState?.fallbackChain?.length ? (
                      <div className="px-3 py-2 border-b border-white/[0.05]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-100/55">Narration fallback route</div>
                          <span className="text-[8px] text-cyan-300/70">Configured narration route</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {narrationCategoryState.fallbackChain.map((key: string, index: number) => {
                            const model = narrationModels.find(
                              (candidate: any) =>
                                `${candidate.providerId}::${candidate.modelId}` === key || candidate.modelId === key
                            );
                            const label = key.includes('emergency-fallback-local')
                              ? 'Deterministic emergency'
                              : model?.displayName || key.split('::').pop();
                            return (
                              <span key={key} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] text-stone-400">
                                {index === 0 ? 'Primary' : key.includes('emergency-fallback-local') ? 'Final' : `Fallback ${index}`} · {label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <button type="button" onClick={() => selectNarrationModel(null)} className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-xs text-stone-300 hover:bg-white/[0.04]">
                      <span className="flex-1">Automatic routing</span>
                      {narrationCategoryState?.mode !== 'MANUAL' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}
                    </button>
                    {narrationModelLoading && <div className="px-3 py-2 text-[10px] text-cyan-100/60">Loading narration models…</div>}
                    {narrationModelError && <div className="px-3 py-2 text-[10px] leading-4 text-red-200">{narrationModelError}</div>}
                    {narrationModels.map((model: any, index: number) => {
                      const key = model.providerId + '::' + model.modelId;
                      const active =
                        narrationCategoryState?.mode === 'MANUAL' &&
                        (narrationCategoryState?.activeModelKey === key || narrationCategoryState?.activeModelKey === model.modelId);
                      return (
                        <button key={key} type="button" onClick={() => selectNarrationModel(key)} className="w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.04]">
                          <div className="flex items-center gap-2">
                            <span className="mr-1 text-[9px] font-mono text-stone-600">{index + 1}</span>
                            <span className="flex-1 text-xs font-semibold text-stone-200">{model.displayName || model.modelId}</span>
                            {active && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[9px] text-stone-600">
                            <span>{model.providerId} · {model.health || 'Unknown'} · {model.quota || 'Unknown'}</span>
                            {model.freeTierStatus === 'VERIFIED' ? <span className="text-emerald-300/80">FREE VERIFIED</span> : null}
                          </div>
                        </button>
                      );
                    })}
                    {!narrationModelLoading && narrationModels.length === 0 && !narrationModelError && (
                      <div className="px-3 py-3 text-[10px] text-stone-500">No configured AI models are currently assigned to the narration route.</div>
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
            disabled={isTranscribing || isProcessingAction || isProcessingOoc}
            aria-pressed={isRecording}
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

          </div>

          <div className="flex min-w-0 flex-1 items-end gap-2">
          <label className="sr-only" htmlFor="story-action-composer">Story action</label>
          <textarea
            id="story-action-composer"
            ref={actionInputRef}
            value={typedAction}
            rows={2}
            onChange={(event) => setTypedAction(event.target.value)}
            disabled={isProcessingAction || isProcessingOoc || isRecording || isTranscribing}
            aria-label={inputMode === 'OOC' ? 'Out-of-character message' : 'Story action'}
            aria-multiline="true"
            placeholder={
              isRecording
                ? 'Listening…'
                : isTranscribing
                ? 'Transcribing…'
                : isProcessingOoc
                ? 'DreamBook is answering…'
                : isProcessingAction
                ? 'The world is responding…'
                : inputMode === 'OOC'
                ? 'Ask OOC about your character, rules, lore, inventory, or the current story…'
                : 'Describe what you do…'
            }
            className="min-h-12 max-h-40 min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl border border-violet-400/10 bg-black/20 px-4 py-3 text-sm leading-5 text-stone-100 placeholder:text-stone-600 focus:border-violet-400/40 focus:outline-none focus:ring-2 focus:ring-violet-500/10 sm:h-12"
          />

          <button
            type="submit"
            disabled={!typedAction.trim() || isProcessingAction || isProcessingOoc || isRecording || isTranscribing}
            className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-300 to-fuchsia-300 px-5 text-sm font-semibold text-[#160b22] transition hover:from-violet-200 hover:to-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isProcessingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Send</span>
          </button>
          </div>
        </form>

        {transcriptionError && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-red-400" role="alert">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">{transcriptionError}</span>
          </p>
        )}

        {actionError && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200/10 bg-red-950/20 px-3 py-2" role="alert">
            <p className="min-w-0 flex-1 text-xs leading-5 text-red-200 break-words">{actionError}</p>
            {onRetryLastAction && (
              <button
                type="button"
                onClick={onRetryLastAction}
                disabled={isProcessingAction || isProcessingOoc}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200/20 px-3 text-[10px] font-semibold text-red-100 hover:bg-red-200/10 disabled:opacity-40"
                aria-label="Retry the last failed story action"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}
      </section>

      {showJumpToLatest && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-6">
          <button
            type="button"
            onClick={jumpToLatestNarration}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-[#120b20]/95 px-4 py-2 text-xs font-semibold text-violet-100 shadow-[0_12px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:border-violet-300/45 hover:bg-[#181025]"
            aria-label="Jump to latest narration"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Latest narration
          </button>
        </div>
      )}

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
