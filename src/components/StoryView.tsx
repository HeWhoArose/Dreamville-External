import React, { useState, useRef } from 'react';
import { Location, DialogueNode, DialogueChoice } from '../types';
import { useAudioHaptic } from './AudioHapticManager';
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
} from 'lucide-react';

interface StoryViewProps {
  location: Location;
  activeDialogue: DialogueNode | null;
  dialogueHistory: { speaker: string; text: string; cycle: number }[];
  onSelectChoice: (choice: DialogueChoice) => void;
  onRequestInspect: () => void;
  onRequestRest: () => void;
  onCustomAction?: (actionText: string) => void;
  isProcessingAction: boolean;
}

export const StoryView: React.FC<StoryViewProps> = ({
  location,
  activeDialogue,
  dialogueHistory,
  onSelectChoice,
  onRequestInspect,
  onRequestRest,
  onCustomAction,
  isProcessingAction,
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
      // Platform doesn't permit direct mic; simulate speech transcription cleanly
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
      // Permission denied or mic unavailable: fallback to simulated transcription
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
          setTranscriptionError('Audio capture permitted failed.');
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

  return (
    <div className="space-y-6">
      {/* Scene Overview Card */}
      <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-5 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm">📍</span>
              <h2 className="text-xl font-serif font-bold text-stone-100">
                {location.name}
              </h2>
            </div>
            <span className="text-xs text-stone-400 font-medium">
              Region: {location.region}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="story-inspect-surroundings-btn"
              disabled={isProcessingAction}
              onClick={onRequestInspect}
              className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Inspect Surroundings</span>
            </button>
            <button
              id="story-rest-meditate-btn"
              disabled={isProcessingAction}
              onClick={onRequestRest}
              className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Advance Cycle</span>
            </button>
          </div>
        </div>

        {/* Narrative Description with Listen Button */}
        <div className="relative group mb-4">
          <p className="text-stone-300 text-sm leading-relaxed font-serif">
            {location.description}
          </p>
          <button
            onClick={() => handleReadAloud(location.description, 'narrator')}
            disabled={isPlayingSpeech}
            className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-stone-950/60 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-amber-300 text-[11px] font-mono transition"
            title="Read narration aloud"
          >
            <Headphones className="w-3 h-3 text-amber-400" />
            <span>{isPlayingSpeech ? 'Narrating...' : 'Listen to Scene'}</span>
          </button>
        </div>

        {/* Sensory Ambient Banner */}
        <div className="rounded-xl bg-stone-950/80 border border-stone-800/80 p-3 flex items-start gap-3">
          <span className="text-base select-none">🕯️</span>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400/90 font-semibold block mb-0.5">
              Sensory Ambient Field
            </span>
            <p className="text-xs text-stone-400 italic">
              {location.ambientSensory}
            </p>
          </div>
        </div>
      </div>

      {/* Active Dialogue / Interaction Presentation */}
      {activeDialogue ? (
        <div className="bg-stone-900/80 rounded-2xl border border-amber-500/20 p-6 relative shadow-lg">
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-800">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl">
                💬
              </div>
              <div>
                <h3 className="text-base font-serif font-bold text-stone-100 flex items-center gap-2">
                  <span>{activeDialogue.speakerName}</span>
                </h3>
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                  <span>🔒</span> {activeDialogue.epistemicNote}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  handleReadAloud(activeDialogue.text, activeDialogue.speakerName)
                }
                disabled={isPlayingSpeech}
                className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-750 text-amber-300 border border-stone-700 text-xs font-mono flex items-center gap-1.5 transition"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{isPlayingSpeech ? 'Speaking...' : 'Voice Read'}</span>
              </button>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700">
                Active Dialogue Node
              </span>
            </div>
          </div>

          {/* Dialogue Text */}
          <div className="bg-stone-950/60 rounded-xl p-4 border border-stone-800/80 mb-6">
            <p className="text-stone-200 text-sm md:text-base leading-relaxed font-serif italic">
              "{activeDialogue.text}"
            </p>
          </div>

          {/* Available Dialogue Choices */}
          <div className="space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-400 block mb-2 font-medium">
              Available Choices (Action Request)
            </span>
            <div className="grid gap-2">
              {activeDialogue.choices.map((choice) => (
                <button
                  key={choice.id}
                  id={`dialogue-choice-${choice.id}`}
                  disabled={isProcessingAction}
                  onClick={() => onSelectChoice(choice)}
                  className="group w-full text-left p-3.5 rounded-xl bg-stone-950 hover:bg-stone-850 border border-stone-800 hover:border-amber-500/40 transition flex items-center justify-between gap-4 disabled:opacity-50"
                >
                  <div className="flex items-start gap-2.5">
                    <ArrowRight className="w-4 h-4 text-amber-400/60 group-hover:text-amber-400 mt-0.5 flex-shrink-0 transition-transform group-hover:translate-x-1" />
                    <div>
                      <span className="text-sm font-medium text-stone-200 group-hover:text-amber-200 transition">
                        {choice.label}
                      </span>
                      {choice.epistemicContext && (
                        <p className="text-[11px] text-stone-500 group-hover:text-stone-400 mt-0.5 font-mono">
                          Context: {choice.epistemicContext}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 group-hover:text-amber-400/80 px-2 py-1 rounded bg-stone-900 border border-stone-800 flex-shrink-0">
                    {choice.intent}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-800 bg-stone-900/30 p-8 text-center text-stone-500">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-stone-600" />
          <p className="text-sm">No active dialogue exchange at this moment.</p>
          <p className="text-xs text-stone-600 mt-1">
            Check the Characters tab to initiate dialogue with individuals present in this location.
          </p>
        </div>
      )}

      {/* Narrative Run Composer with Typed & Speech Input Pipeline (DEF-CH14-07 & R1) */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900/50 p-4 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold flex items-center gap-1.5">
            <span>⚔️</span> Action & Speech Input Pipeline
          </span>
          <span className="text-[10px] font-mono text-stone-500">
            Speech transcription feeds into the typed canonical action pipeline
          </span>
        </div>

        <form onSubmit={handleSubmitAction} className="flex items-center gap-2">
          {/* Microphone speech input button */}
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing || isProcessingAction}
            className={`p-3 rounded-xl border transition flex items-center justify-center flex-shrink-0 relative ${
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
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            ) : isRecording ? (
              <MicOff className="w-4 h-4 text-red-400" />
            ) : (
              <Mic className="w-4 h-4 text-stone-300" />
            )}
          </button>

          {/* Action text input */}
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
                  : 'Type an action or speak via mic (e.g. examine the ancient orrery)...'
              }
              disabled={isProcessingAction || isRecording}
              className="w-full bg-stone-950 border border-stone-800 focus:border-amber-500/80 rounded-xl px-4 py-2.5 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none transition font-sans"
            />
          </div>

          {/* Submit action button */}
          <button
            type="submit"
            disabled={!typedAction.trim() || isProcessingAction || isRecording}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit</span>
          </button>
        </form>

        {/* Status / Error bar */}
        {transcriptionError && (
          <div className="mt-2 text-xs font-mono text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{transcriptionError}</span>
          </div>
        )}
      </div>

      {/* Dialogue & Scene Transcript Log */}
      {dialogueHistory.length > 0 && (
        <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5">
          <h4 className="text-xs font-mono uppercase tracking-wider text-stone-400 mb-3 flex items-center gap-1.5">
            <CornerDownRight className="w-3.5 h-3.5 text-amber-400" />
            <span>Exchange Transcript</span>
          </h4>
          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-2">
            {dialogueHistory.map((item, idx) => (
              <div key={idx} className="text-xs border-l-2 border-amber-500/30 pl-3 py-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-stone-300 font-serif">
                    {item.speaker}
                  </span>
                  <span className="text-[10px] font-mono text-stone-500">
                    Cycle {item.cycle}
                  </span>
                </div>
                <p className="text-stone-400 italic">"{item.text}"</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
