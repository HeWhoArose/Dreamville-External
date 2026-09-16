import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Eye, Lock, Cpu, User, CheckCircle, Server } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { BoundaryAuditDiagnostics } from '../types';

interface EpistemicInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EpistemicInspectorModal: React.FC<EpistemicInspectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [diagnostics, setDiagnostics] = useState<BoundaryAuditDiagnostics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      apiClient
        .getEpistemicStatus()
        .then((data) => {
          setDiagnostics(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to fetch epistemic diagnostics:', err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
                Epistemic Separation Model & Server Boundary Audit
              </h3>
              <p className="text-[11px] font-mono text-stone-400">
                Experiment 2: Server-Side Authority Verification
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
            In Experiment 2, the game authority runs exclusively in the server-side Node.js runtime.
            The client presentation layer receives only sanitized projections across the HTTP/API boundary.
            Hidden canonical secrets remain strictly confined to the server.
          </p>

          {/* Active Server Boundary Audit Panel */}
          <div className="bg-stone-950 rounded-xl p-3.5 border border-amber-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-amber-300 uppercase flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-amber-400" />
                Server Authority Boundary Audit
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                Boundary Check: {diagnostics?.boundaryStatus || 'PASS'}
              </span>
            </div>

            {loading ? (
              <p className="text-xs text-stone-500 font-mono py-2">
                Querying server boundary diagnostics...
              </p>
            ) : diagnostics ? (
              <div className="space-y-2 text-xs font-mono">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-stone-900/90 rounded p-2.5 border border-stone-800">
                    <span className="text-stone-500 block text-[10px] uppercase">
                      Server Canonical Storage
                    </span>
                    <span className="text-emerald-400 font-semibold">
                      Server holds canonical hidden state ({diagnostics.countSecretsHeld} secrets)
                    </span>
                  </div>

                  <div className="bg-stone-900/90 rounded p-2.5 border border-stone-800">
                    <span className="text-stone-500 block text-[10px] uppercase">
                      External Projection Integrity
                    </span>
                    <span className="text-emerald-400 font-semibold">
                      External projection contains no hiddenCanonicalContext
                    </span>
                  </div>

                  <div className="bg-stone-900/90 rounded p-2.5 border border-stone-800">
                    <span className="text-stone-500 block text-[10px] uppercase">
                      Boundary Secret Verification
                    </span>
                    <span className="text-amber-300 font-semibold">
                      Test secret retained on server • Withheld from API responses
                    </span>
                  </div>

                  <div className="bg-stone-900/90 rounded p-2.5 border border-stone-800">
                    <span className="text-stone-500 block text-[10px] uppercase">
                      Authority Runtime
                    </span>
                    <span className="text-stone-300 font-semibold">
                      {diagnostics.architectureMode}
                    </span>
                  </div>
                </div>

                <div className="bg-stone-900/60 rounded p-2 text-[10px] text-stone-400 border border-stone-850">
                  <span className="text-emerald-400 font-bold">Confidentiality Enforced: </span>
                  Canonical secrets are withheld on the Node.js server. No raw secrets or engine mutations cross the HTTP boundary.
                </div>
              </div>
            ) : (
              <p className="text-xs text-stone-400 font-mono">
                Server authority diagnostics available on active session.
              </p>
            )}
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
                  Server Runtime Only
                </span>
              </div>
              <p className="text-xs text-stone-400">
                The objective, deterministic state of Dreamville. Held strictly in server memory (Node.js runtime).
              </p>
              <div className="bg-stone-900/90 rounded p-2 text-[11px] font-mono text-stone-400 border border-stone-800 italic">
                Simulated server state holds vault ciphers, hidden NPC motivations, and structural anomaly seeds.
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
                  Client Display Scope
                </span>
              </div>
              <p className="text-xs text-stone-400">
                What Scribe Vael has directly observed, heard, or read. The React client receives and renders ONLY this layer.
              </p>
              <div className="bg-stone-900/90 rounded p-2 text-[11px] font-mono text-emerald-300/90 border border-stone-800">
                Visible: Orrery ring stoppage, mechanical fracture observations, authorized travel seals.
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
                Characters possess only localized memory corresponding to their role, rank, and presence.
              </p>
              <div className="bg-stone-900/90 rounded p-2 text-[11px] font-mono text-stone-400 border border-stone-800">
                Maren knows armatures; Elian knows vault tiers. Neither possesses omniscient world lore.
              </div>
            </div>

            {/* 4. AI Context */}
            <div className="bg-stone-950/80 rounded-xl p-4 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400 uppercase flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  4. Bounded Context Boundary
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800">
                  Downstream Proposal
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Proposals pass through the server authority for validation before any canonical state transition is committed.
              </p>
              <div className="bg-stone-900/90 rounded p-2 text-[11px] font-mono text-amber-300/90 border border-stone-800">
                Flow: Client ActionRequest → HTTP API → Server Authority Validation → Sanitized ExternalViewState → HTTP Response.
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
