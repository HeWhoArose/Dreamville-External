import { deterministicId } from './deterministicRng';
import type { LocationPopulationProfile, LocationSceneObject } from './types';

/**
 * Canonical location archetypes.
 *
 * An archetype is structured world-authoring data. It is not derived from the
 * narrator: world generation, authored geography, or a migration may set it.
 * Name/description keywords are only a compatibility fallback for older worlds
 * that predate structured archetypes.
 */
export type LocationArchetype =
  | 'CITADEL'
  | 'URBAN_DISTRICT'
  | 'RESIDENTIAL_STREET'
  | 'MARKET'
  | 'INN'
  | 'GUILD_HALL'
  | 'TEMPLE'
  | 'HARBOR'
  | 'ALLEY'
  | 'PARK'
  | 'SEWER'
  | 'WORKPLACE'
  | 'RESTRICTED_SITE'
  | 'ABANDONED_SITE'
  | 'ROOM'
  | 'WILDERNESS'
  | 'GENERIC';

export interface LocationEnvironmentProfile {
  terrain?: string;
  lighting?: 'DAYLIT' | 'DIM' | 'DARK' | 'NATURAL';
  weatherExposure?: 'SHELTERED' | 'PARTIAL' | 'EXPOSED';
  /** Canonical structural/environmental facts usable as scene evidence. */
  features: string[];
  water?: {
    present: boolean;
    drainage?: boolean;
    description?: string;
  };
  /** Optional structured note about ordinary activity appropriate to the site. */
  ambientActivity?: string;
  [key: string]: unknown;
}

export interface ExpandedLocationStructure {
  archetype: LocationArchetype;
  sceneObjects?: LocationSceneObject[];
  population?: LocationPopulationProfile;
  environment?: LocationEnvironmentProfile;
}

const ARCHETYPES: LocationArchetype[] = [
  'CITADEL',
  'URBAN_DISTRICT',
  'RESIDENTIAL_STREET',
  'MARKET',
  'INN',
  'GUILD_HALL',
  'TEMPLE',
  'HARBOR',
  'ALLEY',
  'PARK',
  'SEWER',
  'WORKPLACE',
  'RESTRICTED_SITE',
  'ABANDONED_SITE',
  'ROOM',
  'WILDERNESS',
  'GENERIC',
];

export function normalizeLocationArchetype(value: unknown): LocationArchetype | undefined {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return (ARCHETYPES as string[]).includes(normalized)
    ? normalized as LocationArchetype
    : undefined;
}

/**
 * Resolve an archetype with explicit structured data taking priority.
 * Keyword matching exists only for legacy/AI payloads that omit the field, and
 * deliberately never proves occupancy or abandonment on its own.
 */
export function inferLocationArchetype(raw: any): LocationArchetype {
  const explicit = normalizeLocationArchetype(raw?.archetype);
  if (explicit) return explicit;

  const tags = Array.isArray(raw?.tags) ? raw.tags.map((tag: unknown) => String(tag).toLowerCase()) : [];
  for (const tag of tags) {
    const fromTag = normalizeLocationArchetype(tag.replace(/^location_/, ''));
    if (fromTag) return fromTag;
  }

  const text = [
    raw?.name,
    raw?.title,
    raw?.description,
    raw?.ambientSensory,
    raw?.region,
    raw?.regionId,
  ].filter(Boolean).join(' ').toLowerCase();

  const ordered: Array<[LocationArchetype, RegExp]> = [
    ['SEWER', /\bsewer|sewage|drain(?:age)? tunnel|cistern\b/],
    ['RESTRICTED_SITE', /\brestricted|checkpoint|secure facility|vault wing|authori[sz]ed personnel|access control\b/],
    ['ABANDONED_SITE', /\babandoned|derelict|ruined|deserted (?:site|facility|district)|long vacant\b/],
    ['PARK', /\bpark|garden|green(?:way)?|glade|common ground\b/],
    ['MARKET', /\bmarket|bazaar|marketplace|trading square\b/],
    ['INN', /\binn|tavern|coaching house|common room\b/],
    ['GUILD_HALL', /\bguild(?:hall)?|adventurers'? hall|contract hall\b/],
    ['TEMPLE', /\btemple|shrine|cathedral|sanctuary|chapel\b/],
    ['HARBOR', /\bharbou?r|dock|pier|wharf|quayside\b/],
    ['ALLEY', /\balley|side passage|back street|service lane\b/],
    ['WORKPLACE', /\bworkshop|worksite|factory|office|forge|warehouse|workplace|studio|kitchen|clinic|laboratory\b/],
    ['CITADEL', /\bcitadel|fortress|keep|palace|castle|bastion\b/],
    ['RESIDENTIAL_STREET', /\bresidential|terrace|housing|row of houses|neighbou?rhood|suburb\b/],
    ['URBAN_DISTRICT', /\bdistrict|street|avenue|boulevard|plaza|square|city centre|city center|arcade|ward\b/],
    ['ROOM', /\b(?:room|bedroom|bedchamber|quarters|chamber|apartment|study)\b/],
    ['WILDERNESS', /\bforest|wilderness|wood(?:land)?|moor|mountain|ridge|canyon|tundra|swamp|marsh|desert\b/],
  ];
  for (const [archetype, pattern] of ordered) {
    if (pattern.test(text)) return archetype;
  }
  return 'GENERIC';
}

interface ArchetypeTemplate {
  sceneObjects: Array<Omit<LocationSceneObject, 'id'> & { key: string }>;
  environment: LocationEnvironmentProfile;
  population: LocationPopulationProfile;
}

function item(
  key: string,
  name: string,
  description: string,
  tags: string[],
  properties: Record<string, unknown> = {},
  kind: LocationSceneObject['kind'] = 'ITEM',
): Omit<LocationSceneObject, 'id'> & { key: string } {
  return {
    key,
    name,
    kind,
    description,
    visible: true,
    interactable: kind === 'ITEM' || kind === 'INTERACTABLE',
    tags,
    properties: {
      searchAliases: tags,
      ...properties,
    },
    provenance: 'GENERATED_ARCHETYPE',
  };
}

function feature(
  key: string,
  name: string,
  description: string,
  tags: string[] = [],
): Omit<LocationSceneObject, 'id'> & { key: string } {
  return {
    key,
    name,
    kind: 'ENVIRONMENTAL_FEATURE',
    description,
    visible: true,
    interactable: false,
    tags: ['environmental_feature', ...tags],
    properties: { searchAliases: tags },
    provenance: 'GENERATED_ARCHETYPE',
  };
}

function structure(
  key: string,
  name: string,
  description: string,
  tags: string[] = [],
  interactable = false,
): Omit<LocationSceneObject, 'id'> & { key: string } {
  return {
    key,
    name,
    kind: 'STRUCTURE',
    description,
    visible: true,
    interactable,
    tags: ['structure', ...tags],
    properties: { searchAliases: tags },
    provenance: 'GENERATED_ARCHETYPE',
  };
}

function interactable(
  key: string,
  name: string,
  description: string,
  tags: string[] = [],
  properties: Record<string, unknown> = {},
): Omit<LocationSceneObject, 'id'> & { key: string } {
  return {
    key,
    name,
    kind: 'INTERACTABLE',
    description,
    visible: true,
    interactable: true,
    tags,
    properties: { searchAliases: tags, ...properties },
    provenance: 'GENERATED_ARCHETYPE',
  };
}

const TEMPLATES: Record<LocationArchetype, ArchetypeTemplate> = {
  CITADEL: {
    sceneObjects: [
      structure('forecourt', 'broad public forecourt', 'A wide paved forecourt where the public can gather.', ['forecourt', 'paved square']),
      structure('arcade', 'paved stone arcade', 'A covered arcade of pale stone columns bordering the forecourt.', ['arcade', 'colonnade']),
      feature('fountain', 'low stone fountain', 'A shallow fountain fed by a quiet runnel.', ['fountain', 'water']),
      interactable('guard_post', 'guard post', 'A manned post beside the main approach.', ['guard post', 'checkpoint']),
    ],
    environment: { terrain: 'Paved', lighting: 'DAYLIT', weatherExposure: 'PARTIAL', features: ['broad public forecourt', 'paved stone arcade', 'low stone fountain'], water: { present: true, drainage: true, description: 'The fountain spills into a stone drainage runnel.' }, ambientActivity: 'Public traffic and official business continue through the forecourt.' },
    population: { status: 'INHABITED', expectedPopulation: 'MODERATE', accessControlled: false, provenance: 'GENERATED' },
  },
  URBAN_DISTRICT: {
    sceneObjects: [
      structure('street', 'cobbled street', 'A worn cobbled street carrying foot and cart traffic.', ['street', 'road']),
      structure('notice_board', 'public notice board', 'A public board for official notices and local postings.', ['notice board', 'postings'], true),
      structure('lamp_post', 'iron lamp post', 'A tall iron lamp post at the edge of the street.', ['lamp post', 'light']),
      feature('storm_drain', 'storm drain', 'A grated drain carrying rainwater off the street.', ['drain', 'grate']),
    ],
    environment: { terrain: 'Paved', lighting: 'DAYLIT', weatherExposure: 'EXPOSED', features: ['cobbled street', 'public notice board', 'iron lamp post', 'storm drain'], water: { present: true, drainage: true, description: 'Rainwater runs along the gutters into a grated storm drain.' }, ambientActivity: 'Ordinary street traffic and nearby trade continue through the district.' },
    population: { status: 'INHABITED', expectedPopulation: 'MODERATE', accessControlled: false, provenance: 'GENERATED' },
  },
  RESIDENTIAL_STREET: {
    sceneObjects: [
      structure('doorways', 'row of house doorways', 'A row of private doorways opening onto the street.', ['doorway', 'houses']),
      structure('garden_wall', 'low garden wall', 'A low wall separating the footpath from small front gardens.', ['wall', 'garden']),
      structure('lamp_post', 'street lamp', 'A modest street lamp for the evening.', ['lamp', 'street lamp']),
      feature('bin', 'rubbish bin', 'A plain bin set out beside a doorway.', ['bin', 'rubbish']),
    ],
    environment: { terrain: 'Paved', lighting: 'DAYLIT', weatherExposure: 'EXPOSED', features: ['row of house doorways', 'low garden wall', 'street lamp', 'rubbish bin'] },
    population: { status: 'INHABITED', expectedPopulation: 'SPARSE', accessControlled: false, provenance: 'GENERATED' },
  },
  MARKET: {
    sceneObjects: [
      structure('stalls', 'rows of market stalls', 'Timber stalls crowded beneath patched canvas awnings.', ['stall', 'market stall']),
      structure('awning', 'canvas awning', 'A broad canvas awning shading the busiest stalls.', ['awning', 'canvas']),
      interactable('crates', 'stacked wooden crates', 'Sturdy crates of stock waiting beside a stall.', ['crate', 'box'], { openable: true }),
      interactable('notice_board', 'market notice board', 'A crowded board of prices, notices, and local postings.', ['notice board', 'postings']),
    ],
    environment: { terrain: 'Paved', lighting: 'DAYLIT', weatherExposure: 'PARTIAL', features: ['rows of market stalls', 'canvas awning', 'stacked wooden crates', 'market notice board'], ambientActivity: 'Vendors call out wares while shoppers move between the stalls.' },
    population: { status: 'INHABITED', expectedPopulation: 'DENSE', accessControlled: false, provenance: 'GENERATED' },
  },
  INN: {
    sceneObjects: [
      structure('common_room', 'common room tables', 'Scarred tables and benches fill the common room.', ['table', 'bench', 'common room']),
      structure('hearth', 'stone hearth', 'A broad hearth keeps the common room warm.', ['hearth', 'fire']),
      interactable('serving_counter', 'serving counter', 'A worn counter where drinks and keys are handed over.', ['counter', 'bar']),
      interactable('guest_ledger', 'guest ledger', 'A ledger of rooms, arrivals, and unsettled accounts.', ['ledger', 'book']),
    ],
    environment: { terrain: 'Indoor', lighting: 'DIM', weatherExposure: 'SHELTERED', features: ['common room tables', 'stone hearth', 'serving counter', 'guest ledger'], ambientActivity: 'Guests talk quietly over food and drink while staff move between tables.' },
    population: { status: 'INHABITED', expectedPopulation: 'MODERATE', accessControlled: false, provenance: 'GENERATED' },
  },
  GUILD_HALL: {
    sceneObjects: [
      structure('contract_board', 'contract board', 'A board of posted contracts and public notices.', ['contract board', 'notices', 'board'], true),
      interactable('clerk_desk', 'clerk desk', 'The guild clerk keeps records and answers questions here.', ['desk', 'clerk']),
      structure('benches', 'waiting benches', 'Long benches for members waiting to be seen.', ['bench', 'seating']),
      interactable('locker', 'equipment locker', 'A marked locker for members\' gear.', ['locker', 'container'], { openable: true }),
    ],
    environment: { terrain: 'Indoor', lighting: 'DIM', weatherExposure: 'SHELTERED', features: ['contract board', 'clerk desk', 'waiting benches', 'equipment locker'], ambientActivity: 'Members compare notices, argue over terms, and wait for the clerk.' },
    population: { status: 'INHABITED', expectedPopulation: 'MODERATE', accessControlled: false, provenance: 'GENERATED' },
  },
  TEMPLE: {
    sceneObjects: [
      structure('altar', 'stone altar', 'A plain stone altar at the centre of the hall.', ['altar', 'shrine']),
      structure('pews', 'rows of stone pews', 'Worn pews face the altar.', ['pew', 'bench']),
      interactable('candle_rack', 'candle rack', 'A rack of votive candles, some still burning.', ['candle', 'candles']),
      feature('incense', 'drifting incense smoke', 'Thin incense smoke gathers beneath the vault.', ['incense', 'smoke']),
    ],
    environment: { terrain: 'Indoor', lighting: 'DIM', weatherExposure: 'SHELTERED', features: ['stone altar', 'rows of stone pews', 'candle rack'], ambientActivity: 'Quiet devotion and low conversation carry through the hall.' },
    population: { status: 'INHABITED', expectedPopulation: 'SPARSE', accessControlled: false, provenance: 'GENERATED' },
  },
  HARBOR: {
    sceneObjects: [
      structure('docks', 'timber dock planks', 'Salt-worn planks run out over the water.', ['dock', 'pier', 'planks']),
      structure('bollards', 'mooring bollards', 'Heavy bollards where vessels are tied off.', ['bollard', 'mooring']),
      interactable('cargo', 'stacked cargo crates', 'Cargo waiting to be weighed or loaded.', ['cargo', 'crate'], { openable: true }),
      feature('water', 'harbour water', 'Dark water slaps against the pilings.', ['water', 'harbour']),
    ],
    environment: { terrain: 'Docks', lighting: 'DAYLIT', weatherExposure: 'EXPOSED', features: ['timber dock planks', 'mooring bollards', 'stacked cargo crates', 'harbour water'], water: { present: true, drainage: true, description: 'The harbour opens directly into deep water.' }, ambientActivity: 'Dockworkers and crew move cargo and trade news along the waterfront.' },
    population: { status: 'INHABITED', expectedPopulation: 'MODERATE', accessControlled: false, provenance: 'GENERATED' },
  },
  ALLEY: {
    sceneObjects: [
      structure('side_passage', 'narrow side passage', 'A narrow passage between two buildings.', ['passage', 'alley']),
      interactable('crates', 'stacked crates', 'Discarded crates are stacked against one wall.', ['crate', 'box'], { openable: true }),
      feature('drain', 'open drain', 'A shallow drain runs down the centre of the passage.', ['drain', 'gutter']),
      structure('fire_escape', 'iron fire escape', 'A narrow iron stair climbs the far wall.', ['stairs', 'fire escape']),
    ],
    environment: { terrain: 'Paved', lighting: 'DIM', weatherExposure: 'PARTIAL', features: ['narrow side passage', 'stacked crates', 'open drain', 'iron fire escape'], water: { present: true, drainage: true, description: 'Runoff collects in the open drain.' } },
    population: { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', accessControlled: false, provenance: 'GENERATED' },
  },
  PARK: {
    sceneObjects: [
      structure('path', 'gravel path', 'A gravel path winds between the trees.', ['path', 'trail', 'walkway']),
      structure('bench', 'weathered bench', 'A weathered bench faces the open ground.', ['bench', 'seat'], true),
      feature('trees', 'stand of trees', 'Established trees shade the edge of the park.', ['trees', 'woodland']),
      item('branch', 'fallen branch', 'A dry branch lies on the ground beneath the trees.', ['branch', 'stick', 'wood', 'fallen branch'], { itemCategory: 'Material', material: 'wood', weightKg: 0.8, baseValueGold: 0 }),
      item('stone', 'loose stone', 'A palm-sized stone worked loose from the path.', ['stone', 'rock'], { itemCategory: 'Material', material: 'stone', weightKg: 0.3, baseValueGold: 0 }),
      feature('pond', 'shallow pond', 'A shallow pond collects at the low end of the park.', ['pond', 'water']),
    ],
    environment: { terrain: 'Grass', lighting: 'NATURAL', weatherExposure: 'EXPOSED', features: ['gravel path', 'weathered bench', 'stand of trees', 'shallow pond'], water: { present: true, drainage: true, description: 'The pond overflows into a planted drainage swale.' }, ambientActivity: 'Birds and wind move through the trees; the park is open to ordinary public use.' },
    population: { status: 'INHABITED', expectedPopulation: 'SPARSE', accessControlled: false, provenance: 'GENERATED' },
  },
  SEWER: {
    sceneObjects: [
      feature('channel', 'drainage channel', 'A stone channel carries runoff through the tunnel.', ['channel', 'drain', 'water']),
      structure('ladder', 'iron ladder', 'A rusted ladder climbs toward a surface access point.', ['ladder', 'access'], true),
      interactable('pipe', 'outflow pipe', 'A wide pipe empties into the channel.', ['pipe', 'outflow']),
      structure('grate', 'iron grate', 'A heavy grate admits runoff and a little daylight.', ['grate', 'drain']),
      item('bottle', 'discarded bottle', 'An empty bottle has been left beside the channel.', ['bottle', 'glass'], { itemCategory: 'Miscellaneous', material: 'glass', weightKg: 0.2, baseValueGold: 0 }),
    ],
    environment: { terrain: 'Stone', lighting: 'DARK', weatherExposure: 'SHELTERED', features: ['drainage channel', 'iron ladder', 'outflow pipe', 'iron grate'], water: { present: true, drainage: true, description: 'Shallow runoff moves steadily along the channel toward the outflow.' } },
    population: { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', accessControlled: false, provenance: 'GENERATED' },
  },
  WORKPLACE: {
    sceneObjects: [
      structure('workbench', 'workbench', 'A broad workbench scattered with current work.', ['workbench', 'bench'], true),
      interactable('tool_rack', 'tool rack', 'Hand tools hang in marked positions on the rack.', ['tools', 'tool rack']),
      interactable('locker', 'storage locker', 'A locked storage locker for materials and gear.', ['locker', 'storage'], { openable: true }),
      item('offcuts', 'scrap offcuts', 'Usable scraps have collected beside the bench.', ['scrap', 'offcuts', 'material'], { itemCategory: 'Material', weightKg: 0.4, baseValueGold: 0 }),
    ],
    environment: { terrain: 'Indoor', lighting: 'DIM', weatherExposure: 'SHELTERED', features: ['workbench', 'tool rack', 'storage locker'], ambientActivity: 'Work continues with the ordinary noise of tools and movement.' },
    population: { status: 'INHABITED', expectedPopulation: 'MODERATE', accessControlled: false, provenance: 'GENERATED' },
  },
  RESTRICTED_SITE: {
    sceneObjects: [
      structure('gate', 'locked access gate', 'A reinforced gate controls entry past this point.', ['gate', 'checkpoint']),
      interactable('checkpoint', 'checkpoint desk', 'A staffed desk records authorized entry.', ['checkpoint', 'desk']),
      structure('ward', 'access ward', 'A warded seal marks the boundary of the restricted area.', ['ward', 'seal']),
      interactable('locked_cabinet', 'locked equipment cabinet', 'A secured cabinet for controlled equipment.', ['cabinet', 'locker'], { openable: true, locked: true, keyTag: 'access_key' }),
    ],
    environment: { terrain: 'Indoor', lighting: 'DIM', weatherExposure: 'SHELTERED', features: ['locked access gate', 'checkpoint desk', 'access ward', 'locked equipment cabinet'], ambientActivity: 'Authorized staff move on official business.' },
    population: { status: 'RESTRICTED', expectedPopulation: 'SPARSE', accessControlled: true, explanation: 'Access is controlled and ordinary public activity is not permitted.', provenance: 'GENERATED' },
  },
  ABANDONED_SITE: {
    sceneObjects: [
      structure('doorway', 'collapsed doorway', 'The doorway has partly collapsed and no longer closes.', ['doorway', 'collapsed']),
      feature('debris', 'scattered debris', 'Broken fittings and dust cover the floor.', ['debris', 'rubble']),
      item('crate', 'broken crate', 'A crate has split open and its contents are gone.', ['crate', 'broken'], { itemCategory: 'Miscellaneous', material: 'wood', weightKg: 1.2, baseValueGold: 0 }),
    ],
    environment: { terrain: 'Indoor', lighting: 'DIM', weatherExposure: 'PARTIAL', features: ['collapsed doorway', 'scattered debris', 'broken crate'] },
    population: { status: 'ABANDONED', expectedPopulation: 'NONE', accessControlled: false, explanation: 'World generation establishes this site as abandoned; no current activity is recorded.', provenance: 'GENERATED' },
  },
  WILDERNESS: {
    sceneObjects: [
      structure('trail', 'game trail', 'A narrow trail presses through the undergrowth.', ['trail', 'path']),
      feature('undergrowth', 'dense undergrowth', 'Low scrub and brambles crowd the trail.', ['undergrowth', 'bush']),
      item('log', 'fallen log', 'A fallen log lies across the edge of the trail.', ['log', 'wood', 'fallen log'], { itemCategory: 'Material', material: 'wood', weightKg: 2.4, baseValueGold: 0 }),
      feature('stream', 'shallow stream', 'A shallow stream crosses the low ground.', ['stream', 'water']),
    ],
    environment: { terrain: 'Wilderness', lighting: 'NATURAL', weatherExposure: 'EXPOSED', features: ['game trail', 'dense undergrowth', 'fallen log', 'shallow stream'], water: { present: true, drainage: true, description: 'The stream follows the lowest ground through the area.' } },
    population: { status: 'UNKNOWN', expectedPopulation: 'VARIABLE', accessControlled: false, provenance: 'GENERATED' },
  },
  ROOM: {
    sceneObjects: [
      structure('door', 'plain wooden door', 'A simple door set into the wall.', ['door', 'wooden door']),
      structure('table', 'small wooden table', 'A plain table stands against one side of the room.', ['table', 'wooden table']),
      feature('window', 'narrow window', 'A narrow window admits the available light.', ['window', 'light']),
    ],
    environment: { terrain: 'Indoor', lighting: 'NATURAL', weatherExposure: 'SHELTERED', features: ['plain wooden door', 'small wooden table', 'narrow window'] },
    population: { status: 'UNKNOWN', provenance: 'UNKNOWN' },
  },
  GENERIC: {
    sceneObjects: [],
    environment: { features: [] },
    population: { status: 'UNKNOWN', provenance: 'UNKNOWN' },
  },
};

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function materializeDefaults(
  archetype: LocationArchetype,
  locationId: string,
): { sceneObjects: LocationSceneObject[]; environment: LocationEnvironmentProfile; population: LocationPopulationProfile } {
  const template = TEMPLATES[archetype] || TEMPLATES.GENERIC;
  return {
    sceneObjects: template.sceneObjects.map(({ key, ...object }) => ({
      ...cloneJson(object),
      id: deterministicId('scene_object', locationId, archetype, key),
    })),
    environment: cloneJson(template.environment),
    population: cloneJson(template.population),
  };
}

function normalizePopulation(raw: any): LocationPopulationProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const status = String(raw.status || '').trim().toUpperCase();
  if (!['INHABITED', 'RESTRICTED', 'ABANDONED', 'UNKNOWN'].includes(status)) return undefined;
  const expectedPopulation = String(raw.expectedPopulation || '').trim().toUpperCase();
  const provenance = String(raw.provenance || '').trim().toUpperCase();
  return {
    status: status as LocationPopulationProfile['status'],
    ...(expectedPopulation && ['NONE', 'SPARSE', 'MODERATE', 'DENSE', 'VARIABLE'].includes(expectedPopulation)
      ? { expectedPopulation: expectedPopulation as LocationPopulationProfile['expectedPopulation'] }
      : {}),
    ...(typeof raw.encounterProfileId === 'string' && raw.encounterProfileId.trim()
      ? { encounterProfileId: raw.encounterProfileId.trim() }
      : {}),
    ...(typeof raw.explanation === 'string' && raw.explanation.trim()
      ? { explanation: raw.explanation.trim() }
      : {}),
    ...(raw.accessControlled === true ? { accessControlled: true } : {}),
    provenance: (['AUTHORED', 'GENERATED', 'SIMULATED', 'UNKNOWN'].includes(provenance)
      ? provenance
      : 'UNKNOWN') as LocationPopulationProfile['provenance'],
  };
}

function normalizeSceneObjects(raw: any, locationId: string): LocationSceneObject[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const objects: LocationSceneObject[] = [];
  raw.forEach((entry: any, index: number) => {
    if (!entry || typeof entry !== 'object') return;
    const name = String(entry.name || entry.label || '').trim();
    if (!name) return;
    const kindRaw = String(entry.kind || entry.type || 'OTHER').trim().toUpperCase();
    const kind = (['ITEM', 'ENVIRONMENTAL_FEATURE', 'STRUCTURE', 'INTERACTABLE', 'HAZARD', 'OTHER'] as string[]).includes(kindRaw)
      ? kindRaw as LocationSceneObject['kind']
      : 'OTHER';
    objects.push({
      id: String(entry.id || deterministicId('scene_object', locationId, index, name)),
      name,
      kind,
      ...(typeof entry.description === 'string' && entry.description.trim() ? { description: entry.description.trim() } : {}),
      visible: entry.visible !== false,
      interactable: entry.interactable === true,
      tags: Array.isArray(entry.tags) ? entry.tags.map((tag: unknown) => String(tag)).filter(Boolean) : [],
      properties: entry.properties && typeof entry.properties === 'object' ? cloneJson(entry.properties) : {},
      ...(typeof entry.provenance === 'string' && entry.provenance.trim() ? { provenance: entry.provenance } : {}),
    });
  });
  return objects;
}

function normalizeEnvironment(raw: any, sceneObjects: LocationSceneObject[]): LocationEnvironmentProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const features = Array.isArray(raw.features)
    ? raw.features.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [];
  const objectFeatures = sceneObjects
    .filter((object) => object.visible !== false && (object.kind === 'STRUCTURE' || object.kind === 'ENVIRONMENTAL_FEATURE'))
    .map((object) => object.name);
  return {
    ...cloneJson(raw),
    features: Array.from(new Set([...features, ...objectFeatures])),
  };
}

/**
 * Expand a location's structured fields.
 *
 * - Authored/AI fields are always preserved.
 * - `generateDefaults` is only true for world generation, where establishing
 *   canonical scene detail is authorized. It never turns missing occupancy into
 *   ABANDONED or INHABITED: only an explicit archetype template can.
 * - Legacy saved worlds are preserved as-is unless they explicitly carry an
 *   archetype.
 */
export function expandLocationStructure(
  raw: any,
  options: {
    locationId: string;
    generateDefaults: boolean;
  },
): ExpandedLocationStructure {
  const archetype = inferLocationArchetype(raw);
  const defaults = materializeDefaults(archetype, options.locationId);
  const providedSceneObjects = normalizeSceneObjects(raw?.sceneObjects, options.locationId);
  const providedPopulation = normalizePopulation(raw?.population);
  const providedEnvironment = normalizeEnvironment(raw?.environment, providedSceneObjects || []);

  const shouldGenerate = options.generateDefaults && archetype !== 'GENERIC';
  const sceneObjects = providedSceneObjects !== undefined
    ? providedSceneObjects
    : shouldGenerate
      ? defaults.sceneObjects
      : undefined;
  const population = providedPopulation || (shouldGenerate ? defaults.population : undefined);
  const environment = providedEnvironment || (shouldGenerate ? defaults.environment : undefined);

  return {
    archetype,
    ...(sceneObjects ? { sceneObjects } : {}),
    ...(population ? { population } : {}),
    ...(environment ? { environment } : {}),
  };
}

/**
 * Scene-evidence helpers shared by perception/review code.
 */
export function isPublicArchetype(archetype: LocationArchetype): boolean {
  return ['CITADEL', 'URBAN_DISTRICT', 'RESIDENTIAL_STREET', 'MARKET', 'INN', 'GUILD_HALL', 'TEMPLE', 'HARBOR', 'ALLEY', 'PARK', 'WORKPLACE'].includes(archetype);
}

export function isShelteredArchetype(archetype: LocationArchetype): boolean {
  return ['INN', 'GUILD_HALL', 'TEMPLE', 'WORKPLACE', 'SEWER', 'RESTRICTED_SITE', 'ABANDONED_SITE', 'ROOM'].includes(archetype);
}

/**
 * Aggregate ambient-activity evidence.
 *
 * Only canonical occupancy can establish ordinary activity. UNKNOWN occupancy
 * and explicit abandonment produce no activity claim, and RESTRICTED sites
 * describe authorized activity without implying public crowds.
 */
export function describeAmbientActivity(
  raw: { archetype?: unknown; environment?: any; population?: any },
  hour: number,
): string | undefined {
  const population = raw?.population;
  const status = String(population?.status || 'UNKNOWN').toUpperCase();
  const expected = String(population?.expectedPopulation || '').toUpperCase();
  if (status === 'ABANDONED' || status === 'UNKNOWN' || expected === 'NONE') return undefined;
  if (status === 'RESTRICTED') {
    return 'Activity here is limited to authorized occupants; ordinary public crowds are not established.';
  }
  const archetype = normalizeLocationArchetype(raw?.archetype) || 'GENERIC';
  const base = typeof raw?.environment?.ambientActivity === 'string' && raw.environment.ambientActivity.trim()
    ? raw.environment.ambientActivity.trim()
    : TEMPLATES[archetype]?.environment?.ambientActivity;
  if (!base) return undefined;
  if (hour < 6 || hour >= 22) {
    return ['INN', 'GUILD_HALL', 'CITADEL'].includes(archetype)
      ? base
      : 'Ordinary activity is quiet at this hour.';
  }
  return base;
}
