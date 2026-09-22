import React from 'react';
import { Check, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import type { CharacterGenesisDraft, CharacterProgressionSelection } from '../../types';

interface CharacterProgressionStepProps {
	draft: CharacterGenesisDraft;
	modules: any[];
	onChange: (progression: CharacterProgressionSelection) => void;
}

export const CharacterProgressionStep: React.FC<CharacterProgressionStepProps> = ({ draft, modules, onChange }) => {
	const progression = draft.progression || {};
	const classes = modules.filter((module) => module.type === 'CLASS');
	const subclasses = modules.filter((module) => module.type === 'SUBCLASS' && (!progression.classId || module.parentClassId === progression.classId));
	const species = modules.filter((module) => module.type === 'SPECIES');
	const feats = modules.filter((module) => module.type === 'FEAT');
	const selectedClass = classes.find((module) => module.id === progression.classId);
	const selectedSubclass = subclasses.find((module) => module.id === progression.subclassId);
	const selectedSpecies = species.find((module) => module.id === progression.speciesId);
	const selectedFeats = new Set(progression.featIds || []);

	const update = (patch: Partial<CharacterProgressionSelection>) => {
		onChange({
			...progression,
			...patch,
			featIds: patch.featIds ?? progression.featIds ?? [],
			moduleIds: patch.moduleIds ?? progression.moduleIds ?? [],
		});
	};

	const selectClass = (classId?: string) => {
		const validSubclass = subclasses.find((module) => module.parentClassId === classId && module.id === progression.subclassId);
		update({ classId, subclassId: validSubclass ? progression.subclassId : undefined });
	};

	const toggleFeat = (featId: string) => {
		const next = new Set(selectedFeats);
		if (next.has(featId)) next.delete(featId);
		else next.add(featId);
		update({ featIds: Array.from(next) });
	};

	const Section = ({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) => (
		<section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5 space-y-4">
			<div>
				<h2 className="text-sm font-semibold text-white">{title}</h2>
				<p className="text-xs text-neutral-400 mt-1 leading-relaxed">{hint}</p>
			</div>
			{children}
		</section>
	);

	const ModuleButton = ({ module, selected, onClick }: { module: any; selected: boolean; onClick: () => void }) => (
		<button
			type="button"
			onClick={onClick}
			className={`w-full text-left rounded-xl border p-3 sm:p-4 transition-colors min-h-[72px] ${
				selected ? 'border-indigo-500/60 bg-indigo-950/40' : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700'
			}`}
		>
			<div className="flex items-start gap-3">
				<div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
					selected ? 'border-indigo-400 bg-indigo-500/20 text-indigo-300' : 'border-neutral-700 text-transparent'
				}`}>
					<Check className="w-3 h-3" />
				</div>
				<div className="min-w-0">
					<div className="text-sm font-medium text-white break-words">{module.name}</div>
					<div className="text-[11px] text-neutral-400 mt-1 leading-relaxed">{module.provenance || 'World rules module'}</div>
					{module.description && <div className="text-xs text-neutral-500 mt-1 leading-relaxed">{module.description}</div>}
				</div>
			</div>
		</button>
	);

	return (
		<div className="space-y-5">
			<div className="rounded-2xl border border-indigo-900/50 bg-indigo-950/20 p-4 sm:p-5">
				<div className="flex items-start gap-3">
					<Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
					<div>
						<h1 className="text-base sm:text-lg font-semibold text-white">Progression & Ancestry</h1>
						<p className="text-xs sm:text-sm text-neutral-400 mt-1 leading-relaxed">
							Choose mechanical identity separately from profession and narrative role. A merchant can be a profession without becoming a class.
						</p>
					</div>
				</div>
			</div>

			<Section title="Class" hint="One primary class. This is the mechanical progression identity, not the character's day-to-day profession.">
				{classes.length ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{classes.map((module) => <ModuleButton key={module.id} module={module} selected={progression.classId === module.id} onClick={() => selectClass(progression.classId === module.id ? undefined : module.id)} />)}
					</div>
				) : <p className="text-xs text-neutral-500">No standard classes are registered for this world.</p>}
				{selectedClass && <div className="text-xs text-indigo-300">Selected: {selectedClass.name}</div>}
			</Section>

			<Section title="Subclass" hint={progression.classId ? 'Only subclasses compatible with the selected class are shown. Requirements are enforced again at confirmation/runtime.' : 'Choose a class first to see compatible subclasses.'}>
				{subclasses.length && progression.classId ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{subclasses.map((module) => <ModuleButton key={module.id} module={module} selected={progression.subclassId === module.id} onClick={() => update({ subclassId: progression.subclassId === module.id ? undefined : module.id })} />)}
					</div>
				) : <p className="text-xs text-neutral-500">No compatible subclass is currently available.</p>}
				{selectedSubclass && <div className="text-xs text-indigo-300">Selected: {selectedSubclass.name}</div>}
			</Section>

			<Section title="Species / Ancestry" hint="Species is mechanical identity. It remains separate from lineage, culture, profession, and narrative archetype.">
				{species.length ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{species.map((module) => <ModuleButton key={module.id} module={module} selected={progression.speciesId === module.id} onClick={() => update({ speciesId: progression.speciesId === module.id ? undefined : module.id })} />)}
					</div>
				) : <p className="text-xs text-neutral-500">No structured species modules are registered for this world. Free-text species remains available in Identity.</p>}
				{selectedSpecies && <div className="text-xs text-indigo-300">Selected: {selectedSpecies.name}</div>}
			</Section>

			<Section title="Feats" hint="Feats are additive. You can select multiple when the active ruleset permits them. Custom feats created in Genesis remain part of the character too.">
				{feats.length ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{feats.map((module) => <ModuleButton key={module.id} module={module} selected={selectedFeats.has(module.id)} onClick={() => toggleFeat(module.id)} />)}
					</div>
				) : <p className="text-xs text-neutral-500">No catalogue feats are registered. You can still use custom feats from the Capabilities & Skills workflow.</p>}
				<div className="text-xs text-neutral-500">{selectedFeats.size} feat{selectedFeats.size === 1 ? '' : 's'} selected.</div>
			</Section>
		</div>
	);
};
