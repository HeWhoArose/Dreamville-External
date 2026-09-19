import React, { useEffect, useState } from 'react';
import { Search, X, ShieldCheck, FileText, CheckCircle, ExternalLink } from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface ProvenanceInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
  targetId: string;
}

export const ProvenanceInspectorModal: React.FC<ProvenanceInspectorModalProps> = ({
  isOpen,
  onClose,
  storyId,
  targetId,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && storyId && targetId) {
      setLoading(true);
      setError(null);
      apiClient
        .getRecordProvenance(storyId, targetId)
        .then((res) => {
          setData(res);
          setLoading(false);
        })
        .catch((err) => {
          setError(err?.message || 'Failed to fetch provenance');
          setLoading(false);
        });
    }
  }, [isOpen, storyId, targetId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-3.5 bg-stone-950">
          <div className="flex items-center gap-2.5 text-xs font-mono text-amber-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Provenance Audit Inspector</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-stone-400 hover:text-stone-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
          {loading ? (
            <div className="p-8 text-center text-stone-400 font-mono">Loading provenance record...</div>
          ) : error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg">{error}</div>
          ) : data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-stone-950 border border-stone-800 rounded-lg font-mono">
                <div>
                  <span className="text-stone-500 block text-[10px]">RECORD ID</span>
                  <span className="text-stone-200">{data.targetId}</span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[10px]">PROVENANCE CLASS</span>
                  <span className="text-amber-300 font-bold">{data.provenanceClass}</span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[10px]">CONFIDENCE</span>
                  <span className="text-emerald-400">{Math.round(data.confidence * 100)}%</span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[10px]">RECORD TYPE</span>
                  <span className="text-stone-300">{data.recordType}</span>
                </div>
              </div>

              <div>
                <h4 className="text-amber-400 font-mono text-[11px] mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Anchored Source Excerpt</span>
                </h4>
                <div className="p-3 bg-stone-950 border border-stone-800 rounded-lg text-stone-300 font-serif leading-relaxed text-xs max-h-[200px] overflow-y-auto">
                  {data.sourceExcerpt}
                </div>
              </div>

              <div>
                <span className="text-stone-500 font-mono text-[10px] block mb-1">
                  ANCHORED SEGMENT IDS:
                </span>
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                  {data.sourceSegmentIds.map((segId: string) => (
                    <span key={segId} className="px-2 py-0.5 bg-stone-800 border border-stone-700 text-stone-300 rounded">
                      {segId}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-800 px-5 py-3 bg-stone-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-mono"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
