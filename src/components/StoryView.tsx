import React from 'react';
import { Location, DialogueNode, DialogueChoice } from '../types';
import { Sparkles, MessageSquare, Compass, ShieldAlert, ArrowRight, CornerDownRight } from 'lucide-react';

interface StoryViewProps {
  location: Location;
  activeDialogue: DialogueNode | null;
  dialogueHistory: { speaker: string; text: string; cycle: number }[];
  onSelectChoice: (choice: DialogueChoice) => void;
  onRequestInspect: () => void;
  onRequestRest: () => void;
  isProcessingAction: boolean;
}

export const StoryView: React.FC<StoryViewProps> = ({
  location,
  activeDialogue,
  dialogueHistory,
  onSelectChoice,
  onRequestInspect,
  onRequestRest,
  isProcessingAction,
}) => {
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

        {/* Narrative Description */}
        <p className="text-stone-300 text-sm leading-relaxed mb-4 font-serif">
          {location.description}
        </p>

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

            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700">
              Active Dialogue Node
            </span>
          </div>

          {/* Dialogue Text */}
          <div className="bg-stone-950/60 rounded-xl p-4 border border-stone-800/80 mb-6">
            <p className="text-stone-200 text-sm md:text-base leading-relaxed font-serif italic">
              "{activeDialogue.text}"
            </p>
          </div>

          {/* Available Dialogue Choices (Action Proposals to Engine) */}
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
