import React, { useState } from 'react';
import type { CombatAttackInstanceResult, CombatEffectResult } from '../../types';

interface CombatInspectorProps {
  result: Partial<CombatEffectResult> | null | undefined;
  /** Display names by participant id. */
  names?: Record<string, string>;
  /** Start with every instance expanded (used by the details view and tests). */
  defaultExpanded?: boolean;
}

type Row = { label: string; value: number };

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

function RollLine({ roll, label }: { roll: any; label: string }) {
  if (!roll) return null;
  const dice: number[] = Array.isArray(roll.individualDice) ? roll.individualDice : [];
  const modifier = Number(roll.modifier || 0);
  return (
    <div className="flex justify-between gap-2">
      <span className="text-stone-500">{label}</span>
      <span className="font-mono text-stone-200">
        {roll.formula ? `${roll.formula}: ` : ''}
        {dice.length ? `[${dice.join(', ')}]` : ''}
        {modifier ? ` ${signed(modifier)}` : ''} = {roll.total}
      </span>
    </div>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows?: Row[]; total?: number }) {
  if (!rows?.length) return null;
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-stone-500">{title}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between font-mono text-stone-300">
          <span>{row.label}</span>
          <span>{signed(row.value)}</span>
        </div>
      ))}
      {total !== undefined && (
        <div className="flex justify-between font-mono text-stone-100 border-t border-stone-700 mt-0.5 pt-0.5">
          <span>Total</span>
          <span>{total}</span>
        </div>
      )}
    </div>
  );
}

function InstanceDetails({ instance, names }: { instance: CombatAttackInstanceResult; names: Record<string, string> }) {
  const roll: any = instance.roll;
  const d20 = Array.isArray(roll?.individualDice) ? roll.individualDice : [];
  const attackRows = instance.attackBreakdown || [];
  const attackTotal = instance.attackRollTotal;
  return (
    <div className="mt-1 space-y-1.5 rounded border border-stone-800 bg-stone-950/60 p-2" data-testid={`instance-details-${instance.instanceIndex}`}>
      <div className="flex justify-between">
        <span className="text-stone-400">Target</span>
        <span className="text-stone-200">{names[instance.targetId] || instance.targetId}</span>
      </div>
      <div className="flex justify-between font-mono text-stone-300">
        <span>Attack roll (d20)</span>
        <span>{d20.length ? d20.join(' / ') : roll?.total ?? '—'}</span>
      </div>
      <Breakdown title="Bonuses" rows={attackRows} />
      {attackTotal !== undefined && (
        <div className="flex justify-between font-mono text-stone-100 border-t border-stone-700 pt-0.5">
          <span>Attack result</span>
          <span>{attackTotal}</span>
        </div>
      )}
      <Breakdown title="Target defence" rows={instance.defenseBreakdown} total={instance.targetArmorClass} />
      {(instance.advantageNotes?.advantage.length || instance.advantageNotes?.disadvantage.length) ? (
        <div className="text-[10px]">
          {instance.advantageNotes?.advantage.map((note) => <div key={note} className="text-emerald-300">Advantage: {note}</div>)}
          {instance.advantageNotes?.disadvantage.map((note) => <div key={note} className="text-amber-300">Disadvantage: {note}</div>)}
        </div>
      ) : null}
      <RollLine roll={instance.damageRoll} label="Damage roll" />
      {instance.riders?.map((rider) => (
        <div key={rider.id} className="flex justify-between font-mono text-amber-300" data-testid={`rider-${rider.id}`}>
          <span>{rider.label}</span>
          <span>+{rider.amount}</span>
        </div>
      ))}
      {(instance.defense?.immune || instance.defense?.resisted || instance.defense?.vulnerable) && (
        <div className="text-stone-400">
          {instance.defense?.immune ? 'Immune: no damage. ' : ''}
          {instance.defense?.resisted ? 'Resisted: halved. ' : ''}
          {instance.defense?.vulnerable ? 'Vulnerable: doubled. ' : ''}
        </div>
      )}
      <div className="flex justify-between font-semibold">
        <span className={instance.isCritical ? 'text-amber-300' : instance.hits ? 'text-emerald-300' : 'text-stone-400'}>
          {instance.isCritical ? 'Critical hit' : instance.hits ? 'Hit' : 'Miss'}
        </span>
        <span className="font-mono text-stone-100">{instance.damage} damage{instance.targetDied ? ' (defeated)' : ''}</span>
      </div>
    </div>
  );
}

/**
 * Summary first, details on demand. The summary line fits a phone; each instance expands to show exactly how its attack total and
 * the target's armor class were made up, so a player can see why an attack hit or missed.
 */
export function CombatInspector({ result, names = {}, defaultExpanded = false }: CombatInspectorProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(defaultExpanded);
  if (!result) return null;

  const instances = result.instances || [];
  const hits = instances.filter((instance) => instance.hits).length;
  const crits = instances.filter((instance) => instance.isCritical).length;
  const blocked = result.deliveryBlocked;

  return (
    <div className="p-2 rounded bg-stone-900 border border-stone-800 text-[10px] text-stone-300 space-y-1.5" data-testid="combat-inspector">
      <div className="flex items-center justify-between">
        <span className="text-violet-300 font-semibold">{result.effectName || 'Last effect'}</span>
        {instances.length > 1 && (
          <button type="button" className="text-blue-300 hover:text-blue-200 cursor-pointer" onClick={() => setShowAll((value) => !value)}>
            {showAll ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      <div data-testid="inspector-summary">
        {instances.length} {instances.length === 1 ? 'instance' : 'instances'} · {hits} hit{crits ? ` (${crits} critical)` : ''} · {result.totalDamage ?? 0} damage
        {result.actionConsumed === false ? ' · no action spent' : ''}
      </div>

      {result.executionResult && result.executionResult.mode !== 'AUTOMATIC' && (
        <div className={result.executionResult.success ? 'text-emerald-300' : 'text-red-300'}>
          Execution: {result.executionResult.reason || (result.executionResult.success ? 'passed' : 'failed')}
        </div>
      )}

      {result.deliveryResults?.some((entry) => !entry.delivered) && (
        <div className="space-y-0.5" data-testid="delivery-results">
          {result.deliveryResults.map((entry) => (
            <div key={entry.targetId} className={entry.delivered ? 'text-stone-400' : 'text-amber-300'}>
              {names[entry.targetId] || entry.targetId}: {entry.delivered ? 'reached' : 'not reached'} — {entry.reason}
            </div>
          ))}
        </div>
      )}
      {blocked && <div className="text-amber-300">The effect never reached its target; the action was still spent.</div>}
      {result.interrupted && <div className="text-amber-300">Interrupted at {result.interrupted.stage.replace('_', ' ').toLowerCase()} by {names[result.interrupted.byActorId] || result.interrupted.byActorId}.</div>}

      {instances.map((instance) => {
        const open = showAll || openIndex === instance.instanceIndex;
        return (
          <div key={instance.instanceIndex}>
            <button
              type="button"
              className="w-full flex items-center justify-between rounded px-1.5 py-1 bg-stone-950/50 hover:bg-stone-800/60 cursor-pointer"
              onClick={() => setOpenIndex(open && !showAll ? null : instance.instanceIndex)}
              aria-expanded={open}
            >
              <span>#{instance.instanceIndex + 1} {names[instance.targetId] || instance.targetId}</span>
              <span className={instance.isCritical ? 'text-amber-300' : instance.hits ? 'text-emerald-300' : 'text-stone-500'}>
                {instance.isCritical ? 'CRIT' : instance.hits ? 'HIT' : 'MISS'} · {instance.damage}
              </span>
            </button>
            {open && <InstanceDetails instance={instance} names={names} />}
          </div>
        );
      })}
    </div>
  );
}
