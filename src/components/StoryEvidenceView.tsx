import React from 'react';
import { Eye, Search, Sparkles } from 'lucide-react';
import { PlayerKnowledge } from '../types';

interface StoryEvidenceViewProps {
	knowledgeBase: PlayerKnowledge[];
}

export const StoryEvidenceView: React.FC<StoryEvidenceViewProps> = ({ knowledgeBase }) => {
	const clues = knowledgeBase.filter((entry) => entry.category === 'Clue');
	return (
		<div className="space-y-8">
			<header>
				<p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-fuchsia-300/70">Investigation</p>
				<h2 className="mt-2 font-serif text-3xl font-semibold text-white">Evidence & Clues<span className="text-fuchsia-300">.</span></h2>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">Only clues your character has actually acquired are shown here.</p>
			</header>
			{clues.length === 0 ? (
				<div className="rounded-2xl border border-white/7 bg-white/[0.025] p-8 text-center">
					<Search className="mx-auto h-7 w-7 text-stone-600" />
					<p className="mt-3 font-serif text-lg text-stone-300">Nothing conclusive yet.</p>
					<p className="mt-1 text-sm text-stone-500">Keep exploring, inspecting and talking to people.</p>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2">{clues.map((clue) => (
					<article key={clue.id} className="rounded-2xl border border-fuchsia-400/15 bg-fuchsia-500/[0.035] p-5">
						<div className="flex items-center gap-2"><Eye className="h-4 w-4 text-fuchsia-300" /><h3 className="font-serif text-lg text-white">{clue.title}</h3></div>
						<p className="mt-3 text-sm leading-6 text-stone-400">{clue.summary}</p>
						<div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-stone-600"><Sparkles className="h-3 w-3" /> {clue.source}</div>
					</article>
				))}</div>
			)}
		</div>
	);
};
