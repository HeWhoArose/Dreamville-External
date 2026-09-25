import React from 'react';
import { HeartHandshake, Shield, User } from 'lucide-react';
import { ExternalCharacter } from '../types';

interface StoryRelationshipsViewProps {
	characters: Record<string, ExternalCharacter>;
	relationships?: any[];
}

export const StoryRelationshipsView: React.FC<StoryRelationshipsViewProps> = ({ characters, relationships = [] }) => {
	const characterList = Object.values(characters);
	return (
		<div className="space-y-8">
			<header>
				<p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-300/70">Social World</p>
				<h2 className="mt-2 font-serif text-3xl font-semibold text-white">Relationships & Factions<span className="text-rose-300">.</span></h2>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">A player-facing view of the relationships your character can currently know about.</p>
			</header>
			<div className="grid gap-4 md:grid-cols-2">
				{characterList.map((character) => {
					const relationship = relationships.find((item: any) => item.sourceId === character.id || item.targetId === character.id);
					return (
						<article key={character.id} className="rounded-2xl border border-white/7 bg-white/[0.025] p-5">
							<div className="flex items-center gap-3">
								<div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/10 text-rose-200 ring-1 ring-rose-400/15">{character.portraitEmoji || <User className="h-5 w-5" />}</div>
								<div className="min-w-0 flex-1"><h3 className="font-serif text-lg text-white">{character.name}</h3><p className="text-xs text-stone-500">{character.title}</p></div>
								<HeartHandshake className="h-4 w-4 text-rose-300/70" />
							</div>
							<div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider">
								<span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-stone-400">{character.disposition}</span>
								{relationship?.trust !== undefined && <span className="rounded-full border border-emerald-400/15 bg-emerald-500/5 px-2 py-1 text-emerald-300">Trust {relationship.trust}</span>}
								{relationship?.hostility !== undefined && <span className="rounded-full border border-rose-400/15 bg-rose-500/5 px-2 py-1 text-rose-300">Hostility {relationship.hostility}</span>}
							</div>
							{character.playerVisibleKnowledge?.length > 0 && <p className="mt-4 text-sm leading-6 text-stone-400">{character.playerVisibleKnowledge[0]}</p>}
						</article>
					);
				})}
			</div>
			<div className="rounded-2xl border border-amber-400/10 bg-amber-500/[0.035] p-4 text-xs text-stone-500">
				<Shield className="mr-2 inline h-4 w-4 text-amber-300/70" /> Hidden NPC motives and private knowledge remain hidden until your character can legitimately discover them.
			</div>
		</div>
	);
};
