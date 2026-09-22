import React, { useState } from 'react';
import {
  CharacterBodyRegionState,
  CharacterConditionInstance,
  CharacterStartingConditionState,
} from '../../types';

interface ConditionProfileEditorProps {
  value: CharacterStartingConditionState;
  onChange: (next: CharacterStartingConditionState) => void;
  compact?: boolean;
}

const DAMAGE_TYPES = [
  'Bludgeoning', 'Piercing', 'Slashing', 'Fire', 'Cold',
  'Lightning', 'Thunder', 'Acid', 'Poison', 'Necrotic',
  'Radiant', 'Psychic', 'Force'
];

const DND_CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened',
  'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified',
  'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'
];

const SITUATION_PRESETS = [
  'Imprisoned', 'Weak', 'Bleeding', 'Burning', 'Regenerating',
  'Starving', 'Dehydrated'
];

const BODY_REGIONS: Array<{ id: string; label: string }> = [
  { id: 'HEAD', label: 'Head' },
  { id: 'FACE', label: 'Face' },
  { id: 'TORSO', label: 'Torso' },
  { id: 'HEART', label: 'Heart' },
  { id: 'LEFT_ARM', label: 'Left Arm' },
  { id: 'RIGHT_ARM', label: 'Right Arm' },
  { id: 'LEFT_HAND', label: 'Left Hand' },
  { id: 'RIGHT_HAND', label: 'Right Hand' },
  { id: 'LEFT_LEG', label: 'Left Leg' },
  { id: 'RIGHT_LEG', label: 'Right Leg' },
  { id: 'WHOLE_BODY', label: 'Whole Body' },
];

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

function toggleValue(values: string[], val: string): string[] {
  const exists = values.some((item) => item.toLowerCase() === val.toLowerCase());
  return exists
    ? values.filter((item) => item.toLowerCase() !== val.toLowerCase())
    : [...values, val];
}

function createInstance(name: string): CharacterConditionInstance {
  const id = 'condition_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return {
    id,
    definitionId: slug || 'custom_' + id,
    name,
    alignment: 'HARMFUL',
    severity: 1,
    intensity: 1,
    stackCount: 1,
    stackMode: 'REFRESH',
    appliedAtSeconds: 0,
    durationSeconds: null,
    remainingDurationSeconds: null,
    tags: ['starting_state', 'custom'],
  };
}

function ensureBodyRegions(existing: CharacterBodyRegionState[]): CharacterBodyRegionState[] {
  const byId = new Map((existing || []).map((region) => [region.id, region]));
  return BODY_REGIONS.map(
    (region) =>
      byId.get(region.id) || {
        id: region.id,
        label: region.label,
        integrityCurrent: 100,
        integrityMax: 100,
        destroyed: false,
        conditionIds: [],
      }
  );
}

export const ConditionProfileEditor: React.FC<ConditionProfileEditorProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  const [expandedConditionId, setExpandedConditionId] = useState<string | null>(null);

  const nextValue = (patch: Partial<CharacterStartingConditionState>) =>
    onChange({ ...clone(value), ...patch });


  const removeCondition = (id: string) => {
    nextValue({ instances: value.instances.filter((item) => item.id !== id) });
    if (expandedConditionId === id) setExpandedConditionId(null);
  };

  const updateCondition = (
    id: string,
    patch: Partial<CharacterConditionInstance>
  ) =>
    nextValue({
      instances: value.instances.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    });

  const toggleDamage = (
    key: 'damageImmunities' | 'damageResistances' | 'damageVulnerabilities',
    item: string
  ) =>
    nextValue({
      damageProfile: {
        ...value.damageProfile,
        [key]: toggleValue(value.damageProfile[key], item),
      },
    });

  const toggleCondition = (
    key: 'conditionImmunities' | 'conditionResistances' | 'conditionVulnerabilities',
    item: string
  ) =>
    nextValue({
      conditionProfile: {
        ...value.conditionProfile,
        [key]: toggleValue(value.conditionProfile[key], item),
      },
    });

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Current Conditions</h3>
          <p className="text-[11px] text-neutral-500">
            Mechanical conditions and the character's immediate state when the story begins.
          </p>
        </div>
        <div className="rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-3">
          <p className="text-[11px] leading-relaxed text-neutral-400">
            Starting conditions are added through the AI proposal flow above this editor so the character's concept, background, and opening situation are interpreted together. You can inspect, tune, or remove the proposed result here.
          </p>
        </div>
        {value.instances.length > 0 && (
          <div className="space-y-2">
            {value.instances.map((condition) => {
              const expanded = expandedConditionId === condition.id;
              return (
                <div key={condition.id} className="rounded-xl border border-neutral-800 bg-neutral-950">
                  <div className="flex items-center gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => setExpandedConditionId(expanded ? null : condition.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-xs font-semibold text-white">{condition.name}</div>
                      <div className="mt-0.5 text-[10px] text-neutral-500">
                        Severity {condition.severity} · Intensity {condition.intensity}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCondition(condition.id)}
                      className="rounded-md px-2 py-1 text-[10px] text-neutral-500 hover:bg-red-950/40 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                  {expanded && (
                    <div className="grid grid-cols-1 gap-3 border-t border-neutral-800 p-3 sm:grid-cols-2">
                      <label className="text-[11px] text-neutral-400">
                        Severity
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={condition.severity}
                          onChange={(e) =>
                            updateCondition(condition.id, {
                              severity: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="text-[11px] text-neutral-400">
                        Intensity
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={condition.intensity}
                          onChange={(e) =>
                            updateCondition(condition.id, {
                              intensity: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      <div className="sm:col-span-2">
                        <span className="text-[11px] text-neutral-500">Affected body regions</span>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {BODY_REGIONS.map((region) => {
                            const active =
                              condition.affectedBodyRegions?.includes(region.id) || false;
                            return (
                              <button
                                type="button"
                                key={region.id}
                                onClick={() =>
                                  updateCondition(condition.id, {
                                    affectedBodyRegions: toggleValue(
                                      condition.affectedBodyRegions || [],
                                      region.id
                                    ),
                                  })
                                }
                                className={
                                  active
                                    ? 'rounded-md border border-amber-500/50 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-200'
                                    : 'rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-600'
                                }
                              >
                                {region.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h3 className="text-sm font-semibold text-white">Damage Profile</h3>
        <p className="mt-1 text-[11px] text-neutral-500">
          Immunity prevents damage, resistance reduces it, and vulnerability amplifies it.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(
            [
              ['damageImmunities', 'Damage Immunities'],
              ['damageResistances', 'Damage Resistances'],
              ['damageVulnerabilities', 'Damage Vulnerabilities'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DAMAGE_TYPES.map((damageType) => {
                  const active = value.damageProfile[key].some(
                    (entry) => entry.toLowerCase() === damageType.toLowerCase()
                  );
                  return (
                    <button
                      key={damageType}
                      type="button"
                      onClick={() => toggleDamage(key, damageType)}
                      className={
                        active
                          ? 'rounded-md border border-indigo-500/60 bg-indigo-950/60 px-2 py-1 text-[10px] text-indigo-200'
                          : 'rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-600'
                      }
                    >
                      {damageType}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h3 className="text-sm font-semibold text-white">Condition Profile</h3>
        <p className="mt-1 text-[11px] text-neutral-500">
          Condition immunity blocks application; resistance and vulnerability alter incoming intensity.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(
            [
              ['conditionImmunities', 'Condition Immunities'],
              ['conditionResistances', 'Condition Resistances'],
              ['conditionVulnerabilities', 'Condition Vulnerabilities'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {label}
              </div>
              <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                {DND_CONDITIONS.map((name) => {
                  const active = value.conditionProfile[key].some(
                    (entry) => entry.toLowerCase() === name.toLowerCase()
                  );
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleCondition(key, name)}
                      className={
                        active
                          ? 'rounded-md border border-amber-500/60 bg-amber-950/50 px-2 py-1 text-[10px] text-amber-200'
                          : 'rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-600'
                      }
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h3 className="text-sm font-semibold text-white">Body Integrity</h3>
        <p className="mt-1 text-[11px] text-neutral-500">
          Custom transformations and self-damage can affect body regions independently. Heart destruction is terminal.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {ensureBodyRegions(value.bodyRegions).map((region) => (
            <div key={region.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
              <div className="text-[10px] font-semibold text-neutral-300">{region.label}</div>
              <div className="mt-2 flex gap-1.5">
                <input
                  type="number"
                  min={0}
                  value={region.integrityCurrent}
                  onChange={(e) => {
                    const amount = Math.max(0, Number(e.target.value) || 0);
                    nextValue({
                      bodyRegions: ensureBodyRegions(value.bodyRegions).map((item) =>
                        item.id === region.id
                          ? { ...item, integrityCurrent: amount, destroyed: amount <= 0 }
                          : item
                      ),
                    });
                  }}
                  className="w-16 rounded border border-neutral-800 bg-neutral-950 px-1.5 py-1 text-[10px] text-white"
                />
                <span className="pt-1 text-[10px] text-neutral-600">/ {region.integrityMax}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
