import React, { useState } from 'react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ImageAssetControl } from '../common/ImageAssetControl';
import { CompendiumItem } from './compendiumTypes';

export interface CompendiumDetailProps {
  item: CompendiumItem | null;
  onClose: () => void;
  onAssetChange?: (itemId: string, newUrl?: string, provenance?: string) => void;
}

export const CompendiumDetail: React.FC<CompendiumDetailProps> = ({
  item,
  onClose,
  onAssetChange,
}) => {
  const [entitySection, setEntitySection] = useState<'overview' | 'stats' | 'behavior' | 'social' | 'history'>('overview');

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}
      data-testid="compendium-detail-modal"
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] bg-[var(--db-bg-canvas)] border border-[var(--db-border-purple)] rounded-[var(--db-radius-lg)] shadow-[var(--db-shadow-lg)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-[var(--db-border-default)] bg-[var(--db-bg-raised)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {item.category === 'characters' ? '👤' :
               item.category === 'equipment' ? '⚔️' :
               item.category === 'powers' ? '⚡' :
               item.category === 'npcs' ? '👥' :
               item.category === 'creatures' ? '🐉' :
               item.category === 'worlds' ? '🪐' : '🎨'}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--db-purple-300)]">
                  {item.classification || item.category}
                </span>
                {item.rarityOrThreat && (
                  <Badge variant="gold" size="sm">
                    {item.rarityOrThreat}
                  </Badge>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-[var(--db-text-primary)]">
                {item.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)] hover:bg-[var(--db-bg-card)] rounded-[var(--db-radius-sm)] cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Epistemic Boundary Notice */}
          <div className="p-3 rounded-[var(--db-radius-md)] bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/30 text-xs text-[var(--db-purple-200)] flex items-center gap-2">
            <span className="text-base">🛡</span>
            <span>
              <strong>Personal Compendium Layer:</strong> Reference dossier stored across your library. In-world NPCs and narrative events remain governed by their active world state.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Visual Column */}
            <div className="md:col-span-5 space-y-3">
              <div className="relative rounded-[var(--db-radius-md)] overflow-hidden bg-[var(--db-bg-subtle)] border border-[var(--db-border-default)] aspect-[4/3] flex items-center justify-center">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-4">
                    <span className="text-3xl block mb-1">🖼</span>
                    <span className="text-xs text-[var(--db-text-muted)]">No visual asset assigned</span>
                  </div>
                )}

                <ImageAssetControl
                  meta={{
                    slotId: item.id,
                    slotType:
                      item.category === 'characters' ? 'character_portrait' :
                      item.category === 'npcs' ? 'npc_portrait' :
                      item.category === 'equipment' ? 'equipment' :
                      item.category === 'powers' ? 'skill_icon' :
                      item.category === 'creatures' ? 'creature' :
                      item.category === 'worlds' ? 'world_cover' : 'scene',
                    title: item.title,
                    subject: item.title,
                    traits: item.traits,
                    equipment: item.equipment,
                    setting: item.worldOrigin,
                    currentImageUrl: item.imageUrl,
                  }}
                  onAssetChange={(newUrl, prov) => onAssetChange?.(item.id, newUrl, prov)}
                />
              </div>

              {item.provenance && (
                <div className="p-3 rounded-[var(--db-radius-sm)] bg-[var(--db-bg-card)] border border-[var(--db-border-subtle)] text-[11px] text-[var(--db-text-muted)]">
                  <strong className="text-[var(--db-text-secondary)]">Provenance:</strong> {item.provenance}
                </div>
              )}
            </div>

            {/* Description & Structured Traits */}
            <div className="md:col-span-7 space-y-4">
              <div>
                <h4 className="text-xs uppercase font-semibold text-[var(--db-text-muted)] tracking-wider mb-1">
                  Summary & Overview
                </h4>
                <p className="text-sm text-[var(--db-text-secondary)] leading-relaxed">
                  {item.description}
                </p>
              </div>

              {item.loreSnippet && (
                <div className="p-3.5 rounded-[var(--db-radius-md)] bg-[var(--db-bg-card)] border border-[var(--db-border-purple)]/30 text-xs italic font-serif text-[var(--db-text-primary)] leading-relaxed">
                  "{item.loreSnippet}"
                </div>
              )}

              {item.traits && item.traits.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase font-semibold text-[var(--db-text-muted)] tracking-wider mb-2">
                    Known Attributes & Visual Traits
                  </h4>
                  <ul className="space-y-1 text-xs text-[var(--db-text-secondary)] list-disc list-inside">
                    {item.traits.map((trait, idx) => (
                      <li key={idx}>{trait}</li>
                    ))}
                  </ul>
                </div>
              )}

              {item.stats && Object.keys(item.stats).length > 0 && (
                <div>
                  <h4 className="text-xs uppercase font-semibold text-[var(--db-text-muted)] tracking-wider mb-2">
                    System Parameters & Modifiers
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(item.stats).map(([k, v]) => (
                      <div
                        key={k}
                        className="p-2 rounded bg-[var(--db-bg-card)] border border-[var(--db-border-default)] flex items-center justify-between text-xs"
                      >
                        <span className="text-[var(--db-text-muted)]">{k}</span>
                        <span className="font-mono font-medium text-[var(--db-gold-400)]">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {item.entityCard && (
                <div className="rounded-xl border border-[var(--db-border-purple)]/30 bg-[var(--db-bg-card)] overflow-hidden">
                  <div className="p-3 border-b border-[var(--db-border-subtle)]">
                    <h4 className="text-xs uppercase font-semibold tracking-wider text-[var(--db-text-muted)]">Canonical Entity Card</h4>
                    <p className="text-[11px] text-[var(--db-text-muted)] mt-1">Detailed state is separated into focused sections so the card stays readable on phones.</p>
                  </div>
                  <div className="flex gap-1 overflow-x-auto p-2 border-b border-[var(--db-border-subtle)]">
                    {([
                      ['overview', 'Overview'],
                      ['stats', 'Stats'],
                      ['behavior', 'Behavior'],
                      ['social', 'Social'],
                      ['history', 'History'],
                    ] as const).map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setEntitySection(key)} className={`px-3 py-1.5 rounded-lg text-[11px] whitespace-nowrap ${entitySection === key ? 'bg-[var(--db-surface-purple)] text-[var(--db-purple-200)]' : 'text-[var(--db-text-muted)] hover:bg-[var(--db-bg-raised)]'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="p-4 text-xs text-[var(--db-text-secondary)] space-y-3">
                    {entitySection === 'overview' && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div><span className="text-[var(--db-text-muted)]">Species:</span> {item.entityCard.identity.species || '—'}</div>
                          <div><span className="text-[var(--db-text-muted)]">Kind:</span> {item.entityCard.kind}</div>
                          <div><span className="text-[var(--db-text-muted)]">Profession:</span> {item.entityCard.classification.profession || '—'}</div>
                          <div><span className="text-[var(--db-text-muted)]">Lifecycle:</span> {item.entityCard.lifecycle.status}</div>
                          <div><span className="text-[var(--db-text-muted)]">Activity:</span> {item.entityCard.worldState.currentActivity || '—'}</div>
                          <div><span className="text-[var(--db-text-muted)]">Goal:</span> {item.entityCard.worldState.currentGoal || '—'}</div>
                        </div>
                      </>
                    )}
                    {entitySection === 'stats' && (
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(item.entityCard.coreStats?.abilityScores || {}).map(([key, value]) => (
                          <div key={key} className="rounded-lg border border-[var(--db-border-default)] p-2 flex justify-between"><span>{key}</span><strong>{value}</strong></div>
                        ))}
                        <div className="rounded-lg border border-[var(--db-border-default)] p-2">HP {item.entityCard.coreStats?.hpCurrent ?? '—'} / {item.entityCard.coreStats?.hpMax ?? '—'}</div>
                        <div className="rounded-lg border border-[var(--db-border-default)] p-2">AC {item.entityCard.coreStats?.armorClass ?? '—'}</div>
                        <div className="rounded-lg border border-[var(--db-border-default)] p-2">Level {item.entityCard.progression?.level ?? item.entityCard.coreStats?.level ?? '—'}</div>
                        <div className="rounded-lg border border-[var(--db-border-default)] p-2">Speed {item.entityCard.coreStats?.speed ?? '—'}</div>
                      </div>
                    )}
                    {entitySection === 'behavior' && (
                      <div className="space-y-2">
                        <div><span className="text-[var(--db-text-muted)]">Default:</span> {item.entityCard.behavior.defaultBehavior || '—'}</div>
                        <div><span className="text-[var(--db-text-muted)]">Threat response:</span> {item.entityCard.behavior.threatResponse || '—'}</div>
                        <div><span className="text-[var(--db-text-muted)]">Combat:</span> {item.entityCard.behavior.combatBehavior || '—'}</div>
                        <div><span className="text-[var(--db-text-muted)]">Priorities:</span> {item.entityCard.behavior.priorities.join(', ') || '—'}</div>
                      </div>
                    )}
                    {entitySection === 'social' && (
                      <div className="space-y-2">
                        <div><span className="text-[var(--db-text-muted)]">Alignment:</span> {item.entityCard.social.alignment || '—'}</div>
                        <div><span className="text-[var(--db-text-muted)]">Factions:</span> {item.entityCard.social.factionIds.join(', ') || '—'}</div>
                        {item.entityCard.economy && <div><span className="text-[var(--db-text-muted)]">Wealth:</span> {item.entityCard.economy.wealth ?? '—'}</div>}
                        {item.entityCard.economy && <div><span className="text-[var(--db-text-muted)]">Inventory:</span> {item.entityCard.economy.inventorySummary.join(', ') || '—'}</div>}
                      </div>
                    )}
                    {entitySection === 'history' && (
                      <div className="space-y-2">
                        <div><span className="text-[var(--db-text-muted)]">Origin:</span> {item.entityCard.background?.origin || '—'}</div>
                        <div><span className="text-[var(--db-text-muted)]">Background:</span> {item.entityCard.background?.history || 'Not applicable.'}</div>
                        <div><span className="text-[var(--db-text-muted)]">Important events:</span> {item.entityCard.background?.importantEvents.join(' • ') || 'None recorded.'}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs uppercase font-semibold text-[var(--db-text-muted)] tracking-wider mb-2">
                  Tags & Taxonomy
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded text-xs bg-[var(--db-surface-blue)] text-[var(--db-blue-300)] border border-[var(--db-blue-500)]/30"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--db-border-default)] bg-[var(--db-bg-raised)] flex items-center justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
