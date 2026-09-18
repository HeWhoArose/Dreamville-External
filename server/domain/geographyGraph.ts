import { LocationNode, RouteEdge, TerrainType, TravelMode } from './types';

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

  constructor() {
    this.seedDefaultTopology();
  }

  public addNode(node: LocationNode): void {
    this.nodes.set(node.id, { ...node });
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, []);
    }
  }

  public getNode(id: string): LocationNode | undefined {
    const node = this.nodes.get(id);
    return node ? { ...node } : undefined;
  }

  public setDiscovered(id: string, discovered: boolean): void {
    const node = this.nodes.get(id);
    if (node) {
      node.discovered = discovered;
    }
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
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    };
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
