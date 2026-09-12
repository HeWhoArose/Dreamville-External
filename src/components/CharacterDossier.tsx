import React from 'react';
import { ExternalCharacter, Location } from '../types';
import { UserCheck, MessageSquare, Shield, HelpCircle, MapPin } from 'lucide-react';

interface CharacterDossierProps {
  characters: Record<string, ExternalCharacter>;
  activeLocationId: string;
  locations: Record<string, Location>;
  onEngageDialogue: (characterId: string) => void;
}

export const CharacterDossier: React.FC<CharacterDossierProps> = ({
  characters,
  activeLocationId,
  locations,
  onEngageDialogue,
}) => {
  const characterList = Object.values(characters);
  const presentCharacters = characterList.filter((c) => c.locationId === activeLocationId);
  const otherCharacters = characterList.filter((c) => c.locationId !== activeLocationId);

  return (
    <div className="space-y-6">
      {/* Information Banner */}
      <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-stone-400">
          <span className="font-semibold text-stone-200 block mb-1">
            Epistemic Character Projection
          </span>
          Only information verified through player observation or dialogue is visible in this dossier.
          Hidden motives and canonical secrets are withheld by the deterministic engine contract.
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
            {presentCharacters.map((char) => (
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
            ))}
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
              return (
                <div
                  key={char.id}
                  className="bg-stone-900/40 rounded-xl border border-stone-800/80 p-4 opacity-75 hover:opacity-100 transition"
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
                  <p className="text-xs text-stone-400 italic">
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
