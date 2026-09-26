import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardList,
  History,
  Loader2,
  ScrollText,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface ChronicleViewProps {
  storyId?: string;
  actionHistory: any[];
  dialogueHistory?: Array<{ speaker: string; text: string; cycle: number }>;
}

type QuestStatus = 'ACTIVE' | 'COMPLETED' | 'FAILED';

interface QuestObjective {
  id: string;
  title: string;
  description?: string;
  status?: 'ACTIVE' | 'COMPLETED';
  completed?: boolean;
}

interface QuestRecord {
  id: string;
  title: string;
  description?: string;
  status: QuestStatus;
  objectives?: QuestObjective[];
}

interface JournalEntry {
  id: string;
  kind: 'action' | 'dialogue';
  cycle: number;
  speaker?: string;
  actionText?: string;
  outcomeText?: string;
  text?: string;
}

export const ChronicleView: React.FC<ChronicleViewProps> = ({
  storyId,
  actionHistory = [],
  dialogueHistory = [],
}) => {
  const [section, setSection] = useState<'quests' | 'journal'>('quests');
  const [questTab, setQuestTab] = useState<'ACTIVE' | 'COMPLETED' | 'FAILED'>('ACTIVE');
  const [quests, setQuests] = useState<{ active: QuestRecord[]; completed: QuestRecord[]; failed: QuestRecord[] }>({
    active: [],
    completed: [],
    failed: [],
  });
  const [loading, setLoading] = useState(Boolean(storyId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!storyId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.getRunCanonicalState(storyId);
        if (!cancelled) {
          setQuests({
            active: Array.isArray(data?.quests?.active) ? data.quests.active : [],
            completed: Array.isArray(data?.quests?.completed) ? data.quests.completed : [],
            failed: Array.isArray(data?.quests?.failed) ? data.quests.failed : [],
          });
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load quests.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  const journalEntries = useMemo<JournalEntry[]>(() => {
    const entries: JournalEntry[] = [];

    for (const action of actionHistory || []) {
      if (!action || action.actionType === 'NOTE_RECORD') continue;

      const actionText = String(action.description || '').trim();
      const outcomeText = String(action.narrativeResponse || '').trim();

      entries.push({
        id: `action-${action.id}`,
        kind: 'action',
        cycle: Number(action.cycle) || 0,
        actionText: actionText || 'Action recorded.',
        outcomeText: outcomeText || undefined,
      });
    }

    for (const dialogue of dialogueHistory || []) {
      const text = String(dialogue?.text || '').trim();
      if (!text) continue;

      entries.push({
        id: `dialogue-${dialogue.cycle}-${entries.length}`,
        kind: 'dialogue',
        cycle: Number(dialogue.cycle) || 0,
        speaker: dialogue.speaker || 'Character',
        text,
      });
    }

    return entries
      .sort((a, b) => a.cycle - b.cycle)
      .slice(-80)
      .reverse();
  }, [actionHistory, dialogueHistory]);

  const activeRecords =
    questTab === 'ACTIVE' ? quests.active : questTab === 'COMPLETED' ? quests.completed : quests.failed;

  const statusMeta = {
    ACTIVE: {
      label: 'In Progress',
      icon: Circle,
      className: 'text-violet-300 border-violet-400/20 bg-violet-500/10',
    },
    COMPLETED: {
      label: 'Completed',
      icon: CheckCircle2,
      className: 'text-emerald-300 border-emerald-400/20 bg-emerald-500/10',
    },
    FAILED: {
      label: 'Failed',
      icon: XCircle,
      className: 'text-rose-300 border-rose-400/20 bg-rose-500/10',
    },
  } as const;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-3xl border border-violet-400/10 bg-[#0b0813]/90 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/75">Story record</p>
            <h1 className="mt-1 font-serif text-2xl font-semibold text-white sm:text-3xl">Quests & Journal</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
              Quests hold your objectives. Journal keeps a readable record of your actions, their outcomes, and important conversations.
            </p>
          </div>
          <ScrollText className="hidden h-8 w-8 text-violet-300/60 sm:block" />
        </div>

        <div className="mt-5 inline-flex rounded-2xl border border-white/8 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => setSection('quests')}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${section === 'quests' ? 'bg-violet-500/15 text-white' : 'text-stone-500 hover:text-stone-200'}`}
          >
            <span className="inline-flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Quests</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('journal')}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${section === 'journal' ? 'bg-violet-500/15 text-white' : 'text-stone-500 hover:text-stone-200'}`}
          >
            <span className="inline-flex items-center gap-2"><History className="h-4 w-4" /> Journal</span>
          </button>
        </div>
      </header>

      {section === 'quests' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2 border-b border-white/8 pb-3">
            {(Object.keys(statusMeta) as Array<keyof typeof statusMeta>).map((status) => {
              const count = status === 'ACTIVE' ? quests.active.length : status === 'COMPLETED' ? quests.completed.length : quests.failed.length;
              const MetaIcon = statusMeta[status].icon;
              const selected = questTab === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setQuestTab(status)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${selected ? statusMeta[status].className : 'border-white/8 bg-white/[0.02] text-stone-500 hover:text-stone-200'}`}
                >
                  <MetaIcon className="h-3.5 w-3.5" />
                  {statusMeta[status].label}
                  <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">{count}</span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="rounded-3xl border border-white/8 bg-[#0b0813]/75 p-10 text-center text-sm text-stone-500">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-violet-300" />
              Loading quests…
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-400/15 bg-rose-500/5 p-6 text-sm text-rose-200">
              {error}
            </div>
          ) : activeRecords.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-[#0b0813]/60 p-10 text-center">
              <Sparkles className="mx-auto mb-3 h-6 w-6 text-violet-300/60" />
              <h2 className="text-base font-medium text-stone-200">
                {questTab === 'ACTIVE' ? 'No active quests' : questTab === 'COMPLETED' ? 'No completed quests yet' : 'No failed quests'}
              </h2>
              <p className="mt-2 text-sm text-stone-600">
                {questTab === 'ACTIVE'
                  ? 'A quest will appear here only when the canonical world state creates an explicit quest or mission objective.'
                  : 'This section updates when the canonical quest state changes.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeRecords.map((quest) => {
                const meta = statusMeta[quest.status];
                const MetaIcon = meta.icon;
                const objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
                return (
                  <article key={quest.id} className="rounded-3xl border border-white/8 bg-[#0b0813]/80 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <MetaIcon className="h-4 w-4 text-violet-300" />
                          <h2 className="font-serif text-lg font-semibold text-white">{quest.title || 'Untitled Quest'}</h2>
                        </div>
                        {quest.description && <p className="mt-2 text-sm leading-relaxed text-stone-400">{quest.description}</p>}
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}>
                        {meta.label}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/6 bg-black/15 px-3 py-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-stone-300">
                        <ClipboardList className="h-3.5 w-3.5 text-violet-300" />
                        Objectives
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">
                        {objectives.filter((objective: any) => Boolean(objective?.completed || objective?.status === 'COMPLETED')).length} / {objectives.length}
                      </span>
                    </div>

                    <div className="mt-4">
                      {objectives.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/8 px-3 py-3 text-sm text-stone-600">
                          No structured objectives are recorded for this quest yet.
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {objectives.map((objective: any, index: number) => {
                            const done = Boolean(objective?.completed || objective?.status === 'COMPLETED');
                            return (
                              <li
                                key={objective?.id || index}
                                className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm ${
                                  done
                                    ? 'border-emerald-400/10 bg-emerald-500/[0.04] text-stone-400'
                                    : 'border-white/6 bg-black/10 text-stone-200'
                                }`}
                              >
                                {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-stone-600" />}
                                <span className={done ? 'line-through decoration-stone-600' : ''}>
                                  {objective?.title || objective?.description || objective?.text || String(objective)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          {journalEntries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-[#0b0813]/60 p-10 text-center">
              <BookOpen className="mx-auto mb-3 h-6 w-6 text-violet-300/60" />
              <h2 className="text-base font-medium text-stone-200">Your journal is empty</h2>
              <p className="mt-2 text-sm text-stone-600">Your actions, their outcomes, and important conversations will appear here as the story unfolds.</p>
            </div>
          ) : (
            journalEntries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-2xl border border-white/8 bg-[#0b0813]/75 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-xl bg-violet-500/10 p-2">
                    {entry.kind === 'dialogue'
                      ? <BookOpen className="h-4 w-4 text-fuchsia-300" />
                      : <History className="h-4 w-4 text-violet-300" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-stone-200">
                        {entry.kind === 'dialogue' ? entry.speaker : 'Your move'}
                      </h3>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-stone-600">
                        Cycle {entry.cycle}
                      </span>
                    </div>

                    {entry.kind === 'dialogue' ? (
                      <p className="mt-2 text-sm leading-relaxed text-stone-300">
                        “{entry.text}”
                      </p>
                    ) : (
                      <div className="mt-2 space-y-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600">
                            Action
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-stone-300">
                            {entry.actionText}
                          </p>
                        </div>

                        {entry.outcomeText && (
                          <div className="border-t border-white/6 pt-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300/70">
                              Outcome
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-stone-400">
                              {entry.outcomeText}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )))}
        </section>
      )}
    </div>
  );
};
