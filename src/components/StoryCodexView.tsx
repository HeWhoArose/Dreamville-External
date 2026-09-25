import React from 'react';
import { BookOpen, MapPin, Sparkles } from 'lucide-react';
import { Location, PlayerKnowledge } from '../types';

interface StoryCodexViewProps {
	locations: Record<string, Location>;
	activeLocationId: string;
	knowledgeBase: PlayerKnowledge[];
	worldName?: string;
}

export const StoryCodexView: React.FC<StoryCodexViewProps> = ({
	locations,
	activeLocationId,
	knowledgeBase,
	worldName,
}) => {
	const discoveredLocations = Object.values(locations).filter((location) => location.discovered);
	const lore = knowledgeBase.filter((entry) => entry.category === 'Lore' || entry.category === 'Person' || entry.category === 'Location');

	return (
		<div className="space-y-8">
			<header>
				<p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">World Codex</p>
				<h2 className="mt-2 font-serif text-3xl font-semibold text-white">{worldName || 'The World'}<span className="text-violet-300">.</span></h2>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">What your character has actually discovered about this world.</p>
			</header>

			<section className="grid gap-4 md:grid-cols-2">
				{discoveredLocations.map((location) => {
					const active = location.id === activeLocationId;
					return (
						<article key={location.id} className={`rounded-2xl border p-5 transition ${active ? 'border-violet-400/30 bg-violet-500/[0.07]' : 'border-white/7 bg-white/[0.025]'}`}>
							<div className="flex items-start gap-3">
								<div className={`rounded-xl p-2 ${active ? 'bg-violet-500/15 text-violet-300' : 'bg-white/[0.04] text-stone-500'}`}><MapPin className="h-5 w-5" /></div>
								<div className="min-w-0">
									<h3 className="font-serif text-lg text-white">{location.name}</h3>
									<p className="text-xs text-stone-500">{location.region}</p>
								</div>
							</div>
							<p className="mt-4 text-sm leading-6 text-stone-400">{location.description}</p>
						</article>
					);
				})}
			</section>

			<section className="space-y-3">
				<div className="flex items-center gap-2 text-sm font-medium text-stone-200"><BookOpen className="h-4 w-4 text-fuchsia-300" /> Discovered lore</div>
				{lore.length === 0 ? (
					<div className="rounded-2xl border border-white/7 bg-white/[0.02] p-6 text-sm text-stone-500">Your codex is still mostly blank. Discover places, people and stories to fill it.</div>
				) : (
					<div className="space-y-3">{lore.map((entry) => (
						<article key={entry.id} className="rounded-2xl border border-white/7 bg-white/[0.025] p-5">
							<div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-fuchsia-300" /><h3 className="font-serif text-lg text-white">{entry.title}</h3></div>
							<p className="mt-2 text-sm leading-6 text-stone-400">{entry.summary}</p>
							<p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-stone-600">{entry.category} · {entry.source}</p>
						</article>
					))}</div>
				)}
			</section>
		</div>
	);
};
