import React, { useState } from 'react';
import { HeartPulse, Sparkles } from 'lucide-react';
import type { CharacterGenesisDraft, CharacterStartingConditionState } from '../../types';
import { ConditionProfileEditor } from './ConditionProfileEditor';

interface CharacterConditionStepProps {
	draft: CharacterGenesisDraft;
	onChange: (next: CharacterStartingConditionState) => void;
	onAiSuggest: (note: string) => Promise<void>;
	isAiSuggesting: boolean;
	error?: string | null;
}

export const CharacterConditionStep: React.FC<CharacterConditionStepProps> = ({
	draft,
	onChange,
	onAiSuggest,
	isAiSuggesting,
	error,
}) => {
	const [note, setNote] = useState('');

	const conditionState = draft.conditionState || {
		instances: [],
		customDefinitions: [],
		damageProfile: {
			damageImmunities: [],
			damageResistances: [],
			damageVulnerabilities: [],
		},
		conditionProfile: {
			conditionImmunities: [],
			conditionResistances: [],
			conditionVulnerabilities: [],
		},
		bodyRegions: [],
	};

	return (
		<div className="space-y-5">
			<section className="rounded-2xl border border-indigo-900/60 bg-indigo-950/20 p-4 sm:p-5">
				<div className="flex items-start gap-3">
					<HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
					<div className="min-w-0">
						<h1 className="text-base font-semibold text-white sm:text-lg">Current Condition & Defensive Profile</h1>
						<p className="mt-1 text-xs leading-relaxed text-neutral-400 sm:text-sm">
							This is the character's actual starting state, separate from permanent stats, abilities, equipment, and location. AI proposes the initial condition from the character context; you remain the final reviewer.
						</p>
					</div>
				</div>

				<div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3 sm:p-4 space-y-3">
					<div>
						<div className="text-xs font-semibold text-white">AI current-state inference</div>
						<p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
							Describe an injury, curse, sickness, blessing, exhaustion, imprisonment, or other immediate state. Leave it blank and the AI will infer from the existing concept, background, and starting situation.
						</p>
					</div>
					<textarea
						value={note}
						onChange={(event) => setNote(event.target.value)}
						rows={3}
						placeholder="Example: The character begins wounded after escaping a burning siege, with a damaged left arm and no special resistances."
						className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
					/>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div className="text-[10px] text-neutral-500">AI suggestions are proposals only until you review them.</div>
						<button
							type="button"
							disabled={isAiSuggesting}
							onClick={() => void onAiSuggest(note)}
							className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
						>
							<Sparkles className="h-3.5 w-3.5" />
							{isAiSuggesting ? 'Inferring…' : 'Infer Current Condition with AI'}
						</button>
					</div>
					{error && <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>}
				</div>
			</section>

			<ConditionProfileEditor value={conditionState} onChange={onChange} />
		</div>
	);
};
