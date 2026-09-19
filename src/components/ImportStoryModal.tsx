import React, { useState } from 'react';
import {
  BookOpen,
  FileText,
  Upload,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Sparkles,
  GitBranch,
  Shield,
  Layers,
  Search,
  User,
  Compass,
  SlidersHorizontal,
  HelpCircle,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface ImportStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryAdapted: (storyId: string) => void;
}

export const ImportStoryModal: React.FC<ImportStoryModalProps> = ({
  isOpen,
  onClose,
  onStoryAdapted,
}) => {
  const [sourceType, setSourceType] = useState<'paste' | 'file' | 'saved' | 'previous'>('paste');
  const [title, setTitle] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [currentStage, setCurrentStage] = useState<number>(0);
  const [stageNames] = useState<string[]>([
    'Ingest',
    'Segment',
    'Extract',
    'Normalize',
    'Resolve',
    'Build Story Bible',
    'Choose Entry Point',
    'Instantiate Player',
    'Create Adaptation Session',
  ]);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  // Profile Settings
  const [mode, setMode] = useState<'Faithful Adaptation' | 'Guided Divergence' | 'Alternate Timeline' | 'Remix'>('Faithful Adaptation');
  const [canonStrictness, setCanonStrictness] = useState<'Strict' | 'Balanced' | 'Flexible'>('Strict');
  const [divergencePoint, setDivergencePoint] = useState<'Beginning' | 'Selected Scene' | 'Custom Anchor'>('Beginning');
  const [plotGravity, setPlotGravity] = useState<'Strong' | 'Medium' | 'Light'>('Strong');
  const [playerRole, setPlayerRole] = useState<'Original Protagonist' | 'Existing Character' | 'New Companion' | 'Observer'>('Original Protagonist');
  const [characterFidelity, setCharacterFidelity] = useState<'Strict' | 'Naturalized' | 'Experimental'>('Strict');
  const [worldExpansion, setWorldExpansion] = useState<'Minimal' | 'Moderate' | 'Expansive'>('Moderate');

  // Review Payload
  const [reviewData, setReviewData] = useState<any | null>(null);
  const [activeReviewTab, setActiveReviewTab] = useState<'identity' | 'characters' | 'world' | 'timeline' | 'loops' | 'insertion' | 'controls' | 'conflicts'>('identity');
  const [selectedEntryPoint, setSelectedEntryPoint] = useState<string>('');
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [conflictOverrideInput, setConflictOverrideInput] = useState<string>('');

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTitle(file.name.replace(/\.[^/.]+$/, ''));
    const reader = new FileReader();
    reader.onload = (event) => {
      setRawText((event.target?.result as string) || '');
    };
    reader.readAsText(file);
  };

  const handleRunAnalysis = async () => {
    if (!rawText.trim()) return;
    setIsAnalyzing(true);
    setErrorReason(null);
    setReviewData(null);

    const generatedStoryId = `adapted_${title.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'story'}_${Date.now().toString(36)}`;

    // Real server-driven status polling (DEF-CH15-04)
    setCurrentStage(1);
    const pollInterval = setInterval(async () => {
      try {
        const statusData = await apiClient.getAdaptationStatus(generatedStoryId);
        if (statusData?.pipelineState) {
          setCurrentStage(statusData.pipelineState.currentStage || 1);
        }
      } catch {
        // Status before initial seed is handled gracefully
      }
    }, 200);

    try {
      const result = await apiClient.analyzeStoryAdaptation({
        storyId: generatedStoryId,
        title: title || 'Untitled Source Story',
        rawText,
        profile: {
          mode,
          canonStrictness,
          divergencePoint,
          plotGravity,
          playerRole,
          characterFidelity,
          worldExpansion,
        },
      });

      clearInterval(pollInterval);
      setCurrentStage(9);
      setReviewData(result);
      if (result.bible?.entryPoints?.[0]?.id) {
        setSelectedEntryPoint(result.bible.entryPoints[0].id);
      }
    } catch (err: any) {
      clearInterval(pollInterval);
      setErrorReason(err?.message || 'Pipeline analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResolveConflict = async (conflictId: string) => {
    if (!reviewData || !conflictOverrideInput.trim()) return;
    setResolvingConflictId(conflictId);
    try {
      const res = await apiClient.resolveAdaptationConflict(
        reviewData.bible.storyId,
        conflictId,
        conflictOverrideInput
      );
      setReviewData((prev: any) => ({
        ...prev,
        bible: res.bible,
      }));
      setConflictOverrideInput('');
    } catch (err: any) {
      alert(`Conflict resolution failed: ${err?.message}`);
    } finally {
      setResolvingConflictId(null);
    }
  };

  const handleStepInsideAndPlay = async () => {
    if (!reviewData) return;
    try {
      await apiClient.analyzeStoryAdaptation({
        storyId: reviewData.bible.storyId,
        title: reviewData.bible.title,
        rawText,
        profile: {
          mode,
          canonStrictness,
          divergencePoint,
          plotGravity,
          playerRole,
          characterFidelity,
          worldExpansion,
        },
        options: {
          selectedEntryPointId: selectedEntryPoint,
        },
      });
      onStoryAdapted(reviewData.bible.storyId);
      onClose();
    } catch (err: any) {
      alert(`Failed to start playable session: ${err?.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-stone-900 border border-stone-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 px-6 py-4 bg-stone-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-medium text-stone-100">Bring a Story to Life</h2>
              <p className="text-xs text-stone-400">Use a story you already have, then step inside it.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {!reviewData ? (
            <>
              {/* Source Selection Tabs */}
              <div className="flex border-b border-stone-800 gap-2 font-mono text-xs">
                {[
                  { id: 'paste', label: 'Paste Text', icon: FileText },
                  { id: 'file', label: 'Import File (.txt, .md)', icon: Upload },
                  { id: 'saved', label: 'Use Saved Story', icon: BookOpen },
                  { id: 'previous', label: 'Continue Previous Import', icon: GitBranch },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = sourceType === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setSourceType(tab.id as any)}
                      className={`flex items-center gap-2 px-3 py-2 border-b-2 transition ${
                        isActive
                          ? 'border-amber-400 text-amber-300 font-medium'
                          : 'border-transparent text-stone-400 hover:text-stone-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Title & Input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-stone-400 mb-1">Story Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. The Sorcerer's Apprentice"
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/50 font-sans"
                  />
                </div>

                {sourceType === 'paste' && (
                  <div>
                    <label className="block text-xs font-mono text-stone-400 mb-1">Source Text</label>
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      rows={8}
                      placeholder="Paste your chapter, book excerpt, short story, or narrative prose here..."
                      className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-sm font-serif text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/50 leading-relaxed"
                    />
                  </div>
                )}

                {sourceType === 'file' && (
                  <div className="border-2 border-dashed border-stone-800 rounded-xl p-8 text-center hover:border-amber-500/40 transition">
                    <Upload className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-stone-300">Upload Source File</p>
                    <p className="text-xs text-stone-500 mt-1">Plain text (.txt) or Markdown (.md)</p>
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={handleFileUpload}
                      className="mt-4 text-xs text-stone-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-stone-800 file:text-amber-300 hover:file:bg-stone-700"
                    />
                  </div>
                )}

                {sourceType === 'saved' && (
                  <div className="p-4 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-400">
                    <p>Select from existing saved stories in your workstation catalog.</p>
                    <button
                      onClick={() => {
                        setTitle('The Echoes of Aethelgard');
                        setRawText('In the shadows of the Whispering Orrery, Scribe Vael discovered the sealed brass cylinder...');
                      }}
                      className="mt-3 px-3 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-mono"
                    >
                      Load Sample: The Echoes of Aethelgard
                    </button>
                  </div>
                )}

                {sourceType === 'previous' && (
                  <div className="p-4 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-400">
                    <p>Resume a previously created story adaptation session.</p>
                  </div>
                )}
              </div>

              {/* Adaptation Profile Controls Grid */}
              <div className="border border-stone-800 rounded-xl bg-stone-950/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Adaptation Parameters & Strictness</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-stone-400 block mb-1">Mode</label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as any)}
                      className="w-full bg-stone-900 border border-stone-800 rounded px-2 py-1.5 text-stone-200"
                    >
                      <option value="Faithful Adaptation">Faithful Adaptation</option>
                      <option value="Guided Divergence">Guided Divergence</option>
                      <option value="Alternate Timeline">Alternate Timeline</option>
                      <option value="Remix">Remix</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-stone-400 block mb-1">Canon Strictness</label>
                    <select
                      value={canonStrictness}
                      onChange={(e) => setCanonStrictness(e.target.value as any)}
                      className="w-full bg-stone-900 border border-stone-800 rounded px-2 py-1.5 text-stone-200"
                    >
                      <option value="Strict">Strict (Forbidden Contradictions)</option>
                      <option value="Balanced">Balanced (Guided Branches)</option>
                      <option value="Flexible">Flexible (Open World)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-stone-400 block mb-1">Player Role</label>
                    <select
                      value={playerRole}
                      onChange={(e) => setPlayerRole(e.target.value as any)}
                      className="w-full bg-stone-900 border border-stone-800 rounded px-2 py-1.5 text-stone-200"
                    >
                      <option value="Original Protagonist">Original Protagonist</option>
                      <option value="Existing Character">Existing Character</option>
                      <option value="New Companion">New Companion</option>
                      <option value="Observer">Observer</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Progress Bar during Pipeline execution */}
              {isAnalyzing && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono text-amber-300">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      Running 9-Stage Story Adaptation Pipeline...
                    </span>
                    <span>Stage {currentStage} / 9</span>
                  </div>
                  <div className="w-full bg-stone-950 rounded-full h-2 overflow-hidden border border-amber-500/20">
                    <div
                      className="bg-amber-400 h-full transition-all duration-300"
                      style={{ width: `${(currentStage / 9) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-mono text-stone-400">
                    Current Stage: <span className="text-amber-200">{stageNames[currentStage - 1] || 'Processing'}</span>
                  </p>
                </div>
              )}

              {errorReason && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorReason}</span>
                </div>
              )}
            </>
          ) : (
            /* Structured Adaptation Review UI */
            <div className="space-y-4">
              {/* Success Badge */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Story Adaptation Pipeline Completed (9/9 Stages)</span>
                </div>
                <span className="text-[11px] font-mono text-stone-400">
                  Bible Revision #{reviewData.bible.revision}
                </span>
              </div>

              {/* Review Section Tabs */}
              <div className="flex flex-wrap border-b border-stone-800 gap-1 text-xs font-mono">
                {[
                  { id: 'identity', label: 'Story Identity' },
                  { id: 'characters', label: `Characters (${reviewData.bible.canonEntities.filter((e: any) => e.entityType === 'character').length})` },
                  { id: 'world', label: `World (${reviewData.bible.canonEntities.filter((e: any) => e.entityType === 'location').length})` },
                  { id: 'timeline', label: `Events (${reviewData.bible.canonEvents.length})` },
                  { id: 'loops', label: `Open Loops (${reviewData.bible.openLoops.length})` },
                  { id: 'insertion', label: 'Player Insertion' },
                  { id: 'controls', label: 'Adaptation Controls' },
                  { id: 'conflicts', label: `Conflicts (${reviewData.bible.conflicts.length})` },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveReviewTab(t.id as any)}
                    className={`px-3 py-1.5 rounded-t border-t border-x transition ${
                      activeReviewTab === t.id
                        ? 'bg-stone-800 text-amber-300 border-stone-700 font-medium'
                        : 'bg-stone-950/40 text-stone-400 border-transparent hover:text-stone-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Review Active Tab Content */}
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 min-h-[220px]">
                {activeReviewTab === 'identity' && (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-stone-500 font-mono block">TITLE</span>
                        <span className="text-stone-200 font-serif text-sm">{reviewData.bible.title}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 font-mono block">SOURCE HASH</span>
                        <span className="text-stone-400 font-mono text-[11px]">{reviewData.bible.sourceHash}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 font-mono block">FORMAT</span>
                        <span className="text-amber-300 font-mono">{reviewData.bible.format}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 font-mono block">SEGMENT COUNT</span>
                        <span className="text-stone-300 font-mono">{reviewData.bible.segments.length} Anchored Segments</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeReviewTab === 'characters' && (
                  <div className="space-y-2 text-xs">
                    <h4 className="text-amber-400 font-mono text-[11px] uppercase tracking-wider mb-2">Extracted Characters & Entities</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {reviewData.bible.canonEntities
                        .filter((e: any) => e.entityType === 'character')
                        .map((c: any) => (
                          <div key={c.id} className="p-2.5 bg-stone-900 border border-stone-800 rounded-lg flex items-center justify-between">
                            <div>
                              <span className="text-stone-200 font-medium block">{c.displayName}</span>
                              <span className="text-[10px] text-stone-500 font-mono">
                                Provenance: {c.provenanceClass} ({c.sourceSegmentIds.length} segments)
                              </span>
                            </div>
                            <User className="w-4 h-4 text-amber-400/60" />
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {activeReviewTab === 'world' && (
                  <div className="space-y-2 text-xs">
                    <h4 className="text-amber-400 font-mono text-[11px] uppercase tracking-wider mb-2">Extracted Setting & Locations</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {reviewData.bible.canonEntities
                        .filter((e: any) => e.entityType === 'location')
                        .map((l: any) => (
                          <div key={l.id} className="p-2.5 bg-stone-900 border border-stone-800 rounded-lg flex items-center justify-between">
                            <div>
                              <span className="text-stone-200 font-medium block">{l.displayName}</span>
                              <span className="text-[10px] text-stone-500 font-mono">
                                Anchored Location • {l.sourceSegmentIds.length} source citations
                              </span>
                            </div>
                            <Compass className="w-4 h-4 text-amber-400/60" />
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {activeReviewTab === 'timeline' && (
                  <div className="space-y-2 text-xs">
                    <h4 className="text-amber-400 font-mono text-[11px] uppercase tracking-wider mb-2">Chronological Events</h4>
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                      {reviewData.bible.canonEvents.map((ev: any) => (
                        <div key={ev.id} className="p-2 bg-stone-900 border border-stone-800 rounded flex items-center gap-3 font-mono text-[11px]">
                          <span className="text-amber-400 font-bold">#{ev.sequenceKey}</span>
                          <span className="text-stone-300 flex-1">{ev.description}</span>
                          <span className="text-stone-500 text-[10px]">{ev.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeReviewTab === 'loops' && (
                  <div className="space-y-2 text-xs">
                    <h4 className="text-amber-400 font-mono text-[11px] uppercase tracking-wider mb-2">Unresolved Plot Loops & Mysteries</h4>
                    <ul className="space-y-1 text-stone-300">
                      {reviewData.bible.openLoops.map((loop: string, idx: number) => (
                        <li key={idx} className="p-2 bg-stone-900 border border-stone-800 rounded flex items-center gap-2">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{loop}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeReviewTab === 'insertion' && (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-stone-400 font-mono block mb-1">Select Starting Scene Entry Point</label>
                      <select
                        value={selectedEntryPoint}
                        onChange={(e) => setSelectedEntryPoint(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-800 rounded px-2 py-1.5 text-stone-200 font-mono"
                      >
                        {reviewData.bible.entryPoints.map((ep: any) => (
                          <option key={ep.id} value={ep.id}>
                            {ep.title} — {ep.description}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="p-3 bg-stone-900 border border-stone-800 rounded text-stone-300 font-mono text-[11px]">
                      Selected Role: <span className="text-amber-300 font-bold">{reviewData.session.playerRole}</span>
                    </div>
                  </div>
                )}

                {activeReviewTab === 'conflicts' && (
                  <div className="space-y-3 text-xs">
                    {reviewData.bible.conflicts.length === 0 ? (
                      <p className="text-stone-500 font-mono">No unresolved source canon conflicts detected.</p>
                    ) : (
                      reviewData.bible.conflicts.map((conf: any) => (
                        <div key={conf.id} className="p-3 bg-stone-900 border border-amber-500/30 rounded-lg space-y-2">
                          <div className="flex items-center justify-between text-amber-300 font-mono font-bold">
                            <span>{conf.conflictType}</span>
                            <span className="text-[10px] text-stone-400">{conf.status}</span>
                          </div>
                          <p className="text-stone-300 text-[11px]">{conf.description}</p>
                          {conf.status === 'UNRESOLVED' ? (
                            <div className="flex gap-2 mt-2">
                              <input
                                type="text"
                                value={conflictOverrideInput}
                                onChange={(e) => setConflictOverrideInput(e.target.value)}
                                placeholder="Enter user override resolution..."
                                className="flex-1 bg-stone-950 border border-stone-800 rounded px-2 py-1 text-stone-200 text-xs font-mono"
                              />
                              <button
                                onClick={() => handleResolveConflict(conf.id)}
                                disabled={resolvingConflictId === conf.id}
                                className="px-3 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 font-mono text-xs"
                              >
                                {resolvingConflictId === conf.id ? 'Resolving...' : 'Resolve'}
                              </button>
                            </div>
                          ) : (
                            <p className="text-emerald-400 font-mono text-[10px]">Resolved: {conf.resolution}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-stone-800 px-6 py-4 bg-stone-950/70 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-mono text-stone-400 hover:text-stone-200 transition"
          >
            Cancel
          </button>

          {!reviewData ? (
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing || !rawText.trim()}
              className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-medium text-xs flex items-center gap-2 shadow-lg transition"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing Story...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analyze Story</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleStepInsideAndPlay}
              className="px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-medium text-xs flex items-center gap-2 shadow-lg transition"
            >
              <Compass className="w-4 h-4" />
              <span>Step Inside & Play</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
