import React from 'react';
import { Award, Shield, Sparkles, Zap } from 'lucide-react';

interface CharacterSurfaceProps {
  protagonist: any;
  powerState: any;
  capabilities: any[];
  skillInstances: any[];
  equipment: Record<string, any>;
  inventory: any[];
}

export const CharacterSurface: React.FC<CharacterSurfaceProps> = ({
  protagonist,
  powerState,
  capabilities,
  skillInstances,
  equipment,
  inventory,
}) => {
  const skills = capabilities.filter((capability) =>
    skillInstances.some((instance) => instance.capabilityId === capability.id)
  );
  const skillById = new Map(skillInstances.map((instance) => [instance.capabilityId, instance]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-violet-400/15 bg-gradient-to-br from-violet-950/35 via-[#0e0a18] to-fuchsia-950/20 p-6 shadow-2xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-300/20 bg-black/30 text-5xl">
            {protagonist?.portraitUrl ? (
              <img src={protagonist.portraitUrl} alt={protagonist.name} className="h-full w-full object-cover" />
            ) : (
              protagonist?.portraitEmoji || '🛡️'
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-violet-300/75">Your Character</p>
            <h1 className="mt-1 font-serif text-3xl font-bold text-white">{protagonist?.name || 'Protagonist'}</h1>
            <p className="mt-1 text-sm text-stone-400">{protagonist?.title || 'Adventurer'}</p>
            {protagonist?.conditionState?.status && (
              <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-stone-300">
                {protagonist.conditionState.status}
              </span>
            )}
          </div>
        </div>

        {powerState && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Health" value={`${powerState.healthCurrent} / ${powerState.healthMax}`} icon={<Shield className="h-4 w-4" />} />
            <Stat label="Energy" value={`${powerState.magicalEnergy} / ${powerState.magicalEnergyMax}`} icon={<Zap className="h-4 w-4" />} />
            <Stat label="Strain" value={String(powerState.physicalStrain)} icon={<ActivityIcon />} />
            <Stat label="Vessel" value={String(powerState.vesselCapacity)} icon={<Award className="h-4 w-4" />} />
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-violet-400/10 bg-[#0b0813]/95 p-5 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/75">Character abilities</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Skills & Spellbook</h2>
          </div>
          <div className="rounded-full border border-violet-400/15 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
            {skills.length} learned
          </div>
        </div>

        {skills.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center text-sm text-stone-500">
            No skills have been learned yet. New techniques are only added after the canonical progression system records them.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {skills.map((skill) => {
              const instance = skillById.get(skill.id);
              return (
                <article key={skill.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-stone-100">{skill.name}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-stone-400">{skill.description}</p>
                    </div>
                    {instance && (
                      <span className="ml-auto shrink-0 rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
                        Lv {instance.currentLevel}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-stone-500">
                    <span>Energy {skill.baseEnergyCost ?? 0}</span>
                    <span>Strain {skill.baseStrainCost ?? 0}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/8 bg-[#0b0813]/75 p-5">
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Character loadout</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Equipment</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(equipment || {}).map(([slot, item]) => (
            <div key={slot} className="rounded-xl border border-white/7 bg-white/[0.02] p-3">
              <div className="text-[10px] uppercase tracking-wider text-stone-600">{slot}</div>
              <div className="mt-1 text-sm text-stone-300">{item?.name || 'Empty'}</div>
            </div>
          ))}
          {Object.keys(equipment || {}).length === 0 && (
            <div className="text-sm text-stone-500">No equipped items.</div>
          )}
        </div>
        <p className="mt-4 text-xs text-stone-600">{inventory.length} item(s) currently in inventory. Full management remains in Inventory.</p>
      </section>
    </div>
  );
};

const ActivityIcon = () => <span className="text-xs">◒</span>;

const Stat: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="rounded-2xl border border-white/7 bg-black/15 p-3">
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-stone-600">
      {icon}{label}
    </div>
    <div className="mt-1 text-lg font-semibold text-white">{value}</div>
  </div>
);
