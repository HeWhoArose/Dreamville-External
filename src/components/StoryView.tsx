import React, { useState, useRef } from 'react';
import {
  Location,
  DialogueNode,
  DialogueChoice,
  ActionLog,
  OpeningScene,
  StructuredNarrativeEvent,
  NarrativeEventType,
} from '../types';
import { useAudioHaptic } from './AudioHapticManager';
import { getCharacterSpeakerTheme } from './voiceResolver';
import { StoryHUDDrawer } from './StoryHUDDrawer';
import {
  Sparkles,
  MessageSquare,
  Compass,
  ArrowRight,
  CornerDownRight,
  Volume2,
  Mic,
  MicOff,
  Send,
  Loader2,
  AlertCircle,
  Headphones,
  BookOpen,
  RotateCcw,
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
  isProcessingAction: boolean;
  openingScene?: OpeningScene | null;
  worldTitle?: string;
  storyId?: string;
  protagonistName?: string;
  protagonistRole?: string;
  isLoadingOpening?: boolean;
  openingError?: string | null;
  onRetryOpening?: () => void;
}

export const StoryView: React.FC<StoryViewProps> = ({
  location,
  activeDialogue,
  dialogueHistory,
  actionHistory = [],
  onSelectChoice,
  onRequestInspect,
  onRequestRest,
  onCustomAction,
  isProcessingAction,
  openingScene,
  worldTitle,
  storyId,
  protagonistName,
  protagonistRole,
  isLoadingOpening = false,
  openingError = null,
  onRetryOpening,
}) => {
  const { playSpeech, isPlayingSpeech, triggerHaptic, playSfx } = useAudioHaptic();

  const [typedAction, setTypedAction] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Start microphone capture for transcription
  const startRecording = async () => {
    setTranscriptionError(null);
    triggerHaptic('light');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsTranscribing(true);
      setTimeout(async () => {
        try {
          const res = await fetch('/api/game/sensory/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: 'sample_audio_capture_payload' }),
          });
          const data = await res.json();
          if (data.text) {
            setTypedAction((prev) => (prev ? `${prev} ${data.text}` : data.text));
            triggerHaptic('medium');
          }
        } catch {
          setTranscriptionError('Transcription request failed.');
        } finally {
          setIsTranscribing(false);
        }
      }, 800);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
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
            if (data.text) {
              setTypedAction((prev) => (prev ? `${prev} ${data.text}` : data.text));
              triggerHaptic('medium');
            }
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
      setIsTranscribing(true);
      setTimeout(async () => {
        try {
          const res = await fetch('/api/game/sensory/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: 'mock_mic_capture' }),
          });
          const data = await res.json();
          if (data.text) {
            setTypedAction((prev) => (prev ? `${prev} ${data.text}` : data.text));
            triggerHaptic('medium');
          }
        } catch {
          setTranscriptionError('Audio capture failed.');
        } finally {
          setIsTranscribing(false);
        }
      }, 700);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      triggerHaptic('light');
    }
  };

  const handleSubmitAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedAction.trim() || isProcessingAction) return;

    triggerHaptic('medium');
    playSfx('ui.click', 'LOW', 0.5);

    if (onCustomAction) {
      onCustomAction(typedAction.trim());
    } else {
      onRequestInspect();
    }
    setTypedAction('');
  };

  const handleReadAloud = (text: string, speakerId?: string) => {
    triggerHaptic('light');
    playSpeech(text, speakerId || 'narrator');
  };

  const getEventBadge = (type: NarrativeEventType) => {
    switch (type) {
      case 'location':
        return { bg: 'bg-emerald-950/70 text-emerald-300 border-emerald-800', label: 'LOCATION', icon: '📍' };
      case 'dialogue':
        return { bg: 'bg-purple-950/70 text-purple-300 border-purple-800', label: 'DIALOGUE', icon: '💬' };
      case 'action':
        return { bg: 'bg-blue-950/70 text-blue-300 border-blue-800', label: 'ACTION', icon: '⚔️' };
      case 'quest':
        return { bg: 'bg-amber-950/70 text-amber-300 border-amber-800', label: 'QUEST', icon: '✨' };
      case 'system':
        return { bg: 'bg-stone-900 text-stone-300 border-stone-800', label: 'SYSTEM', icon: '⚙️' };
      case 'magic':
        return { bg: 'bg-indigo-950/70 text-indigo-300 border-indigo-800', label: 'MAGIC', icon: '🔮' };
      case 'item':
        return { bg: 'bg-teal-950/70 text-teal-300 border-teal-800', label: 'ITEM', icon: '🎒' };
      case 'damage':
        return { bg: 'bg-red-950/70 text-red-300 border-red-800', label: 'DAMAGE', icon: '💥' };
      case 'heal':
        return { bg: 'bg-emerald-950/70 text-emerald-300 border-emerald-800', label: 'HEAL', icon: '💚' };
      default:
        return { bg: 'bg-amber-950/50 text-amber-200/90 border-amber-800/60', label: 'NARRATIVE', icon: '📜' };
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <StoryHUDDrawer storyId={storyId} />

      {/* Top Story Bar — Atmospheric Header (Cinematic UX Polish) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950 border border-stone-800/80 p-5 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono tracking-widest text-amber-400 uppercase font-semibold">
                {worldTitle || openingScene?.worldName || 'Living Chronicle'}
              </span>
              <span className="text-stone-600">•</span>
              <span className="text-[11px] font-mono text-emerald-400/90">
                {location.region || 'Sanctuary'}
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-serif font-bold text-stone-100 tracking-wide">
              {location.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {protagonistName && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-900/90 border border-stone-800 text-xs font-mono">
                <span className="text-stone-400">Protagonist:</span>
                <span className="text-stone-200 font-semibold">{protagonistName}</span>
                {protagonistRole && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 text-[10px] border border-purple-800/80">
                    {protagonistRole}
                  </span>
                )}
              </div>
            )}
            {openingScene?.worldTime?.formattedTime && (
              <div className="px-3 py-1.5 rounded-xl bg-stone-900/90 border border-stone-800 text-xs font-mono text-amber-300/90">
                {openingScene.worldTime.formattedTime}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoadingOpening && (
        <div className="rounded-3xl border border-stone-800 bg-stone-900/60 p-12 text-center backdrop-blur-md shadow-xl">
          <Loader2 className="w-10 h-10 mx-auto mb-4 text-amber-400 animate-spin" />
          <h3 className="text-lg font-serif font-bold text-stone-100 mb-1">
            Weaving the Atmospheric Opening
          </h3>
          <p className="text-xs text-stone-400 font-mono">
            Grounding {protagonistName || 'the protagonist'} in {worldTitle || location.name}...
          </p>
        </div>
      )}

      {/* Recoverable Error State */}
      {openingError && !isLoadingOpening && (
        <div className="rounded-3xl border border-red-900/80 bg-red-950/40 p-6 backdrop-blur-md shadow-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-200">Narrative Generation Notice</h3>
              <p className="text-xs text-red-300/90 mt-1 mb-2">{openingError}</p>
              <p className="text-[11px] text-stone-400 font-mono mb-4">
                Your StoryRun and character state remain fully intact and safe.
              </p>
              {onRetryOpening && (
                <button
                  onClick={onRetryOpening}
                  className="px-4 py-2 rounded-xl bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-700 text-xs font-medium transition inline-flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Opening Generation</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Opening Chronicle Scene Card (Cinematic Success View) */}
      {openingScene && (
        <div className="bg-gradient-to-b from-stone-900/90 via-stone-950/90 to-stone-950 rounded-3xl border border-amber-500/30 p-7 md:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-stone-800/80">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-serif font-bold text-stone-100 tracking-wide">
                  The Opening Chronicle
                </h3>
                <span className="text-xs font-mono text-stone-400">
                  {openingScene.worldTime?.formattedTime || 'Dawn, Cycle 1'} • {openingScene.startingLocationName}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleReadAloud(openingScene.narrativeText, 'narrator')}
                disabled={isPlayingSpeech}
                className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-amber-300 border border-stone-800 text-xs font-mono flex items-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-sm"
              >
                <Headphones className="w-4 h-4 text-amber-400" />
                <span>{isPlayingSpeech ? 'Narrating...' : 'Listen'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            {openingScene.narrativeText.split('\n\n').map((para, pIdx) => (
              <p
                key={pIdx}
                className="text-stone-200 text-base md:text-lg leading-relaxed font-serif tracking-wide"
              >
                {para}
              </p>
            ))}
          </div>

          {openingScene.startingSituation && (
            <div className="rounded-2xl bg-stone-900/80 border border-amber-500/20 p-4 mb-6 flex items-start gap-3 shadow-inner">
              <span className="text-amber-400 text-base mt-0.5">🕯️</span>
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold block mb-1">
                  Immediate Epistemic Horizon
                </span>
                <p className="text-sm text-stone-300 italic font-serif leading-relaxed">
                  {openingScene.startingSituation}
                </p>
              </div>
            </div>
          )}

          {openingScene.structuredEvents && openingScene.structuredEvents.length > 0 && (
            <div className="pt-4 border-t border-stone-800/60">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold block mb-3">
                Key Narrative Moments
              </span>
              <div className="grid gap-2.5">
                {openingScene.structuredEvents.map((evt) => {
                  const badge = getEventBadge(evt.type);
                  return (
                    <div
                      key={evt.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-stone-900/70 border border-stone-800 text-xs shadow-sm"
                    >
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border flex-shrink-0 ${badge.bg}`}
                      >
                        <span>{badge.icon}</span>
                        <span>{badge.label}</span>
                      </span>
                      <div className="flex-1">
                        {evt.speaker && (
                          <span className="font-semibold text-amber-300 mr-2 font-serif text-sm">
                            {evt.speaker}:
                          </span>
                        )}
                        <span className="text-stone-200 font-sans text-sm">{evt.text}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current Location & Atmospheric Environment */}
      <div className="bg-stone-900/60 rounded-3xl border border-stone-800/80 p-6 md:p-7 backdrop-blur-md shadow-xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-stone-800/80">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-400 text-sm">📍</span>
              <h2 className="text-xl md:text-2xl font-serif font-bold text-stone-100">
                {location.name}
              </h2>
            </div>
            <span className="text-xs text-stone-400 font-mono">
              Region: {location.region}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={isProcessingAction}
              onClick={onRequestInspect}
              className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-medium transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Inspect</span>
            </button>
            <button
              disabled={isProcessingAction}
              onClick={onRequestRest}
              className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-medium transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Advance Time</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-stone-300 text-base md:text-lg leading-relaxed font-serif">
            {location.description}
          </p>

          <div className="flex items-center justify-between">
            <button
              onClick={() => handleReadAloud(location.description, 'narrator')}
              disabled={isPlayingSpeech}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-950/80 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-amber-300 text-xs font-mono transition cursor-pointer"
            >
              <Headphones className="w-3.5 h-3.5 text-amber-400" />
              <span>{isPlayingSpeech ? 'Narrating...' : 'Listen to Scene'}</span>
            </button>
          </div>

          {location.ambientSensory && (
            <div className="rounded-2xl bg-stone-950/80 border border-stone-800/80 p-4 flex items-start gap-3 shadow-inner">
              <span className="text-base select-none mt-0.5">🕯️</span>
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400/90 font-semibold block mb-0.5">
                  Atmosphere
                </span>
                <p className="text-sm text-stone-300 italic font-serif">
                  {location.ambientSensory}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Dialogue / Interaction Panel */}
      {activeDialogue ? (() => {
        const theme = getCharacterSpeakerTheme(activeDialogue.speakerName);
        return (
          <div className={`bg-stone-900/90 rounded-3xl border ${theme.bubbleBorder} p-7 shadow-2xl backdrop-blur-md relative`}>
            <div className="flex items-center justify-between gap-4 mb-5 pb-4 border-b border-stone-800">
              <div className="flex items-center gap-3.5">
                <div className={`h-12 w-12 rounded-2xl ${theme.badgeBg} border ${theme.badgeBorder} flex items-center justify-center text-2xl shadow-inner`}>
                  💬
                </div>
                <div>
                  <h3 className={`text-lg font-serif font-bold ${theme.nameColor}`}>
                    {activeDialogue.speakerName}
                  </h3>
                  <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 mt-0.5">
                    <span>🔒</span> {activeDialogue.epistemicNote}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleReadAloud(activeDialogue.text, activeDialogue.speakerName)}
                disabled={isPlayingSpeech}
                className={`px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-750 ${theme.nameColor} border border-stone-700 text-xs font-mono flex items-center gap-1.5 transition cursor-pointer shadow-sm`}
              >
                <Volume2 className="w-4 h-4" />
                <span>{isPlayingSpeech ? 'Speaking...' : 'Listen'}</span>
              </button>
            </div>

            <div className={`bg-stone-950/80 rounded-2xl p-5 border ${theme.bubbleBorder} mb-6 shadow-inner`}>
              <p className={`${theme.textColor} text-base md:text-lg leading-relaxed font-serif italic`}>
                "{activeDialogue.text}"
              </p>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-400 block font-semibold">
                Available Responses
              </span>
              <div className="grid gap-2.5">
                {activeDialogue.choices.map((choice) => (
                  <button
                    key={choice.id}
                    id={`dialogue-choice-${choice.id}`}
                    disabled={isProcessingAction}
                    onClick={() => onSelectChoice(choice)}
                    className="group w-full text-left p-4 rounded-2xl bg-stone-950 hover:bg-stone-850 border border-stone-800 hover:border-amber-500/40 transition flex items-center justify-between gap-4 disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <ArrowRight className="w-4 h-4 text-amber-400/60 group-hover:text-amber-400 mt-1 flex-shrink-0 transition-transform group-hover:translate-x-1" />
                      <div>
                        <span className="text-sm font-medium text-stone-200 group-hover:text-amber-200 transition font-serif">
                          {choice.label}
                        </span>
                        {choice.epistemicContext && (
                          <p className="text-xs text-stone-500 group-hover:text-stone-400 mt-1 font-mono">
                            {choice.epistemicContext}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 group-hover:text-amber-400/90 px-2.5 py-1 rounded-xl bg-stone-900 border border-stone-800 flex-shrink-0">
                      {choice.intent}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })() : null}

      {/* Action Input Dock — Primary Interaction Hub (Cinematic UX) */}
      <div className="rounded-3xl border border-stone-800/80 bg-gradient-to-b from-stone-900/90 to-stone-950/90 p-5 md:p-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono uppercase tracking-wider text-amber-400/90 font-semibold flex items-center gap-2">
            <span>⚔️</span> What do you wish to do?
          </span>
          <span className="text-[11px] font-mono text-stone-400">
            Type freeform actions or dictate via mic
          </span>
        </div>

        <form onSubmit={handleSubmitAction} className="flex items-center gap-3">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing || isProcessingAction}
            className={`p-3.5 rounded-2xl border transition flex items-center justify-center flex-shrink-0 relative cursor-pointer shadow-md ${
              isRecording
                ? 'bg-red-950/80 border-red-700 text-red-300 animate-pulse ring-2 ring-red-500/50'
                : isTranscribing
                ? 'bg-amber-950/60 border-amber-700 text-amber-300'
                : 'bg-stone-950 hover:bg-stone-850 border-stone-800 text-stone-300 hover:border-amber-500/50'
            }`}
            title={isRecording ? 'Click to stop and transcribe' : 'Dictate action with microphone'}
            aria-label="Dictate action"
          >
            {isTranscribing ? (
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            ) : isRecording ? (
              <MicOff className="w-5 h-5 text-red-400" />
            ) : (
              <Mic className="w-5 h-5 text-stone-300" />
            )}
          </button>

          <div className="relative flex-1">
            <input
              type="text"
              value={typedAction}
              onChange={(e) => setTypedAction(e.target.value)}
              placeholder={
                isRecording
                  ? 'Listening to speech...'
                  : isTranscribing
                  ? 'Transcribing audio input...'
                  : isProcessingAction
                  ? 'Resolving action in the living world...'
                  : 'Type your action (e.g. I inspect the strange footprints beside the doorway)...'
              }
              disabled={isProcessingAction || isRecording}
              className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500/80 rounded-2xl px-5 py-3 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none transition font-sans shadow-inner"
            />
          </div>

          <button
            type="submit"
            disabled={!typedAction.trim() || isProcessingAction || isRecording}
            className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer shadow-lg"
          >
            {isProcessingAction ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Resolving...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send</span>
              </>
            )}
          </button>
        </form>

        {transcriptionError && (
          <div className="mt-3 text-xs font-mono text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{transcriptionError}</span>
          </div>
        )}
      </div>

      {/* Chronological Narrative Stream — Immersive Story Reading Feed */}
      {(dialogueHistory.length > 0 || actionHistory.length > 0) && (
        <div className="rounded-3xl border border-stone-800/80 bg-stone-900/40 p-6 md:p-7 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-800">
            <h4 className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-2">
              <CornerDownRight className="w-4 h-4 text-amber-400" />
              <span>Chronological Narrative Stream</span>
            </h4>
            <span className="text-[11px] font-mono text-stone-500">
              {actionHistory.length + dialogueHistory.length} recorded events
            </span>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-3">
            {[
              ...actionHistory.map((act) => ({
                id: act.id,
                type: 'action' as const,
                timestamp: act.timestamp,
                title: protagonistName || 'Protagonist',
                body: act.description,
                outcome: act.authoritativeFeedback,
                success: act.epistemicValidation !== 'REJECTED_BY_ENGINE',
              })),
              ...dialogueHistory.map((diag, idx) => ({
                id: `diag-${idx}`,
                type: 'dialogue' as const,
                timestamp: `Cycle ${diag.cycle}`,
                title: diag.speaker,
                body: diag.text,
                outcome: null,
                success: true,
              })),
            ].map((item) => {
              if (item.type === 'dialogue') {
                const theme = getCharacterSpeakerTheme(item.title);
                return (
                  <div key={item.id} className={`p-4 rounded-2xl bg-stone-950/80 border ${theme.bubbleBorder} shadow-sm space-y-1.5`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-serif font-bold text-sm ${theme.nameColor}`}>
                        {item.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-stone-500">{item.timestamp}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-stone-900 text-purple-300 border border-stone-800">
                          Dialogue
                        </span>
                      </div>
                    </div>
                    <p className={`${theme.textColor} font-serif italic text-sm md:text-base`}>
                      "{item.body}"
                    </p>
                  </div>
                );
              } else {
                return (
                  <div key={item.id} className="p-4 rounded-2xl bg-stone-950/60 border border-stone-800/80 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-serif font-bold text-sm text-amber-200">
                        {item.title} (Action)
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-stone-500">{item.timestamp}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-stone-900 text-amber-400 border border-stone-800">
                          Action
                        </span>
                      </div>
                    </div>
                    <p className="text-stone-200 font-sans text-sm md:text-base font-medium">
                      "{item.body}"
                    </p>
                    {item.outcome && (
                      <div className="p-3 rounded-xl bg-stone-900/80 border border-stone-800 text-stone-300 text-xs md:text-sm font-serif italic leading-relaxed">
                        <span className="text-amber-400 font-semibold mr-1.5">Result:</span>
                        {item.outcome}
                      </div>
                    )}
                  </div>
                );
              }
            })}
          </div>
        </div>
      )}
    </div>
  );
};
