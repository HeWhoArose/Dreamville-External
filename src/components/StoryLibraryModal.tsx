import React, { useState, useEffect } from 'react';
import {
  Library,
  BookOpen,
  Sparkles,
  GitBranch,
  Play,
  Copy,
  Download,
  X,
  Loader2,
  CheckCircle2,
  Sliders,
  Shield,
  Layers,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface StoryLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStory: (storyId: string) => void;
  activeStoryId?: string;
}

export const StoryLibraryModal: React.FC<StoryLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectStory,
  activeStoryId = 'default_story',
}) => {
  const [stories, setStories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicatingStoryId, setDuplicatingStoryId] = useState<string | null>(null);
  const [newBranchInput, setNewBranchInput] = useState<string>('');

  const fetchStories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await apiClient.getStoryRuns();
      setStories(list);
    } catch (err: any) {
      setError(err?.message || 'Failed to load story library.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStories();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectStory = async (storyId: string) => {
    try {
      await apiClient.selectActiveStory(storyId);
      onSelectStory(storyId);
      onClose();
    } catch (err: any) {
      alert(`Failed to activate story: ${err?.message}`);
    }
  };

  const handleDuplicateBranch = async (storyId: string) => {
    if (!newBranchInput.trim()) return;
    try {
      const newBranchId = `branch_${newBranchInput.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;
      await apiClient.duplicateAdaptationBranch(storyId, newBranchId);
      setDuplicatingStoryId(null);
      setNewBranchInput('');
      await fetchStories();
    } catch (err: any) {
      alert(`Branch duplication failed: ${err?.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Library className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                Adapted Story Library & Dashboard
              </h2>
              <p className="text-xs text-slate-400">
                Browse, manage, branch, and active switch across canon source adapters and alternate timelines.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm">Fetching adapted stories from server authority...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          ) : stories.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-base font-medium">No Adapted Stories Found</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Import a narrative source document using the Adapt Story workflow to generate your first adapted campaign.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stories.map((story) => {
                const isActive = story.storyId === activeStoryId;
                const isDefault = story.storyId === 'default_story';

                return (
                  <div
                    key={story.storyId}
                    className={`relative flex flex-col justify-between p-5 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-indigo-950/20 border-indigo-500/50 shadow-lg shadow-indigo-950/30'
                        : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            isDefault
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                          }`}
                        >
                          {isDefault ? <Shield className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                          {isDefault ? 'CANONICAL ORIGINAL' : story.mode || 'Adapted Story'}
                        </span>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500 text-white">
                            <CheckCircle2 className="w-3 h-3" /> Active Campaign
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-semibold text-slate-100 mb-1">
                        {story.title || story.storyId}
                      </h3>
                      <p className="text-xs text-slate-400 mb-3 flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                        Branch: <span className="font-mono text-slate-300">{story.branchId || 'main'}</span>
                      </p>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 mb-4 text-slate-300">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Story ID</span>
                          <span className="font-mono text-[11px] truncate block">{story.storyId}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Pipeline Status</span>
                          <span className="text-emerald-400 font-medium">Ready / Complete</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      {duplicatingStoryId === story.storyId ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="New branch name..."
                            value={newBranchInput}
                            onChange={(e) => setNewBranchInput(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDuplicateBranch(story.storyId)}
                              className="flex-1 py-1 px-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded transition-colors"
                            >
                              Create Branch
                            </button>
                            <button
                              onClick={() => setDuplicatingStoryId(null)}
                              className="py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSelectStory(story.storyId)}
                            disabled={isActive}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                              isActive
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                            }`}
                          >
                            <Play className="w-3.5 h-3.5" />
                            {isActive ? 'Currently Active' : 'Step Inside & Play'}
                          </button>
                          {!isDefault && story.isAdapted && (
                            <button
                              onClick={() => setDuplicatingStoryId(story.storyId)}
                              title="Duplicate Adaptation Branch"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-900/80 text-xs text-slate-400">
          <span>Server Authority: Single Instance World Repository</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
