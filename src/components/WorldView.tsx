import React from 'react';
import { MapPin, MessageSquare, Shield } from 'lucide-react';

interface WorldViewProps {
  worldName: string;
  characters: Record<string, any>;
  activeLocationId: string;
  locations: Record<string, any>;
  onEngageDialogue: (characterId: string) => void;
  dossiers?: any[];
  phase8Relationships?: any[];
}

export const WorldView: React.FC<WorldViewProps> = ({
  worldName,
  characters,
  activeLocationId,
  locations,
  onEngageDialogue,
  dossiers = [],
  phase8Relationships = [],
}) => {
  const characterList = Object.values(characters || {});
  const presentCharacters = characterList.filter((character: any) => character.locationId === activeLocationId);
  const otherCharacters = characterList.filter((character: any) => character.locationId !== activeLocationId);

  const dossierFor = (id: string) => dossiers.find((d: any) => d.subjectId === id || d.subjectId?.toLowerCase() === id.toLowerCase());
  const relationshipFor = (id: string) => phase8Relationships.find((r: any) => r.sourceId === id || r.targetId === id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-3xl border border-violet-400/12 bg-gradient-to-br from-violet-950/25 via-[#0d0917] to-fuchsia-950/10 p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-violet-300/75">Current world</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-white">{worldName}</h1>
        <p className="mt-2 text-sm text-stone-400">Characters and locations projected from the active story world only.</p>
      </section>

      <CharacterSection
        title="At your current location"
        characters={presentCharacters}
        locations={locations}
        onEngageDialogue={onEngageDialogue}
        dossierFor={dossierFor}
        relationshipFor={relationshipFor}
        current={true}
      />

      <CharacterSection
        title="Elsewhere in this world"
        characters={otherCharacters}
        locations={locations}
        onEngageDialogue={onEngageDialogue}
        dossierFor={dossierFor}
        relationshipFor={relationshipFor}
        current={false}
      />
    </div>
  );
};

const CharacterSection: React.FC<any> = ({ title, characters, locations, onEngageDialogue, dossierFor, relationshipFor, current }) => (
  <section>
    <div className="mb-3 flex items-center gap-2">
      <MapPin className="h-4 w-4 text-violet-300" />
      <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-300">{title}</h2>
      <span className="text-xs text-stone-600">{characters.length}</span>
    </div>

    {characters.length === 0 ? (
      <div className="rounded-2xl border border-white/8 bg-[#0b0813]/70 p-6 text-center text-sm text-stone-600">
        {current ? 'No known characters are present here right now.' : 'No other known characters are currently projected in this world.'}
      </div>
    ) : (
      <div className="grid gap-4 md:grid-cols-2">
        {characters.map((character: any) => {
          const relationship = relationshipFor(character.id);
          const dossier = dossierFor(character.id);
          const location = locations[character.locationId];
          return (
            <article key={character.id} className="rounded-2xl border border-white/8 bg-[#0b0813]/75 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-2xl">
                    {character.portraitEmoji || '👤'}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-serif font-bold text-stone-100">{character.name}</h3>
                    <p className="text-xs text-stone-500">{character.title}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-violet-300/70">{character.role}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] text-stone-500">
                  {character.disposition}
                </span>
              </div>
              {relationship && (
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-violet-400/10 bg-violet-500/[0.04] p-2 text-[10px] text-violet-200">
                  <span>Trust {relationship.trust}</span><span>Affinity {relationship.affinity}</span>
                  <span>Fear {relationship.fear}</span><span>Hostility {relationship.hostility}</span>
                </div>
              )}
              {dossier?.publicReputationSummary && (
                <p className="mt-3 text-xs leading-relaxed text-stone-400">{dossier.publicReputationSummary}</p>
              )}
              {Array.isArray(character.playerVisibleKnowledge) && character.playerVisibleKnowledge.length > 0 && (
                <div className="mt-3 border-t border-white/7 pt-3">
                  <p className="text-[10px] uppercase tracking-wider text-stone-600">Known to you</p>
                  <p className="mt-1 text-xs text-stone-400">{character.playerVisibleKnowledge.join(' • ')}</p>
                </div>
              )}
              {current && character.id !== undefined && (
                <button
                  type="button"
                  onClick={() => onEngageDialogue(character.id)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/15"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Engage
                </button>
              )}
              {!current && location && (
                <div className="mt-4 border-t border-white/7 pt-3 text-xs text-stone-500">
                  At {location.name}
                </div>
              )}
            </article>
          );
        })}
      </div>
    )}
  </section>
);
