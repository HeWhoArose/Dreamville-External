import { LocationArchetype, inferLocationArchetype } from './locationArchetypes';
import type { LocationSceneObject } from './types';
import type { WorldRepository } from '../repositories/worldRepository';
import { deterministicId } from './deterministicRng';

export interface AffordanceClassification {
  noun: string;
  locationArchetype: string;
  isPlausible: boolean;
  isTakeable: boolean;
  isPlotCritical: boolean;
  defaultCategory?: string;
  defaultDescription?: string;
}

// Strict Plot-Critical Denylist: items that must NEVER be materialised on demand
const PLOT_CRITICAL_DENYLIST = new Set([
  // Weapons & ammo
  'weapon', 'weapons', 'gun', 'guns', 'revolver', 'pistol', 'rifle', 'shotgun', 'firearm', 'firearms',
  'sword', 'swords', 'blade', 'blades', 'dagger', 'daggers', 'knife', 'knives', 'bow', 'spear', 'axe',
  'mace', 'ammunition', 'bullet', 'bullets', 'arrow', 'arrows',
  // Keys & access
  'key', 'keys', 'keycard', 'keycards', 'passkey', 'skeleton key', 'brass key', 'latchkey', 'master key',
  // Bodies & casualties
  'body', 'corpse', 'corpses', 'victim', 'cadaver', 'remains', 'dead body', 'victim body', 'deceased body', 'casualty',
  // Clues & evidence
  'clue', 'clues', 'evidence', 'fingerprint', 'fingerprints', 'bloody rag', 'murder weapon',
  'autopsy report', 'secret document', 'confession', 'dossier', 'ledger of secrets',
  // Secure containers
  'safe', 'locked safe', 'strongbox', 'vault', 'locked chest',
  // Currency & valuables
  'currency', 'coin', 'coins', 'gold', 'gold coins', 'money', 'cash', 'wallet', 'purse', 'jewel', 'gem',
  // Magic, sci-fi & quest items
  'relic', 'artifact', 'quest item', 'ancient talisman', 'talisman', 'magic wand', 'scroll', 'orb', 'amulet',
  'lightsaber', 'antimatter bomb', 'teleportation ring', 'laser rifle', 'dragon egg', 'jetpack',
]);

interface AffordanceItem {
  takeable: boolean;
  description: string;
}

const ARCHETYPE_AFFORDANCES: Record<string, Record<string, AffordanceItem>> = {
  WORKPLACE: {
    'chair': { takeable: false, description: 'An ordinary wooden or swivel chair positioned near the workspace.' },
    'office chair': { takeable: false, description: 'A standard office chair with worn upholstery.' },
    'desk': { takeable: false, description: 'A utilitarian wooden working desk.' },
    'table': { takeable: false, description: 'A sturdy work table.' },
    'filing cabinet': { takeable: false, description: 'A metal filing cabinet for office records.' },
    'cabinet': { takeable: false, description: 'A plain wooden or metal storage cabinet.' },
    'shelf': { takeable: false, description: 'A wall-mounted shelf.' },
    'bookshelf': { takeable: false, description: 'A shelf stacked with commercial directories and reference manuals.' },
    'lamp': { takeable: false, description: 'A desk lamp casting focused light across the papers.' },
    'desk lamp': { takeable: false, description: 'A standard gooseneck or green-shaded desk lamp.' },
    'window': { takeable: false, description: 'A glass window overlooking the district outside.' },
    'door': { takeable: false, description: 'The entrance door leading into the office.' },
    'wastebasket': { takeable: false, description: 'A small metal or wicker wastebasket.' },
    'coat rack': { takeable: false, description: 'A standing coat rack beside the entrance.' },
    'rug': { takeable: false, description: 'A worn floor rug.' },
    'clock': { takeable: false, description: 'A wall clock ticking steadily.' },
    'telephone': { takeable: false, description: 'A standard rotary telephone on the desk.' },
    'blinds': { takeable: false, description: 'Slatted window blinds filtering exterior light.' },
    'curtain': { takeable: false, description: 'Plain curtains framing the window.' },
    'typewriter': { takeable: false, description: 'A mechanical typewriter resting on a side table.' },
    'paperweight': { takeable: true, description: 'A heavy brass or glass paperweight.' },
    'scrap paper': { takeable: true, description: 'A blank scrap of memo paper.' },
    'pen': { takeable: true, description: 'A writing pen.' },
    'paper': { takeable: true, description: 'A sheet of blank paper.' },
  },
  ROOM: {
    'bed': { takeable: false, description: 'A simple bed made with plain linens.' },
    'chair': { takeable: false, description: 'A straight-backed wooden chair.' },
    'desk': { takeable: false, description: 'A small writing desk.' },
    'nightstand': { takeable: false, description: 'A small bedside table.' },
    'wardrobe': { takeable: false, description: 'A tall wooden wardrobe for clothing.' },
    'closet': { takeable: false, description: 'A built-in closet.' },
    'mirror': { takeable: false, description: 'A framed wall mirror.' },
    'lamp': { takeable: false, description: 'A bedside oil or electric lamp.' },
    'window': { takeable: false, description: 'A window looking out on the street.' },
    'door': { takeable: false, description: 'The bedroom door.' },
    'rug': { takeable: false, description: 'A soft rug beside the bed.' },
    'curtain': { takeable: false, description: 'Fabric curtains hanging by the window.' },
    'washbasin': { takeable: false, description: 'A ceramic washbasin on a stand.' },
  },
  PARK: {
    'bench': { takeable: false, description: 'A weathered wooden bench facing the walking path.' },
    'path': { takeable: false, description: 'A gravel path winding through the park grounds.' },
    'gravel path': { takeable: false, description: 'A crunching gravel walkway.' },
    'tree': { takeable: false, description: 'A mature shade tree.' },
    'trees': { takeable: false, description: 'A cluster of park trees.' },
    'bush': { takeable: false, description: 'A neatly trimmed decorative shrub.' },
    'lawn': { takeable: false, description: 'An expanse of open park grass.' },
    'fountain': { takeable: false, description: 'A stone park fountain.' },
    'trash can': { takeable: false, description: 'A public receptacle set beside the path.' },
    'trash bin': { takeable: false, description: 'A public receptacle set beside the path.' },
    'fence': { takeable: false, description: 'A low decorative iron fence.' },
    'leaf': { takeable: true, description: 'A fallen autumn leaf.' },
    'flower': { takeable: true, description: 'A small wild flower.' },
    'pebble': { takeable: true, description: 'A smooth, palm-sized stone from the path.' },
    'loose stone': { takeable: true, description: 'A loose stone resting beside the path.' },
    'rock': { takeable: true, description: 'A rough rock lying in the grass.' },
    'branch': { takeable: true, description: 'A fallen dry branch snapped from a tree.' },
    'fallen branch': { takeable: true, description: 'A sturdy dry branch on the ground.' },
    'stick': { takeable: true, description: 'A short wooden stick.' },
  },
  URBAN_DISTRICT: {
    'taxi': { takeable: false, description: 'A licensed city taxi cab cruising the street.' },
    'yellow cab': { takeable: false, description: 'A yellow city taxi cab.' },
    'cab': { takeable: false, description: 'A city cab for hire.' },
    'curb': { takeable: false, description: 'The stone curb dividing walkway from street.' },
    'kerb': { takeable: false, description: 'The stone curb dividing walkway from street.' },
    'sidewalk': { takeable: false, description: 'The paved pedestrian sidewalk.' },
    'pavement': { takeable: false, description: 'The cobbled or asphalt pavement.' },
    'lamppost': { takeable: false, description: 'A tall iron street lamp.' },
    'street lamp': { takeable: false, description: 'An iron street lamp mounted at the roadside.' },
    'bench': { takeable: false, description: 'A public municipal bench.' },
    'newspaper': { takeable: true, description: 'A discarded daily newspaper.' },
    'awning': { takeable: false, description: 'A canvas awning projecting from a storefront.' },
    'gutter': { takeable: false, description: 'A street gutter carrying rainwater runoff.' },
    'storm drain': { takeable: false, description: 'A grated street storm drain.' },
    'drain': { takeable: false, description: 'A street drainage outlet.' },
    'grate': { takeable: false, description: 'An iron street drainage grate.' },
    'notice board': { takeable: false, description: 'A wooden board covered in public flyers.' },
    'trash bin': { takeable: false, description: 'A municipal rubbish bin.' },
    'doorway': { takeable: false, description: 'A recessed storefront or residential entrance.' },
    'fire escape': { takeable: false, description: 'A black iron fire escape climbing the facade.' },
    'railing': { takeable: false, description: 'An iron safety railing along the walkway.' },
    'traffic': { takeable: false, description: 'Passing vehicular traffic.' },
    'pedestrian': { takeable: false, description: 'Pedestrians walking along the thoroughfare.' },
    'alley': { takeable: false, description: 'A narrow side alley between brick buildings.' },
  },
  RESIDENTIAL_STREET: {
    'doorway': { takeable: false, description: 'A front entrance door.' },
    'front steps': { takeable: false, description: 'Stone steps leading to a house entrance.' },
    'garden wall': { takeable: false, description: 'A low brick or stone garden wall.' },
    'street lamp': { takeable: false, description: 'A quiet street lamp standing at the curb.' },
    'mailbox': { takeable: false, description: 'A metal postal delivery box.' },
    'rubbish bin': { takeable: false, description: 'A household rubbish bin beside the gate.' },
    'pavement': { takeable: false, description: 'The residential footpath.' },
    'sidewalk': { takeable: false, description: 'The quiet residential sidewalk.' },
  },
  SEWER: {
    'sewer drain': { takeable: false, description: 'A drain conduit directing runoff.' },
    'drain': { takeable: false, description: 'A runoff conduit.' },
    'drainage channel': { takeable: false, description: 'A carved stone channel running down the center of the tunnel.' },
    'grate': { takeable: false, description: 'A heavy rusted iron drainage grate.' },
    'pipe': { takeable: false, description: 'A corrugated iron runoff pipe protruding from the wall.' },
    'outflow pipe': { takeable: false, description: 'A wide outflow pipe discharging dark runoff.' },
    'ladder': { takeable: false, description: 'A rusted iron access ladder leading up to a street manhole.' },
    'walkway': { takeable: false, description: 'A slippery stone catwalk flanking the channel.' },
    'water': { takeable: false, description: 'Murky runoff flowing slowly through the channel.' },
    'brick': { takeable: true, description: 'A loose masonry brick dislodged from the tunnel wall.' },
    'moss': { takeable: false, description: 'Damp green moss clinging to wet stones.' },
    'valve': { takeable: false, description: 'A heavy iron shutoff valve wheel.' },
    'discarded bottle': { takeable: true, description: 'An empty glass bottle discarded on the ledge.' },
    'bottle': { takeable: true, description: 'A glass bottle lying against the conduit.' },
  },
  CRIME_SCENE: {
    'chalk outline': { takeable: false, description: 'A white chalk outline marking the exact position where the victim fell.' },
    'perimeter tape': { takeable: false, description: 'Yellow crime scene barrier tape cordoning off the immediate perimeter.' },
    'tape': { takeable: false, description: 'Crime scene barrier tape.' },
    'barrier': { takeable: false, description: 'A temporary crowd barrier sealing the area.' },
    'bloodstain': { takeable: false, description: 'A dark crimson stain on the surface near the victim.' },
    'stain': { takeable: false, description: 'A dark stain on the floor.' },
    'shattered glass': { takeable: false, description: 'Fragments of broken glass scattered across the area.' },
    'footprints': { takeable: false, description: 'Distinct footprints tracking away from the immediate scene.' },
    'footprint': { takeable: false, description: 'A visible shoe print on the ground.' },
    'doorframe': { takeable: false, description: 'The damaged doorframe leading into the scene.' },
    'bullet casing': { takeable: false, description: 'A marked casing indicator at the scene.' },
  },
  MARKET: {
    'stall': { takeable: false, description: 'A timber market stall displaying merchandise.' },
    'market stall': { takeable: false, description: 'A vendor stall under a canvas tarp.' },
    'counter': { takeable: false, description: 'A wooden vendor counter.' },
    'awning': { takeable: false, description: 'A striped cloth awning sheltering the wares.' },
    'wooden crate': { takeable: false, description: 'A slatted shipping crate stacked beside a booth.' },
    'crate': { takeable: false, description: 'A sturdy wooden cargo crate.' },
    'barrel': { takeable: false, description: 'A wooden storage barrel.' },
    'basket': { takeable: false, description: 'A wicker produce basket.' },
    'notice board': { takeable: false, description: 'A board of merchant prices and community notices.' },
  },
  INN: {
    'table': { takeable: false, description: 'A heavy oak tavern table scarred by tankards.' },
    'wooden table': { takeable: false, description: 'A round wooden table in the common room.' },
    'chair': { takeable: false, description: 'A sturdy tavern chair.' },
    'bench': { takeable: false, description: 'A long bench set against the wall.' },
    'stool': { takeable: false, description: 'A high bar stool beside the counter.' },
    'serving counter': { takeable: false, description: 'The main tavern serving bar.' },
    'bar': { takeable: false, description: 'A polished timber bar with bottles arranged behind it.' },
    'hearth': { takeable: false, description: 'A stone fireplace giving off steady heat.' },
    'fireplace': { takeable: false, description: 'A wide masonry fireplace.' },
    'guest ledger': { takeable: false, description: 'The inn register resting on the front desk.' },
    'mug': { takeable: true, description: 'An empty ceramic drinking mug.' },
    'tankard': { takeable: true, description: 'A battered pewter tankard.' },
    'glass': { takeable: true, description: 'An empty drinking glass.' },
    'bottle': { takeable: true, description: 'An empty spirits bottle.' },
  },
  CITADEL: {
    'forecourt': { takeable: false, description: 'A wide paved stone forecourt.' },
    'column': { takeable: false, description: 'A tall stone column supporting the archway.' },
    'fountain': { takeable: false, description: 'A shallow stone fountain.' },
    'banner': { takeable: false, description: 'A decorative heraldic banner.' },
  },
  GUILD_HALL: {
    'contract board': { takeable: false, description: 'A wooden board displaying open guild contracts.' },
    'clerk desk': { takeable: false, description: 'The registry desk where the guild clerk sits.' },
    'bench': { takeable: false, description: 'A waiting bench for guild members.' },
  },
  TEMPLE: {
    'altar': { takeable: false, description: 'A sacred stone altar.' },
    'pew': { takeable: false, description: 'A row of polished wooden pews.' },
    'candle rack': { takeable: false, description: 'A wrought iron rack holding prayer candles.' },
  },
  HARBOR: {
    'dock': { takeable: false, description: 'Timber mooring planks over the water.' },
    'bollard': { takeable: false, description: 'A heavy cast-iron mooring bollard.' },
    'gangplank': { takeable: false, description: 'A wooden ramp connecting dock to deck.' },
    'rope': { takeable: true, description: 'A length of discarded docking hemp.' },
  },
  ALLEY: {
    'fire escape': { takeable: false, description: 'A metal fire escape bolted to the brickwork.' },
    'drain': { takeable: false, description: 'A shallow runoff drain.' },
    'crates': { takeable: false, description: 'Stacked delivery boxes.' },
    'brick': { takeable: true, description: 'A loose masonry brick.' },
  },
  WILDERNESS: {
    'boulder': { takeable: false, description: 'A large weather-beaten granite boulder.' },
    'tree trunk': { takeable: false, description: 'A fallen mossy tree trunk.' },
    'stream': { takeable: false, description: 'A clear freshwater runoff stream.' },
    'pebble': { takeable: true, description: 'A smooth river pebble.' },
    'stick': { takeable: true, description: 'A sturdy dry walking stick.' },
  },
  RESTRICTED_SITE: {
    'gate': { takeable: false, description: 'A locked access gate.' },
    'checkpoint desk': { takeable: false, description: 'A checkpoint station with security logs.' },
  },
  ABANDONED_SITE: {
    'rubble': { takeable: false, description: 'A mound of collapsed masonry.' },
    'broken glass': { takeable: false, description: 'Shards of broken window glass on the floor.' },
  },
  GENERIC: {
    'wall': { takeable: false, description: 'A plain structural wall.' },
    'floor': { takeable: false, description: 'The level walking floor.' },
    'ceiling': { takeable: false, description: 'The overhead ceiling.' },
    'door': { takeable: false, description: 'A standard entry door.' },
    'window': { takeable: false, description: 'A glass window.' },
    'light': { takeable: false, description: 'An ambient light source.' },
  },
};

function normalizeArchetypeKey(raw: string): string {
  const upper = String(raw || '').toUpperCase().trim();
  if (upper === 'OFFICE') return 'WORKPLACE';
  if (upper === 'STREET') return 'URBAN_DISTRICT';
  return upper;
}

export class AffordancePlausibilityEngine {
  /**
   * Deterministically returns whether a noun is plot-critical or quest-sensitive
   * and must never be permitted through environmental affordances.
   */
  public static isPlotCriticalDenylisted(noun: string): boolean {
    const normalized = String(noun || '').toLowerCase().trim();
    if (!normalized) return false;
    if (PLOT_CRITICAL_DENYLIST.has(normalized)) return true;
    for (const item of PLOT_CRITICAL_DENYLIST) {
      const regex = new RegExp(`(^|\\s)${item.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}(\\s|$)`, 'i');
      if (regex.test(normalized)) return true;
    }
    return false;
  }

  /**
   * Evaluates if a given noun represents a plausible mundane environmental affordance
   * for a given location archetype.
   */
  public static isPlausibleAffordance(noun: string, locationArchetype: string): boolean {
    if (this.isPlotCriticalDenylisted(noun)) return false;
    const normalizedNoun = String(noun || '').toLowerCase().trim();
    if (!normalizedNoun) return false;

    const key = normalizeArchetypeKey(locationArchetype);
    const table = ARCHETYPE_AFFORDANCES[key] || ARCHETYPE_AFFORDANCES.GENERIC;
    if (table[normalizedNoun]) return true;

    // Direct token & substring matching against archetype affordances
    const tokens = normalizedNoun.split(/\s+/).filter(Boolean);
    for (const entryKey of Object.keys(table)) {
      if (normalizedNoun === entryKey) return true;
      if (normalizedNoun.includes(entryKey) || entryKey.includes(normalizedNoun)) return true;
      if (tokens.some((token) => token === entryKey)) return true;
    }

    return false;
  }

  /**
   * Classifies a noun within an archetype, reporting plausibility, takeability, and descriptions.
   */
  public static classify(noun: string, locationArchetype: string): AffordanceClassification {
    const isDenylisted = this.isPlotCriticalDenylisted(noun);
    if (isDenylisted) {
      return {
        noun,
        locationArchetype,
        isPlausible: false,
        isTakeable: false,
        isPlotCritical: true,
      };
    }

    const normalizedNoun = String(noun || '').toLowerCase().trim();
    const key = normalizeArchetypeKey(locationArchetype);
    const table = ARCHETYPE_AFFORDANCES[key] || ARCHETYPE_AFFORDANCES.GENERIC;

    let match = table[normalizedNoun];
    if (!match) {
      const tokens = normalizedNoun.split(/\s+/).filter(Boolean);
      for (const [entryKey, data] of Object.entries(table)) {
        if (normalizedNoun.includes(entryKey) || entryKey.includes(normalizedNoun) || tokens.some((t) => t === entryKey)) {
          match = data;
          break;
        }
      }
    }

    if (match) {
      return {
        noun,
        locationArchetype,
        isPlausible: true,
        isTakeable: match.takeable,
        isPlotCritical: false,
        defaultCategory: match.takeable ? 'Miscellaneous' : undefined,
        defaultDescription: match.description,
      };
    }

    return {
      noun,
      locationArchetype,
      isPlausible: false,
      isTakeable: false,
      isPlotCritical: false,
    };
  }

  /**
   * Materialises a plausible mundane environmental affordance into GeographyGraph on demand.
   */
  public static materialiseAffordance(params: {
    repository: WorldRepository;
    storyId: string;
    locationId: string;
    noun: string;
    archetype?: string;
  }): { success: boolean; object?: LocationSceneObject; errorReason?: string } {
    const { repository, storyId, locationId, noun } = params;
    const graph = repository.getGeographyGraph(storyId);
    const node = graph.getNode(locationId);
    if (!node) return { success: false, errorReason: `Location '${locationId}' not found.` };

    const archetype = params.archetype || node.archetype || inferLocationArchetype(node);
    const classification = this.classify(noun, archetype);

    if (classification.isPlotCritical) {
      return {
        success: false,
        errorReason: `Plot-critical item '${noun}' cannot be materialised as an environmental affordance.`,
      };
    }

    if (!classification.isPlausible) {
      return {
        success: false,
        errorReason: `'${noun}' is not a plausible mundane affordance for ${archetype}.`,
      };
    }

    const slug = noun.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const objectId = deterministicId('affordance', locationId, slug);

    // If already exists, return existing
    const existing = (node.sceneObjects || []).find((obj) => obj.id === objectId);
    if (existing) return { success: true, object: existing };

    const newObject: LocationSceneObject = {
      id: objectId,
      name: noun.charAt(0).toUpperCase() + noun.slice(1),
      kind: classification.isTakeable ? 'ITEM' : 'STRUCTURE',
      description: classification.defaultDescription || `A standard ${noun} typical of this ${archetype.toLowerCase()}.`,
      visible: true,
      interactable: true,
      tags: ['affordance', 'mundane', slug],
      properties: {
        origin: 'AFFORDANCE',
        affordanceTier: 'MUNDANE',
        takeable: classification.isTakeable,
        materialisedFromArchetype: archetype,
        lifecycle: 'ACTIVE_TEMPORARY',
        ttlTurns: 3,
        activeDependencies: [],
      },
      provenance: 'AFFORDANCE_PLAUSIBILITY_ENGINE',
      lifecycleStage: 'ACTIVE_TEMPORARY',
      ttlTurns: 3,
      activeDependencies: [],
    };

    const added = graph.addSceneObject(locationId, newObject);
    return added;
  }
}
