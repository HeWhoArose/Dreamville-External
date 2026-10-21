import { LocationNode, LocationSceneObject, RouteEdge, TerrainType, TravelMode } from './types';

export const TERRAIN_TIME_MODIFIERS: Record<TerrainType, number> = {
  Road: 1.0,
  Trail: 1.2,
  Forest: 1.5,
  Hills: 1.6,
  Swamp: 2.2,
  Mountains: 2.5,
  Water: 1.8,
};

export const DEFAULT_SPEED_KM_PER_HOUR: Record<TravelMode, number> = {
  Foot: 4.5,
  Horse: 12.0,
  Coach: 8.0,
  Boat: 10.0,
  Flight: 40.0,
  Teleport: Infinity,
};

/**
 * GeographyGraph
 * Canonical topological world graph implementing DreamBook §328, §329, §338, §339.
 */
export class GeographyGraph {
  private nodes: Map<string, LocationNode> = new Map();
  private edges: Map<string, RouteEdge> = new Map();
  private adjacency: Map<string, string[]> = new Map(); // fromLocationId -> edgeIds

  constructor(seedDefault = true) {
    if (seedDefault) {
      this.seedDefaultTopology();
    }
  }

  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
  }

  public addNode(node: LocationNode): void {
    // Deep-copy nested canonical fields so callers cannot mutate stored world
    // state through a shared sceneObjects/population/environment reference.
    this.nodes.set(node.id, JSON.parse(JSON.stringify(node)));
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, []);
    }
  }

  public getNode(id: string): LocationNode | undefined {
    const node = this.nodes.get(id);
    return node ? JSON.parse(JSON.stringify(node)) : undefined;
  }

  /**
   * Canonical scene-object mutation owned by GeographyGraph.
   * Discovery/pickup resolve through this method; narration never edits it.
   */
  public addSceneObject(
    locationId: string,
    object: LocationSceneObject,
  ): { success: boolean; errorReason?: string; object?: LocationSceneObject } {
    const node = this.nodes.get(locationId);
    if (!node) return { success: false, errorReason: `Geography node '${locationId}' not found.` };
    if (!object || !object.id || !object.name) {
      return { success: false, errorReason: 'A scene object requires an id and name.' };
    }
    const sceneObjects = Array.isArray(node.sceneObjects) ? node.sceneObjects : [];
    if (sceneObjects.some((candidate) => candidate.id === object.id)) {
      return { success: false, errorReason: `Scene object '${object.id}' already exists at '${locationId}'.` };
    }
    node.sceneObjects = [...sceneObjects, JSON.parse(JSON.stringify(object))];
    return { success: true, object: JSON.parse(JSON.stringify(object)) };
  }

  public removeSceneObject(
    locationId: string,
    objectId: string,
  ): { success: boolean; errorReason?: string; object?: LocationSceneObject } {
    const node = this.nodes.get(locationId);
    if (!node) return { success: false, errorReason: `Geography node '${locationId}' not found.` };
    const sceneObjects = Array.isArray(node.sceneObjects) ? node.sceneObjects : [];
    const index = sceneObjects.findIndex((candidate) => candidate.id === objectId);
    if (index < 0) return { success: false, errorReason: `Scene object '${objectId}' not found at '${locationId}'.` };
    const [removed] = sceneObjects.splice(index, 1);
    node.sceneObjects = sceneObjects;
    return { success: true, object: JSON.parse(JSON.stringify(removed)) };
  }

  public patchSceneObject(
    locationId: string,
    objectId: string,
    patch: Partial<Pick<LocationSceneObject, 'visible' | 'interactable' | 'description' | 'name' | 'properties' | 'tags'>>,
  ): { success: boolean; errorReason?: string; object?: LocationSceneObject } {
    const node = this.nodes.get(locationId);
    if (!node) return { success: false, errorReason: `Geography node '${locationId}' not found.` };
    const object = (node.sceneObjects || []).find((candidate) => candidate.id === objectId);
    if (!object) return { success: false, errorReason: `Scene object '${objectId}' not found at '${locationId}'.` };
    if (patch.visible !== undefined) object.visible = Boolean(patch.visible);
    if (patch.interactable !== undefined) object.interactable = Boolean(patch.interactable);
    if (patch.description !== undefined) object.description = String(patch.description);
    if (patch.name !== undefined) object.name = String(patch.name);
    if (patch.properties !== undefined) object.properties = JSON.parse(JSON.stringify(patch.properties));
    if (patch.tags !== undefined) object.tags = [...patch.tags];
    return { success: true, object: JSON.parse(JSON.stringify(object)) };
  }

  public setDiscovered(id: string, discovered: boolean): void {
    const node = this.nodes.get(id);
    if (node) {
      node.discovered = discovered;
    }
  }

  /**
   * Canonical world-effect projection hook.
   * Patches only explicitly supplied node fields so macro effects can change geography
   * without creating a second geography authority.
   */
  public patchNode(
    id: string,
    patch: Partial<Pick<LocationNode, 'accessible' | 'discovered' | 'description' | 'ambientSensory'>>
  ): { success: boolean; errorReason?: string; node?: LocationNode } {
    const node = this.nodes.get(id);
    if (!node) return { success: false, errorReason: `Geography node '${id}' not found.` };
    if (patch.accessible !== undefined) node.accessible = Boolean(patch.accessible);
    if (patch.discovered !== undefined) node.discovered = Boolean(patch.discovered);
    if (patch.description !== undefined) node.description = String(patch.description);
    if (patch.ambientSensory !== undefined) node.ambientSensory = String(patch.ambientSensory);
    return { success: true, node: { ...node } };
  }

  /**
   * Canonical route mutation hook for world-scale effects.
   * Block/unblock state remains owned by GeographyGraph.
   */
  public patchEdge(
    id: string,
    patch: Pick<RouteEdge, 'isBlocked'> & Partial<Pick<RouteEdge, 'blockReason'>>
  ): { success: boolean; errorReason?: string; edge?: RouteEdge } {
    const edge = this.edges.get(id);
    if (!edge) return { success: false, errorReason: `Geography edge '${id}' not found.` };
    edge.isBlocked = Boolean(patch.isBlocked);
    if (patch.blockReason !== undefined) edge.blockReason = String(patch.blockReason);
    if (!edge.isBlocked && patch.blockReason === undefined) delete edge.blockReason;
    return { success: true, edge: { ...edge } };
  }

  public isDiscovered(id: string): boolean {
    return this.nodes.get(id)?.discovered ?? false;
  }

  public getDiscoveredNodes(): LocationNode[] {
    return Array.from(this.nodes.values())
      .filter((n) => n.discovered)
      .map((n) => ({ ...n }));
  }

  public getAllNodes(): LocationNode[] {
    return Array.from(this.nodes.values()).map((n) => ({ ...n }));
  }

  public getAllEdges(): RouteEdge[] {
    return Array.from(this.edges.values()).map((e) => ({ ...e }));
  }

  public exportState(): {
    nodes: LocationNode[];
    edges: RouteEdge[];
  } {
    return JSON.parse(JSON.stringify({
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    }));
  }

  public importState(state: { nodes?: LocationNode[]; edges?: RouteEdge[] }): void {
    if (!state) return;
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();

    if (Array.isArray(state.nodes)) {
      for (const node of state.nodes) {
        this.addNode(node);
      }
    }
    if (Array.isArray(state.edges)) {
      for (const edge of state.edges) {
        this.addEdge(edge);
      }
    }
  }

  public addEdge(edge: RouteEdge): void {
    this.edges.set(edge.id, { ...edge });
    if (!this.adjacency.has(edge.fromLocationId)) {
      this.adjacency.set(edge.fromLocationId, []);
    }
    this.adjacency.get(edge.fromLocationId)!.push(edge.id);
  }

  public getEdge(id: string): RouteEdge | undefined {
    const edge = this.edges.get(id);
    return edge ? { ...edge } : undefined;
  }

  public getOutgoingEdges(locationId: string): RouteEdge[] {
    const edgeIds = this.adjacency.get(locationId) || [];
    return edgeIds
      .map((eid) => this.edges.get(eid)!)
      .filter((e) => e !== undefined)
      .map((e) => ({ ...e }));
  }

  /**
   * Deterministic travel duration calculation
   * DreamBook §338:
   * TRAVEL_DURATION_HOURS = distance / effective_speed * terrain_modifier
   */
  public calculateEdgeDurationSeconds(edge: RouteEdge, mode: TravelMode = 'Foot'): number {
    if (mode === 'Teleport') return 0;

    const baseSpeed = DEFAULT_SPEED_KM_PER_HOUR[mode] || 4.5;
    const terrainMod = TERRAIN_TIME_MODIFIERS[edge.terrain] || 1.0;
    const durationHours = (edge.distanceKm / baseSpeed) * terrainMod;
    return Math.round(durationHours * 3600);
  }

  /**
   * Finds shortest path using Dijkstra algorithm
   */
  public findPath(
    originId: string,
    destinationId: string,
    mode: TravelMode = 'Foot'
  ): {
    found: boolean;
    routeLocationIds: string[];
    edges: RouteEdge[];
    totalDistanceKm: number;
    estimatedDurationSeconds: number;
  } {
    if (originId === destinationId) {
      return {
        found: true,
        routeLocationIds: [originId],
        edges: [],
        totalDistanceKm: 0,
        estimatedDurationSeconds: 0,
      };
    }

    const distances = new Map<string, number>();
    const previous = new Map<string, { nodeId: string; edge: RouteEdge } | null>();
    const unvisited = new Set<string>();

    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, Infinity);
      previous.set(nodeId, null);
      unvisited.add(nodeId);
    }
    distances.set(originId, 0);

    while (unvisited.size > 0) {
      let currentId: string | null = null;
      let minDistance = Infinity;

      for (const nodeId of unvisited) {
        const d = distances.get(nodeId)!;
        if (d < minDistance) {
          minDistance = d;
          currentId = nodeId;
        }
      }

      if (!currentId || minDistance === Infinity) break;
      if (currentId === destinationId) break;

      unvisited.delete(currentId);

      const outgoing = this.getOutgoingEdges(currentId);
      for (const edge of outgoing) {
        if (!edge.allowedModes.includes(mode) || edge.isBlocked) continue;
        if (!unvisited.has(edge.toLocationId)) continue;

        const edgeDuration = this.calculateEdgeDurationSeconds(edge, mode);
        const alt = distances.get(currentId)! + edgeDuration;

        if (alt < distances.get(edge.toLocationId)!) {
          distances.set(edge.toLocationId, alt);
          previous.set(edge.toLocationId, { nodeId: currentId, edge });
        }
      }
    }

    if (distances.get(destinationId) === Infinity) {
      return {
        found: false,
        routeLocationIds: [],
        edges: [],
        totalDistanceKm: 0,
        estimatedDurationSeconds: 0,
      };
    }

    // Reconstruct path
    const pathNodes: string[] = [destinationId];
    const pathEdges: RouteEdge[] = [];
    let curr: string = destinationId;
    let totalKm = 0;
    let totalSec = 0;

    while (curr !== originId) {
      const prevEntry = previous.get(curr);
      if (!prevEntry) break;
      pathNodes.unshift(prevEntry.nodeId);
      pathEdges.unshift(prevEntry.edge);
      totalKm += prevEntry.edge.distanceKm;
      totalSec += this.calculateEdgeDurationSeconds(prevEntry.edge, mode);
      curr = prevEntry.nodeId;
    }

    return {
      found: true,
      routeLocationIds: pathNodes,
      edges: pathEdges,
      totalDistanceKm: totalKm,
      estimatedDurationSeconds: totalSec,
    };
  }

  /**
   * Seeds canonical Dreamville starting locations and bidirectional routes
   */
  private seedDefaultTopology(): void {
    const loc1: LocationNode = {
      provenance: 'authored',
      id: 'loc_whispering_orrery',
      name: 'The Whispering Orrery',
      regionId: 'reg_spire',
      description: 'A colossal bronze astrolabe suspended over a bottomless chasm. Concentric rings hum softly.',
      coordinates: { x: 120, y: 84 },
      accessible: true,
      ambientSensory: 'A faint ozone tang in the air and rhythmic metallic ticking.',
      discovered: true,
      // Authored starter canon carries structured evidence so the opening scene,
      // perception, search and review all resolve against real scene data.
      archetype: 'WORKPLACE',
      tags: ['orrery', 'astronomical', 'citadel', 'archive'],
      sceneObjects: [
        { id: 'obj_orrery_astral_armature', name: 'bronze astral armature', kind: 'STRUCTURE', description: 'A colossal concentric bronze ring assembly, currently motionless.', visible: true, interactable: true, tags: ['armature', 'ring', 'mechanism'], properties: { fixed: true } },
        { id: 'obj_orrery_prism_ring', name: 'resonant prism ring', kind: 'ENVIRONMENTAL_FEATURE', description: 'A faceted prism ring suspended over the chasm, humming softly.', visible: true, interactable: false, tags: ['prism', 'ring', 'light'], properties: { fixed: true } },
        { id: 'obj_orrery_instrument_bench', name: 'instrument bench', kind: 'STRUCTURE', description: 'A narrow bench of brass instruments and reference slates.', visible: true, interactable: true, tags: ['bench', 'instruments', 'work'], properties: { fixed: true } },
        { id: 'obj_orrery_brass_quadrant', name: 'brass quadrant', kind: 'ITEM', description: 'A worn sighting quadrant for reading the ring angles.', visible: true, interactable: true, tags: ['quadrant', 'instrument', 'brass', 'tool'], properties: { takeable: true, itemCategory: 'Tool' } },
        { id: 'obj_orrery_ring_ledger', name: 'ledger of ring harmonics', kind: 'ITEM', description: 'A technician log of prism-ring harmonics and micro-fractures.', visible: true, interactable: true, tags: ['ledger', 'log', 'record', 'book'], properties: { takeable: true, itemCategory: 'Document' } },
      ],
      environment: {
        terrain: 'Stone',
        lighting: 'DIM',
        weatherExposure: 'SHELTERED',
        features: ['bronze astral armature', 'resonant prism ring', 'instrument bench'],
        ambientActivity: 'Archive technicians move between the armature and the instrument bench.',
      },
      population: {
        status: 'INHABITED',
        expectedPopulation: 'SPARSE',
        explanation: 'A staffed astronomical chamber inside the citadel.',
        provenance: 'AUTHORED',
      },
    };

    const loc2: LocationNode = {
      provenance: 'authored',
      id: 'loc_lantern_vault',
      name: 'The Lantern Vault',
      regionId: 'reg_bastion',
      description: 'Catacombs lined with glass vessels containing eternal phosphoric tallow.',
      coordinates: { x: 80, y: 210 },
      accessible: true,
      ambientSensory: 'Slow drips of mineral water and a sulfurous warmth.',
      discovered: true,
      archetype: 'RESTRICTED_SITE',
      tags: ['vault', 'restricted', 'catacombs', 'archive'],
      sceneObjects: [
        { id: 'obj_vault_lantern_alcove', name: 'sealed lantern alcove', kind: 'STRUCTURE', description: 'A recessed alcove behind a wax-sealed grille.', visible: true, interactable: true, tags: ['alcove', 'lantern', 'seal'], properties: { fixed: true, locked: true, keyTag: 'vault_seal' } },
        { id: 'obj_vault_tallow_vessel', name: 'glass tallow vessel', kind: 'ITEM', description: 'A stoppered glass vessel of eternal phosphoric tallow.', visible: true, interactable: true, tags: ['vessel', 'glass', 'tallow', 'lamp'], properties: { takeable: true, itemCategory: 'Material' } },
        { id: 'obj_vault_warden_desk', name: "warden's duty desk", kind: 'STRUCTURE', description: 'A narrow desk holding the vault access register.', visible: true, interactable: true, tags: ['desk', 'register', 'access'], properties: { fixed: true } },
        { id: 'obj_vault_mineral_channel', name: 'mineral seep channel', kind: 'ENVIRONMENTAL_FEATURE', description: 'A cut channel carrying mineral water toward a floor drain.', visible: true, interactable: false, tags: ['channel', 'drain', 'water'], properties: { fixed: true } },
      ],
      environment: {
        terrain: 'Stone',
        lighting: 'DARK',
        weatherExposure: 'SHELTERED',
        features: ['sealed lantern alcove', "warden's duty desk", 'mineral seep channel'],
        water: { present: true, drainage: true, description: 'Mineral water drips into a shallow cut drainage channel.' },
      },
      population: {
        status: 'RESTRICTED',
        expectedPopulation: 'NONE',
        accessControlled: true,
        explanation: 'A guarded memorial vault; entry and removal require authorization.',
        provenance: 'AUTHORED',
      },
    };

    const loc3: LocationNode = {
      provenance: 'authored',
      id: 'loc_glasswood_verge',
      name: 'Glasswood Verge',
      regionId: 'reg_basin',
      description: 'A petrified woodland where calcified branches chime in the gale.',
      coordinates: { x: 260, y: 140 },
      accessible: false,
      ambientSensory: 'High-pitched crystalline ringing and brittle wind gusts.',
      discovered: true,
      archetype: 'WILDERNESS',
      tags: ['woodland', 'calcified', 'wilderness'],
      sceneObjects: [
        { id: 'obj_glasswood_calcified_branch', name: 'calcified branch', kind: 'ITEM', description: 'A brittle branch of petrified wood, snapped free by the wind.', visible: true, interactable: true, tags: ['branch', 'stick', 'wood', 'calcified'], properties: { takeable: true, itemCategory: 'Material' } },
        { id: 'obj_glasswood_petrified_trunk', name: 'petrified trunk', kind: 'STRUCTURE', description: 'A standing trunk of glassy, calcified wood.', visible: true, interactable: false, tags: ['trunk', 'tree', 'petrified'], properties: { fixed: true } },
        { id: 'obj_glasswood_chime_thicket', name: 'chime-bark thicket', kind: 'ENVIRONMENTAL_FEATURE', description: 'Dense bark that rings against itself in the gale.', visible: true, interactable: false, tags: ['thicket', 'bark', 'wind'], properties: { fixed: true } },
      ],
      environment: {
        terrain: 'Forest',
        lighting: 'NATURAL',
        weatherExposure: 'EXPOSED',
        features: ['petrified trunk', 'chime-bark thicket'],
      },
      // Occupancy of the verge is not established by canon; unknown must stay
      // unknown rather than being asserted as empty or populated.
      population: { status: 'UNKNOWN', provenance: 'AUTHORED' },
    };

    const loc4: LocationNode = {
      provenance: 'authored',
      id: 'loc_sunken_scriptorium',
      name: 'Sunken Scriptorium',
      regionId: 'reg_trenches',
      description: 'Ancient archives submerged beneath dark brackish pools. Vellum cases float in sealed reed baskets.',
      coordinates: { x: 190, y: 310 },
      accessible: false,
      ambientSensory: 'Smell of wet vellum, cedar resin, and still black water.',
      discovered: false,
      archetype: 'ABANDONED_SITE',
      tags: ['archive', 'submerged', 'abandoned'],
      sceneObjects: [
        { id: 'obj_scriptorium_vellum_case', name: 'sealed vellum case', kind: 'ITEM', description: 'A reed-sealed case of vellum folios, floating in its basket.', visible: true, interactable: true, tags: ['vellum', 'case', 'archive', 'document'], properties: { takeable: true, itemCategory: 'Document' } },
        { id: 'obj_scriptorium_basket', name: 'reed float basket', kind: 'STRUCTURE', description: 'A woven basket that keeps one case above the waterline.', visible: true, interactable: true, tags: ['basket', 'reed', 'float'], properties: { fixed: true } },
        { id: 'obj_scriptorium_pool', name: 'brackish pool', kind: 'ENVIRONMENTAL_FEATURE', description: 'Still black water covering the archive floor.', visible: true, interactable: false, tags: ['pool', 'water', 'brackish'], properties: { fixed: true } },
      ],
      environment: {
        terrain: 'Swamp',
        lighting: 'DARK',
        weatherExposure: 'SHELTERED',
        features: ['reed float basket', 'brackish pool', 'flooded archive shelves'],
        water: { present: true, drainage: false, description: 'Brackish runoff stands over the archive floor; the outlet is blocked.' },
      },
      population: {
        status: 'ABANDONED',
        expectedPopulation: 'NONE',
        explanation: 'Evacuated and sealed after the brackish tunnel flooded the archive.',
        provenance: 'AUTHORED',
      },
    };

    this.addNode(loc1);
    this.addNode(loc2);
    this.addNode(loc3);
    this.addNode(loc4);

    // Add bidirectional edges
    this.addEdge({
      provenance: 'authored',
      id: 'edge_orrery_to_vault',
      fromLocationId: 'loc_whispering_orrery',
      toLocationId: 'loc_lantern_vault',
      distanceKm: 8.5,
      terrain: 'Trail',
      allowedModes: ['Foot', 'Horse'],
      hazardRisk: 0.1,
      isBlocked: false,
    });

    this.addEdge({
      provenance: 'authored',
      id: 'edge_vault_to_orrery',
      fromLocationId: 'loc_lantern_vault',
      toLocationId: 'loc_whispering_orrery',
      distanceKm: 8.5,
      terrain: 'Trail',
      allowedModes: ['Foot', 'Horse'],
      hazardRisk: 0.1,
      isBlocked: false,
    });

    this.addEdge({
      provenance: 'authored',
      id: 'edge_orrery_to_glasswood',
      fromLocationId: 'loc_whispering_orrery',
      toLocationId: 'loc_glasswood_verge',
      distanceKm: 15.2,
      terrain: 'Forest',
      allowedModes: ['Foot', 'Horse', 'Coach'],
      hazardRisk: 0.35,
      isBlocked: true,
      blockReason: 'Chancery Border Edict requires signed wax transit seal.',
    });

    this.addEdge({
      provenance: 'authored',
      id: 'edge_glasswood_to_orrery',
      fromLocationId: 'loc_glasswood_verge',
      toLocationId: 'loc_whispering_orrery',
      distanceKm: 15.2,
      terrain: 'Forest',
      allowedModes: ['Foot', 'Horse', 'Coach'],
      hazardRisk: 0.35,
      isBlocked: false,
    });

    this.addEdge({
      provenance: 'authored',
      id: 'edge_vault_to_scriptorium',
      fromLocationId: 'loc_lantern_vault',
      toLocationId: 'loc_sunken_scriptorium',
      distanceKm: 22.0,
      terrain: 'Swamp',
      allowedModes: ['Foot', 'Boat'],
      hazardRisk: 0.6,
      isBlocked: true,
      blockReason: 'Submerged tunnel flooded with brackish runoff.',
    });
  }
}
