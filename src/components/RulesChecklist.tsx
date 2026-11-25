import React, { useMemo, useState } from 'react';
import {
  RULE_GROUPS,
  isRuleEnabled,
  listRulesInGroup,
  type RuleModeId,
} from '../data/rulesCatalogue';

interface RulesChecklistProps {
  mode: RuleModeId;
  toggles: Record<string, boolean>;
  onChange: (toggles: Record<string, boolean>) => void;
}

/**
 * Per-rule checklist for Hybrid D&D (locked groups shown as always on) and Custom Homebrew (everything starts off).
 * Compact view shows one line per group with a count; the full view lists every rule with its description.
 */
export function RulesChecklist({ mode, toggles, onChange }: RulesChecklistProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);

  const groups = useMemo(
    () => RULE_GROUPS.map((group) => ({ group, rules: listRulesInGroup(group.id) })),
    [],
  );

  if (mode === 'FULL_DND') return null;

  const setRule = (id: string, value: boolean) => onChange({ ...toggles, [id]: value });
  const setGroup = (ids: string[], value: boolean) => {
    const next = { ...toggles };
    for (const id of ids) next[id] = value;
    onChange(next);
  };

  return (
    <div className="space-y-2" data-testid="rules-checklist">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Rules to use</span>
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="text-[10px] text-blue-300 hover:text-blue-200 cursor-pointer"
        >
          {showAll ? 'Compact view' : 'Show all rules'}
        </button>
      </div>
      {groups.map(({ group, rules }) => {
        const locked = group.locked && mode === 'HYBRID_DND';
        const enabledCount = rules.filter((rule) => isRuleEnabled(mode, toggles, rule.id)).length;
        const open = showAll || expanded[group.id];
        const ids = rules.map((rule) => rule.id);
        return (
          <div key={group.id} className="rounded-lg border border-stone-800 bg-stone-900/60">
            <div className="flex items-center justify-between px-3 py-2">
              <button
                type="button"
                onClick={() => setExpanded((state) => ({ ...state, [group.id]: !state[group.id] }))}
                className="text-left text-xs text-stone-200 cursor-pointer"
                aria-expanded={Boolean(open)}
              >
                <span className="font-medium">{group.label}</span>
                <span className="ml-2 text-[10px] text-stone-500">
                  {locked ? 'always on' : `${enabledCount} of ${rules.length} on`}
                </span>
              </button>
              {!locked && (
                <span className="flex gap-2 text-[10px]">
                  <button type="button" className="text-stone-400 hover:text-stone-200 cursor-pointer" onClick={() => setGroup(ids, true)}>All on</button>
                  <button type="button" className="text-stone-400 hover:text-stone-200 cursor-pointer" onClick={() => setGroup(ids, false)}>All off</button>
                </span>
              )}
            </div>
            {open && (
              <ul className="border-t border-stone-800 px-3 py-2 space-y-1.5">
                {rules.map((rule) => {
                  const on = isRuleEnabled(mode, toggles, rule.id);
                  const parentOff = Boolean(rule.requires) && !isRuleEnabled(mode, toggles, rule.requires as string);
                  return (
                    <li key={rule.id} className="flex items-start gap-2">
                      <input
                        id={`rule-${rule.id}`}
                        type="checkbox"
                        checked={on}
                        disabled={locked || parentOff}
                        onChange={(event) => setRule(rule.id, event.target.checked)}
                        className="mt-0.5"
                      />
                      <label htmlFor={`rule-${rule.id}`} className="text-xs text-stone-300">
                        <span>{rule.label}</span>
                        {rule.status === 'pending' && !locked && (
                          <span className="ml-1 text-[10px] text-stone-500">(not yet enforced)</span>
                        )}
                        <span className="block text-[10px] text-stone-500">{rule.description}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
