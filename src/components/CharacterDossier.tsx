import React, { useState } from 'react';
import { ExternalCharacter, Location, NpcDossier } from '../types';
import { UserCheck, MessageSquare, Shield, MapPin, Award, ChevronDown, ChevronUp } from 'lucide-react';

interface CharacterDossierProps {
  characters: Record<string, ExternalCharacter>;
  activeLocationId: string;
  locations: Record<string, Location>;
  onEngageDialogue: (characterId: string) => void;
  dossiers?: NpcDossier[];
}

export const CharacterDossier: React.FC<CharacterDossierProps> = ({
  characters,
  activeLocationId,
  locations,
  onEngageDialogue,
  dossiers = [],
}) => {
  const [expandedDossierIds, setExpandedDossierIds] = useState<Record<string, boolean>>({});

  const toggleDossierExpanded = (id: string) => {
    setExpandedDossierIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const characterList = Object.values(characters);
  const presentCharacters = characterList.filter((c) => c.locationId === activeLocationId);
  const otherCharacters = characterList.filter((c) => c.locationId !== activeLocationId);

  const getDossierForCharacter = (charId: string): NpcDossier | undefined => {
    return dossiers.find(
      (d) =>
        d.subjectId === charId ||
        d.subjectId.toLowerCase() === charId.toLowerCase() ||
        charId.includes(d.subjectId) ||
        d.subjectId.includes(charId)
    );
  };

  return (
    <div className="space-y-6">
      {/* Information Banner */}
      <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-stone-400">
          <span className="font-semibold text-stone-200 block mb-1">
            Epistemic Character Projection & Canonical Dossiers
          </span>
          Information in this dossier is projected from the authoritative Historical Chronicle Engine.
          Only verified observations, public reputation, and authorized milestones are surfaced.
        </div>
      </div>

      {/* Present at current location */}
      <div>
        <h3 className="text-sm font-mono uppercase tracking-wider text-stone-300 font-semibold mb-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Present in Current Location ({presentCharacters.length})</span>
        </h3>

        {presentCharacters.length === 0 ? (
          <div className="rounded-xl border border-stone-800 bg-stone-900/30 p-6 text-center text-stone-500 text-xs">
            No known characters are present at this site during this cycle.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {presentCharacters.map((char) => {
              const dossier = getDossierForCharacter(char.id);
              const isExpanded = !!expandedDossierIds[char.id];

              return (
                <div
                  key={char.id}
                  className="bg-stone-900/80 rounded-2xl border border-stone-800 hover:border-amber-500/30 p-5 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl">
                          {char.portraitEmoji}
                        </div>
                        <div>
                          <h4 className="font-serif font-bold text-stone-100 text-base">
                            {char.name}
                          </h4>
                          <p className="text-xs text-stone-400">{char.title}</p>
                          <span className="text-[10px] font-mono text-amber-400/90 uppercase tracking-wider mt-0.5 block">
                            Role: {char.role}
                          </span>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {char.disposition}
                      </span>
                    </div>

                    {dossier && (
                      <div className="mb-3 p-2.5 rounded-lg bg-stone-950/80 border border-stone-850 space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block font-semibold">
                          Public Reputation Summary
                        </span>
                        <p className="text-xs text-stone-300 font-serif leading-relaxed">
                          {dossier.publicReputationSummary}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 mt-4 pt-3 border-t border-stone-800">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-stone-400 block font-medium">
                        Player-Observed Knowledge:
                      </span>
                      <ul className="space-y-1.5">
                        {char.playerVisibleKnowledge.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-stone-300 flex items-start gap-2 bg-stone-950/60 p-2 rounded-lg border border-stone-850"
                          >
                            <span className="text-amber-400/80 mt-0.5">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Dossier Milestones if available */}
                    {dossier && dossier.milestones && dossier.milestones.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-stone-800">
                        <button
                          type="button"
                          onClick={() => toggleDossierExpanded(char.id)}
                          className="w-full flex items-center justify-between text-xs font-mono text-stone-400 hover:text-amber-300 transition py-1"
                        >
                          <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[10px]">
                            <Award className="w-3.5 h-3.5 text-amber-400" />
                            <span>Dossier Milestones ({dossier.milestones.length})</span>
                          </span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-2">
                            {dossier.milestones.map((m) => (
                              <div
                                key={m.id}
                                className="bg-stone-950/70 p-2.5 rounded-lg border border-stone-800 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-stone-200 font-serif">
                                    {m.title}
                                  </span>
                                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                    {m.significance}
                                  </span>
                                </div>
                                <p className="text-[11px] text-stone-400 font-serif">
                                  {m.summary}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-3 border-t border-stone-800 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-stone-500 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-emerald-400" />
                      <span>Physically Present</span>
                    </span>
                    <button
                      id={`engage-dialogue-${char.id}`}
                      onClick={() => onEngageDialogue(char.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-medium transition flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Engage in Dialogue</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Discovered in other locations */}
      {otherCharacters.length > 0 && (
        <div className="pt-4 border-t border-stone-800">
          <h3 className="text-sm font-mono uppercase tracking-wider text-stone-400 font-semibold mb-3 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-stone-500" />
            <span>Characters Elsewhere in Dreamville ({otherCharacters.length})</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {otherCharacters.map((char) => {
              const loc = locations[char.locationId];
              const dossier = getDossierForCharacter(char.id);

              return (
                <div
                  key={char.id}
                  className="bg-stone-900/40 rounded-xl border border-stone-800/80 p-4 opacity-75 hover:opacity-100 transition space-y-2"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{char.portraitEmoji}</span>
                      <div>
                        <h4 className="font-serif font-bold text-stone-200 text-sm">
                          {char.name}
                        </h4>
                        <span className="text-[11px] text-stone-400">{char.title}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-stone-400 bg-stone-800/80 px-2 py-0.5 rounded border border-stone-700">
                      At: {loc ? loc.name : 'Unknown'}
                    </span>
                  </div>

                  {dossier && (
                    <p className="text-xs text-stone-400 font-serif line-clamp-2">
                      {dossier.publicReputationSummary}
                    </p>
                  )}

                  <p className="text-xs text-stone-400 italic pt-1 border-t border-stone-850">
                    Requires travel to {loc?.name ?? 'their location'} to initiate dialogue.
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

