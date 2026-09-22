import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import type { CharacterGenesisDraft, CharacterProgressionSelection } from '../../types';

type ProgressionType = 'CLASS' | 'SUBCLASS' | 'SPECIES';

interface CharacterProgressionStepProps {
	draft: CharacterGenesisDraft;
	modules: any[];
	onChange: (progression: CharacterProgressionSelection) => void;
	onInfer: (type: ProgressionType) => Promise<void>;
	onGenerateCustom: (type: ProgressionType, name: string, concept: string, parentClassId?: string) => Promise<void>;
	busyType?: ProgressionType | null;
	error?: string | null;
}

export const CharacterProgressionStep: React.FC<CharacterProgressionStepProps> = ({
	draft,
	modules,
	onChange,
	onInfer,
	onGenerateCustom,
	busyType,
	error,
}) => {
	const progression = draft.progression || {};
	const [customType, setCustomType] = useState<ProgressionType | null>(null);
	const [customName, setCustomName] = useState('');
	const [customConcept, setCustomConcept] = useState('');

	const classes = useMemo(() => modules.filter((module) => module.type === 'CLASS'), [modules]);
	const subclasses = useMemo(
		() => modules.filter((module) => module.type === 'SUBCLASS' && progression.classId && module.parentClassId === progression.classId),
		[modules, progression.classId]
	);
	const species = useMemo(() => modules.filter((module) => module.type === 'SPECIES'), [modules]);

	const selectedClass = classes.find((module) => module.id === progression.classId);
	const selectedSubclass = subclasses.find((module) => module.id === progression.subclassId);
	const selectedSpecies = species.find((module) => module.id === progression.speciesId);

	const update = (patch: Partial<CharacterProgressionSelection>) => {
		onChange({
			...progression,
			...patch,
			featIds: progression.featIds || [],
			moduleIds: progression.moduleIds || [],
			customModules: progression.customModules || [],
		});
	};

	const selectClass = (classId: string) => {
		const nextSubclass = subclasses.some((module) => module.id === progression.subclassId && module.parentClassId === classId)
			? progression.subclassId
			: undefined;
		update({ classId: classId || undefined, subclassId: nextSubclass });
	};

	const submitCustom = async () => {
		if (!customType) return;
		await onGenerateCustom(customType, customName.trim(), customConcept.trim(), customType === 'SUBCLASS' ? progression.classId : undefined);
		setCustomType(null);
		setCustomName('');
		setCustomConcept('');
	};

	const Section = ({
		type,
		title,
		hint,
		value,
		options,
		disabled,
		onSelect,
		selected,
	}: {
		type: ProgressionType;
		title: string;
		hint: string;
		value?: string;
		options: any[];
		disabled?: boolean;
		onSelect: (value: string) => void;
		selected?: any;
	}) => (
		<section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5 space-y-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<h2 className="text-sm font-semibold text-white">{title}</h2>
					<p className="text-xs text-neutral-400 mt-1 leading-relaxed">{hint}</p>
				</div>
				{selected && <span className="shrink-0 text-[10px] uppercase tracking-wide text-indigo-300">{selected.name}</span>}
			</div>

			<div className="flex flex-col gap-2 sm:flex-row">
				<div className="relative min-w-0 flex-1">
					<select
						value={value || ''}
						disabled={disabled}
						onChange={(event) => onSelect(event.target.value)}
						className="w-full appearance-none rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-3 pr-10 text-sm text-white outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="">{disabled ? 'Choose a class first' : `Choose ${title}`}</option>
						{options.map((module) => (
							<option key={module.id} value={module.id}>{module.name}</option>
						))}
					</select>
					<ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-neutral-500" />
				</div>
				<button
					type="button"
					disabled={Boolean(busyType)}
					onClick={() => onInfer(type)}
					className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-indigo-700/60 bg-indigo-950/50 px-3 text-xs font-medium text-indigo-200 hover:bg-indigo-900/50 disabled:opacity-50"
				>
					<Sparkles className="h-3.5 w-3.5" />
					{busyType === type ? 'Inferring…' : 'Infer with AI'}
				</button>
				<button
					type="button"
					onClick={() => setCustomType(customType === type ? null : type)}
					className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900 px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
				>
					+ Custom
				</button>
			</div>

			{customType === type && (
				<div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-3 space-y-3">
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<input
							value={customName}
							onChange={(event) => setCustomName(event.target.value)}
							placeholder={`Custom ${title.toLowerCase()} name`}
							className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
						/>
						<input
							value={customConcept}
							onChange={(event) => setCustomConcept(event.target.value)}
							placeholder="Describe what it should do"
							className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
						/>
					</div>
					<div className="flex justify-end">
						<button
							type="button"
							disabled={!customConcept.trim() && !customName.trim()}
							onClick={() => void submitCustom()}
							className="min-h-[40px] rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
						>
							Generate & Add
						</button>
					</div>
				</div>
			)}
		</section>
	);

	return (
		<div className="space-y-5">
			<div className="rounded-2xl border border-indigo-900/50 bg-indigo-950/20 p-4 sm:p-5">
				<div className="flex items-start gap-3">
					<Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
					<div className="min-w-0">
						<h1 className="text-base font-semibold text-white sm:text-lg">Progression & Ancestry</h1>
						<p className="mt-1 text-xs leading-relaxed text-neutral-400 sm:text-sm">
							Choose the mechanical identity separately from profession and narrative role. AI only selects from registered world modules; custom entries are generated into the same validated structure.
						</p>
					</div>
				</div>
			</div>

			<Section
				type="CLASS"
				title="Class"
				hint="Primary mechanical progression. A profession such as merchant, scholar, or blacksmith is not automatically a class."
				value={progression.classId}
				options={classes}
				onSelect={selectClass}
				selected={selectedClass}
			/>

			<Section
				type="SUBCLASS"
				title="Subclass"
				hint="Only subclasses compatible with the selected class are available."
				value={progression.subclassId}
				options={subclasses}
				disabled={!progression.classId}
				onSelect={(value) => update({ subclassId: value || undefined })}
				selected={selectedSubclass}
			/>

			<Section
				type="SPECIES"
				title="Species / Ancestry"
				hint="Mechanical ancestry stays separate from free-text lineage, culture, profession, and archetype."
				value={progression.speciesId}
				options={species}
				onSelect={(value) => update({ speciesId: value || undefined })}
				selected={selectedSpecies}
			/>

			<div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
				<div className="flex items-start gap-3">
					<Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
					<div>
						<div className="text-xs font-semibold text-white">Feats, Titles & Special Traits stay in Stats & Attributes</div>
						<p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
							They are not duplicated here. Existing feat records are linked into progression automatically during confirmation.
						</p>
					</div>
				</div>
			</div>

			{error && <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>}
		</div>
	);
};
