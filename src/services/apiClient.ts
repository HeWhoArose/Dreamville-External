import {
  ExternalViewState,
  ActionRequest,
  ActionResult,
  BoundaryAuditDiagnostics,
  ChronicleEntry,
  NpcDossier,
  InventoryStateResponse,
  CraftingRecipe,
} from '../types';

/**
 * apiClient
 *
 * Provides a minimal, clean HTTP boundary between the React presentation client
 * and the server-side mock engine authority.
 *
 * The browser client:
 * - NEVER holds canonical EngineState.
 * - NEVER accesses hidden canonical secrets.
 * - Simply issues HTTP requests to the server and receives sanitized ExternalViewState.
 */
class ApiClient {
  private baseUrl = '/api/game';

  /**
   * Fetches initial or refreshed ExternalViewState from the server authority.
   * GET /api/game/state
   */
  public async getGameState(): Promise<ExternalViewState> {
    const res = await fetch(`${this.baseUrl}/state`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch game state: HTTP ${res.status}`);
    }

    return (await res.json()) as ExternalViewState;
  }

  /**
   * Submits an ActionRequest to the server authority for deterministic processing.
   * POST /api/game/action
   */
  public async sendAction(action: ActionRequest): Promise<ActionResult> {
    const res = await fetch(`${this.baseUrl}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(action),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(
        errorData?.error || `Action submission failed with HTTP ${res.status}`
      );
    }

    return (await res.json()) as ActionResult;
  }

  /**
   * Fetches non-sensitive boundary diagnostics from the server.
   * GET /api/game/epistemic-status
   */
  public async getEpistemicStatus(): Promise<BoundaryAuditDiagnostics> {
    const res = await fetch(`${this.baseUrl}/epistemic-status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch epistemic diagnostics: HTTP ${res.status}`);
    }

    return (await res.json()) as BoundaryAuditDiagnostics;
  }

  /**
   * Fetches epistemically projected chronicle entries from the server.
   * GET /api/game/chronicle
   */
  public async getChronicle(): Promise<ChronicleEntry[]> {
    const res = await fetch(`${this.baseUrl}/chronicle`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch chronicle: HTTP ${res.status}`);
    }

    return (await res.json()) as ChronicleEntry[];
  }

  /**
   * Fetches epistemically projected NPC dossiers from the server.
   * GET /api/game/dossiers
   */
  public async getDossiers(): Promise<NpcDossier[]> {
    const res = await fetch(`${this.baseUrl}/dossiers`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch dossiers: HTTP ${res.status}`);
    }

    return (await res.json()) as NpcDossier[];
  }

  /**
   * Fetches a specific epistemically projected subject dossier from the server.
   * GET /api/game/dossiers/:subjectId
   */
  public async getDossier(subjectId: string): Promise<NpcDossier | null> {
    const res = await fetch(`${this.baseUrl}/dossiers/${encodeURIComponent(subjectId)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch dossier for ${subjectId}: HTTP ${res.status}`);
    }

    return (await res.json()) as NpcDossier;
  }

  /**
   * Fetches canonical player inventory and 13-slot paper-doll equipment (CH5).
   * GET /api/game/inventory
   */
  public async getInventory(): Promise<InventoryStateResponse> {
    const res = await fetch(`${this.baseUrl}/inventory`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch inventory: HTTP ${res.status}`);
    }

    return (await res.json()) as InventoryStateResponse;
  }

  /**
   * Equips an item to a slot with server authority checks (CH5).
   * POST /api/game/inventory/equip
   */
  public async equipItem(itemId: string, slot: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/inventory/equip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ itemId, slot }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Equip failed with HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Unequips an item from a slot (CH5).
   * POST /api/game/inventory/unequip
   */
  public async unequipItem(slot: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/inventory/unequip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ slot }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Unequip failed with HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Fetches available crafting recipes (CH5).
   * GET /api/game/inventory/recipes
   */
  public async getRecipes(): Promise<CraftingRecipe[]> {
    const res = await fetch(`${this.baseUrl}/inventory/recipes`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch crafting recipes: HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.recipes || [];
  }

  /**
   * Executes crafting recipe with deterministic material consumption (CH5).
   * POST /api/game/inventory/craft
   */
  public async craftItem(recipeId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/inventory/craft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ recipeId }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Crafting failed with HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Repairs an item's durability and clears broken state (CH5).
   * POST /api/game/inventory/repair
   */
  public async repairItem(itemId: string, repairAmount?: number): Promise<any> {
    const res = await fetch(`${this.baseUrl}/inventory/repair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ itemId, repairAmount }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Repair failed with HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Fetches power state, registered capabilities, and DAG graph (CH6).
   * GET /api/game/capabilities
   */
  public async getCapabilities(): Promise<{
    actorId: string;
    powerState?: any;
    capabilities: any[];
    graph: any[];
  }> {
    const res = await fetch(`${this.baseUrl}/capabilities`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch capabilities: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Submits a capability adjudication proposal for deterministic resolution (CH6).
   * POST /api/game/capabilities/adjudicate
   */
  public async adjudicateCapability(params: {
    intendedCapabilityId: string;
    requestedScale?: string;
    actionDescription?: string;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/capabilities/adjudicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.rejectionReason || errorData?.error || `Adjudication failed with HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Custom Power Synthesis converting concepts into structured capabilities (CH7/CH6).
   * POST /api/game/capabilities/synthesize
   */
  public async synthesizePower(params: {
    conceptName: string;
    description: string;
    tags?: string[];
    powerTier?: 'Minor' | 'Moderate' | 'Major' | 'WorldScale';
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/capabilities/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Synthesis failed with HTTP ${res.status}`);
    }

    return await res.json();
  }

  // ==========================================
  // CH8: Tactical Combat & D&D Ruleset Adapter
  // ==========================================

  /**
   * Starts a new combat encounter or resets current encounter (CH8).
   * POST /api/game/combat/encounter/start
   */
  public async startCombatEncounter(): Promise<{ success: boolean; combatState: import('../types').CombatStateResponse }> {
    const res = await fetch(`${this.baseUrl}/combat/encounter/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || `Failed to start encounter: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Fetches current server-authoritative combat state (CH8).
   * GET /api/game/combat/state
   */
  public async getCombatState(): Promise<import('../types').CombatStateResponse> {
    const res = await fetch(`${this.baseUrl}/combat/state`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || `Failed to fetch combat state: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Moves an actor within their speed allowance (CH8).
   * POST /api/game/combat/move
   */
  public async moveCombatActor(params: {
    actorId?: string;
    targetX: number;
    targetY: number;
  }): Promise<{ success: boolean; errorReason?: string; combatState: import('../types').CombatStateResponse }> {
    const res = await fetch(`${this.baseUrl}/combat/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Movement failed with HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Resolves D&D SRD 5.2.1 attack against target (CH8).
   * POST /api/game/combat/attack
   */
  public async executeCombatAttack(params: {
    attackerId?: string;
    targetId: string;
  }): Promise<import('../types').CombatActionResponse> {
    const res = await fetch(`${this.baseUrl}/combat/attack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Attack failed with HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Adjudicates and executes capability cast in tactical combat (CH8/CH6).
   * POST /api/game/combat/cast
   */
  public async castCombatCapability(params: {
    actorId?: string;
    targetId: string;
    capabilityId: string;
    requestedScale?: string;
  }): Promise<import('../types').CombatActionResponse> {
    const res = await fetch(`${this.baseUrl}/combat/cast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Combat cast failed with HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Advances turn and processes dynamic hazards (CH8).
   * POST /api/game/combat/end-turn
   */
  public async endCombatTurn(): Promise<{
    success: boolean;
    advanceResult: any;
    combatState: import('../types').CombatStateResponse;
  }> {
    const res = await fetch(`${this.baseUrl}/combat/end-turn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || `Failed to end turn: HTTP ${res.status}`);
    }

    return await res.json();
  }

  // ==========================================
  // CH9: Memory Opportunity Engine & Epistemic Retrieval (DEF-CH9-06)
  // ==========================================

  /**
   * Fetches visible memories for active actor (CH9).
   * GET /api/game/memories
   */
  public async getMemories(actorId?: string): Promise<import('../types').MemoryRetrievalResponse> {
    const url = actorId ? `${this.baseUrl}/memories?actorId=${encodeURIComponent(actorId)}` : `${this.baseUrl}/memories`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch memories: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Queries contextually scored memories with epistemic visibility (CH9).
   * POST /api/game/memories/query
   */
  public async queryMemories(params: {
    actorId?: string;
    queryKeywords?: string[];
    maxResults?: number;
    currentTurn?: number;
    includeDormant?: boolean;
    includeArchived?: boolean;
  }): Promise<import('../types').MemoryRetrievalResponse> {
    const res = await fetch(`${this.baseUrl}/memories/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(`Failed to query memories: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Scans action text for latent capability opportunities (CH9).
   * POST /api/game/memories/opportunities
   */
  public async scanOpportunities(params: {
    actorId?: string;
    actionText: string;
    targetEntityId?: string;
    currentTurn?: number;
  }): Promise<import('../types').OpportunityScanResponse> {
    const res = await fetch(`${this.baseUrl}/memories/opportunities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Opportunity scan failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Stores a validated atomic memory record (CH9).
   * POST /api/game/memories/store
   */
  public async storeMemory(memory: Partial<import('../types').DurableMemory>): Promise<import('../types').MemoryStoreResponse> {
    const res = await fetch(`${this.baseUrl}/memories/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ memory }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Store memory failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Explicitly locks a memory against decay or deletion (CH9).
   * POST /api/game/memories/lock
   */
  public async lockMemory(memoryId: string, reason?: string, lockedBy?: string): Promise<import('../types').MemoryLockResponse> {
    const res = await fetch(`${this.baseUrl}/memories/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ memoryId, reason, lockedBy }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Lock memory failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Unlocks a memory (CH9).
   * POST /api/game/memories/unlock
   */
  public async unlockMemory(memoryId: string): Promise<import('../types').MemoryLockResponse> {
    const res = await fetch(`${this.baseUrl}/memories/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ memoryId }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Unlock memory failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Advances memory simulation decay (CH9).
   * POST /api/game/memories/decay
   */
  public async decayMemories(params?: {
    currentTurn?: number;
    elapsedSeconds?: number;
    turnDelta?: number;
  }): Promise<import('../types').MemoryDecayResponse> {
    const res = await fetch(`${this.baseUrl}/memories/decay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params || {}),
    });

    if (!res.ok) {
      throw new Error(`Memory decay failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  // ============================================================================
  // CHALLENGE 11: WORKING CONTEXT & TOKEN BUDGETING
  // ============================================================================

  /**
   * Assembles current working context packet and budgeted prompt (CH11).
   * GET /api/game/context
   */
  public async getContext(params?: {
    storyId?: string;
    budget?: number;
    action?: string;
  }): Promise<import('../types').WorkingContextResponse> {
    const query = new URLSearchParams();
    if (params?.storyId) query.set('storyId', params.storyId);
    if (params?.budget) query.set('budget', String(params.budget));
    if (params?.action) query.set('action', params.action);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${this.baseUrl}/context${queryString}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Get working context failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Parametrically assembles budgeted context with custom candidate chunks or action (CH11).
   * POST /api/game/context/assemble
   */
  public async assembleContext(params: {
    storyId?: string;
    playerAction?: string;
    hardTokenBudget?: number;
    customChunks?: import('../types').ContextChunk[];
    npcTargetId?: string;
  }): Promise<import('../types').ContextAssembleResponse> {
    const res = await fetch(`${this.baseUrl}/context/assemble`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(`Assemble working context failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Inspects working context candidate chunks and token budgeting breakdown (CH11).
   * GET /api/game/context/inspect
   */
  public async inspectContext(params?: {
    storyId?: string;
    budget?: number;
  }): Promise<import('../types').ContextInspectionResponse> {
    const query = new URLSearchParams();
    if (params?.storyId) query.set('storyId', params.storyId);
    if (params?.budget) query.set('budget', String(params.budget));

    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${this.baseUrl}/context/inspect${queryString}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Inspect context failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Generates an epistemically sanitized NPC dialogue context prompt (CH11).
   * POST /api/game/context/npc-dialogue
   */
  public async buildNpcDialogueContext(params: {
    npcName: string;
    knownFacts?: string[];
    currentObservations?: string[];
    playerSpokenText?: string;
    systemDirectives?: string[];
  }): Promise<import('../types').NpcDialogueContextResponse> {
    const res = await fetch(`${this.baseUrl}/context/npc-dialogue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(`Build NPC dialogue context failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Challenge 13: Export lossless campaign archive container (.dreamarchive).
   * GET /api/game/archive/export
   */
  public async exportArchive(params?: { storyId?: string; title?: string }): Promise<any> {
    const query = new URLSearchParams();
    if (params?.storyId) query.set('storyId', params.storyId);
    if (params?.title) query.set('title', params.title);

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${this.baseUrl}/archive/export${qs}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Export archive failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Challenge 13: Validate archive integrity and schema without mutating state.
   * POST /api/game/archive/validate
   */
  public async validateArchive(archive: any): Promise<{
    valid: boolean;
    errorReason?: string;
    partitionCount?: number;
    manifest?: any;
  }> {
    const res = await fetch(`${this.baseUrl}/archive/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ archive }),
    });

    return await res.json();
  }

  /**
   * Challenge 13: Restore campaign from archive atomically.
   * POST /api/game/archive/import
   */
  public async importArchive(archive: any, storyId?: string): Promise<{
    success: boolean;
    errorReason?: string;
    campaignId?: string;
  }> {
    const res = await fetch(`${this.baseUrl}/archive/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ archive, storyId }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.errorReason || `Import failed: HTTP ${res.status}`);
    }

    return data;
  }

  /**
   * Challenge 13: Fetch visual asset registry.
   * GET /api/game/archive/assets
   */
  public async getArchiveAssets(): Promise<{ success: boolean; assets: any[] }> {
    const res = await fetch(`${this.baseUrl}/archive/assets`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Get assets failed: HTTP ${res.status}`);
    }

    return await res.json();
  }
}

export const apiClient = new ApiClient();

