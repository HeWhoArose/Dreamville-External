import React from 'react';
import { X, ShieldCheck, Eye, Lock, Cpu, User, CheckCircle } from 'lucide-react';
import { mockEngineAdapter } from '../services/MockEngineAdapter';

interface EpistemicInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EpistemicInspectorModal: React.FC<EpistemicInspectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const audit = mockEngineAdapter.getEpistemicAudit();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md">
      <div className="bg-stone-900 border border-stone-750 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-stone-100 text-base">
                Epistemic Separation Model & Adapter Audit
              </h3>
              <p className="text-[11px] font-mono text-stone-400">
                Architectural Spec: Section 4 & 8 Boundary Verification
              </p>
            </div>
          </div>
          <button
            id="close-epistemic-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-850 text-stone-400 hover:text-stone-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <p className="text-xs text-stone-300 leading-relaxed font-serif">
            In the Personal AI Story Engine, the client display is strictly constructed from information
            authorized for the active viewer. Hidden information must never be leaked to the presentation layer.
          </p>

          {/* Active Adapter Epistemic Filter Audit */}
          <div className="bg-stone-950 rounded-xl p-3.5 border border-amber-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-amber-300 uppercase flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                Live Adapter Boundary Audit
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800">
                Epistemic Filter: Active
              </span>
            </div>
            <p className="text-[11px] text-stone-400 mb-2 font-mono">
              {audit.filtrationRule}
            </p>
            <div className="space-y-1.5 text-[11px] font-mono">
              {audit.canonicalSecretsHeld.map((secret) => (
                <div
                  key={secret.characterId}
                  className="bg-stone-900/90 rounded p-2 border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                >
                  <span className="text-stone-300 font-semibold">{secret.characterName}:</span>
                  <span className="text-red-400/90 italic truncate max-w-md" title={secret.secret}>
                    {secret.secret}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase whitespace-nowrap">
                    [Stripped in ViewState]
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Canonical World Truth */}
            <div className="bg-stone-950/80 rounded-xl p-4 border border-red-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-red-400 uppercase flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  1. Canonical World Truth
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-800">
                  Core Engine Only
                </span>
              </div>
              <p className="text-xs text-stone-400">
                The objective, deterministic state of Dreamville. Held strictly in the core engine repository.
              </p>
              <div className="bg-stone-900/90 rounded p-2 text-[11px] font-mono text-stone-400 border border-stone-800 italic">
                Example: Elian holds the master vault key in his robe; the 3rd prism fractured due to a subterranean seismic fissure.
              </div>
            </div>

            {/* 2. Player Knowledge */}
            <div className="bg-stone-950/80 rounded-xl p-4 border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  2. Player Knowledge
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                  Active Display Scope
                </span>
              </div>
              <p className="text-xs text-stone-400">
                What Scribe Vael has directly observed, heard, or read. The external client renders ONLY this layer.
              </p>
              <div className="bg-stone-900/90 rounded p-2 text-[11px] font-mono text-emerald-300/90 border border-stone-800">
                Visible: The Whispering Orrery rings stopped rotating. Glasswood requires an astrolabe and spores.
              </div>
            </div>

            {/* 3. NPC Knowledge */}
            <div className="bg-stone-950/80 rounded-xl p-4 border border-blue-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-blue-400 uppercase flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  3. NPC Knowledge
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800">
                  Character Bounded
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Characters only possess localized memory and lore corresponding to their role, rank, and presence.
              </p>
              <div className="bg-stone-900/90 rounded p-2 text-[11px] font-mono text-stone-400 border border-stone-800">
                Maren knows border routes; Sentry Kaelen knows transit seals. Neither possesses omniscient lore.
              </div>
            </div>

            {/* 4. AI Context */}
            <div className="bg-stone-950/80 rounded-xl p-4 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400 uppercase flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  4. Bounded AI Context
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800">
                  Downstream Proposal
                </span>
              </div>
              <p className="text-xs text-stone-400">
                AI receives only filtered, bounded context for prose generation. AI proposals are validated before canonical commit.
              </p>
              <div className="bg-stone-900/90 rounded p-2 text-[11px] font-mono text-amber-300/90 border border-stone-800">
                Flow: Canonical State → Deterministic Filtering → Bounded AI Context → Validation → Presentation.
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-stone-800 text-center">
            <button
              id="confirm-epistemic-understood"
              onClick={onClose}
              className="px-6 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-medium transition"
            >
              Return to Presentation Client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
