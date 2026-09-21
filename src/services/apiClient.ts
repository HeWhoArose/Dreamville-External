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
const originalFetch = typeof window !== 'undefined' ? window.fetch : globalThis.fetch;
let globalActiveStoryId = 'default_story';

const fetch = (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const finalInit = init || {};
  const headers = finalInit.headers ? { ...finalInit.headers } as Record<string, string> : {};
  if (!headers['x-story-id'] && !headers['X-Story-ID']) {
    headers['X-Story-ID'] = globalActiveStoryId;
  }
  finalInit.headers = headers;
  return originalFetch(url, finalInit);
};

class ApiClient {
  private baseUrl = '/api/game';

  public setActiveStoryId(storyId: string): void {
    globalActiveStoryId = storyId;
  }

  /**
   * Fetches initial or refreshed ExternalViewState from the server authority.
   * GET /api/game/state
   */
  public async getGameState(storyId?: string): Promise<ExternalViewState> {
    const url = storyId ? `${this.baseUrl}/state?storyId=${encodeURIComponent(storyId)}` : `${this.baseUrl}/state`;
    const res = await fetch(url, {
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
    targetType?: string;
    rangeScope?: string;
    actionType?: string;
    cooldownTurns?: number;
    durationTurns?: number;
    restrictions?: string[];
    counters?: string[];
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

  /**
   * Freeform Action Interpretation Pipeline (CH7).
   * POST /api/game/capabilities/interpret
   */
  public async interpretAction(params: {
    actionText: string;
    tags?: string[];
    intendedCapabilityId?: string;
    requestedModifiers?: any[];
    requestedScale?: 'Local' | 'Moderate' | 'WorldScale';
    environment?: any;
    actorConditions?: string[];
    executeIfValid?: boolean;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/capabilities/interpret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Action interpretation failed with HTTP ${res.status}`);
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
   * Executes a canonical D&D combat Action such as Dash, Dodge, or Disengage.
   * POST /api/game/combat/action
   */
  public async executeCombatAction(params: {
    actorId?: string;
    action: 'DASH' | 'DODGE' | 'DISENGAGE';
  }): Promise<{
    success: boolean;
    errorReason?: string;
    action?: 'DASH' | 'DODGE' | 'DISENGAGE';
    combatState: import('../types').CombatStateResponse;
  }> {
    const res = await fetch(`${this.baseUrl}/combat/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.errorReason || errorData?.error || `Combat action failed with HTTP ${res.status}`);
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

  /**
   * Challenge 12: List all registered orchestrator models, pools, health, and latency.
   * GET /api/game/orchestrator/models
   */
  public async getProviderCredentialStatus(providerId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/orchestrator/providers/${encodeURIComponent(providerId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to get provider status: HTTP ${res.status}`);
    return await res.json();
  }

  public async saveProviderApiKey(providerId: string, apiKey: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/orchestrator/providers/${encodeURIComponent(providerId)}/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error || `Failed to save provider API key: HTTP ${res.status}`);
    }
    return payload;
  }

  public async getOrchestratorModels(): Promise<{ success: boolean; count: number; models: any[] }> {
    const res = await fetch(`${this.baseUrl}/orchestrator/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to list models: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Select best model for task & preview routing explanation.
   * POST /api/game/orchestrator/select
   */
  public async selectOrchestratorModel(params: {
    task?: string;
    contextTokens?: number;
    userPriorityTier?: string;
  }): Promise<{
    success: boolean;
    task: string;
    selectedModel: any;
    selectionReason: string;
    selectionScore: number;
    fallbacks: any[];
  }> {
    const res = await fetch(`${this.baseUrl}/orchestrator/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error(`Orchestrator select returned non-JSON response (HTTP ${res.status}, ${contentType || 'no content-type'})`);
    }
    if (!res.ok) throw new Error(`Failed to select model: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Execute orchestrated turn with server-authoritative idempotency.
   * POST /api/game/orchestrator/turn
   */
  public async executeOrchestratorTurn(params: {
    storyId?: string;
    playerAction?: string;
    task?: string;
    hardTokenBudget?: number;
    timeoutMs?: number;
    maxRetries?: number;
    forceModelId?: string;
    idempotencyKey?: string;
  }): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }
    const res = await fetch(`${this.baseUrl}/orchestrator/turn`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Turn execution failed: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Challenge 12: Get cross-model continuation checkpoints.
   * GET /api/game/orchestrator/checkpoints
   */
  public async getOrchestratorCheckpoints(storyId?: string): Promise<{
    success: boolean;
    count: number;
    checkpoints: any[];
  }> {
    const url = storyId
      ? `${this.baseUrl}/orchestrator/checkpoints?storyId=${encodeURIComponent(storyId)}`
      : `${this.baseUrl}/orchestrator/checkpoints`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to get checkpoints: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Get last turn telemetry and orchestration stats.
   * GET /api/game/orchestrator/telemetry
   */
  public async getOrchestratorTelemetry(): Promise<{
    success: boolean;
    lastTurnTelemetry: any;
    stats: any;
  }> {
    const res = await fetch(`${this.baseUrl}/orchestrator/telemetry`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to get telemetry: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Update model health / reset circuit breaker.
   * POST /api/game/orchestrator/health
   */
  public async updateModelHealth(params: {
    providerId: string;
    modelId: string;
    health: string;
    resetCircuitBreaker?: boolean;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/orchestrator/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to update model health: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Dynamic model discovery.
   * POST /api/game/orchestrator/discover
   */
  public async discoverOrchestratorModels(forceRefresh = false): Promise<any> {
    const res = await fetch(`${this.baseUrl}/orchestrator/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ forceRefresh }),
    });
    if (!res.ok) throw new Error(`Failed to discover models: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Get manual model overrides.
   * GET /api/game/orchestrator/overrides
   */
  public async getManualOverrides(): Promise<{ success: boolean; overrides: any[] }> {
    const res = await fetch(`${this.baseUrl}/orchestrator/overrides`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to get overrides: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Set manual override.
   * POST /api/game/orchestrator/overrides
   */
  public async setManualOverride(params: { modelId: string; override: any }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/orchestrator/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to set override: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Get current task pins.
   * GET /api/game/orchestrator/pins
   */
  public async getOrchestratorPins(): Promise<{ success: boolean; pins: Record<string, string> }> {
    const res = await fetch(`${this.baseUrl}/orchestrator/pins`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to get orchestrator pins: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Pin model for task.
   * POST /api/game/orchestrator/pin
   */
  public async pinModelForTask(params: { task: string; modelKey?: string }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/orchestrator/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to pin model: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 12: Test model connectivity/readiness.
   * POST /api/game/orchestrator/test-model
   */
  public async testOrchestratorModel(params: { providerId: string; modelId: string }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/orchestrator/test-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to test model: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Get all orchestrator fallback chains.
   * GET /api/game/orchestrator/fallbacks
   */
  public async getOrchestratorFallbacks(): Promise<{ success: boolean; fallbackChains: Record<string, string[]> }> {
    const res = await fetch(`${this.baseUrl}/orchestrator/fallbacks`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to get orchestrator fallbacks: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Set orchestrator fallback chain for a task.
   * POST /api/game/orchestrator/fallback
   */
  public async setOrchestratorFallbackChain(params: { task: string; chain: string[] }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/orchestrator/fallback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to set orchestrator fallback chain: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 15: Run story adaptation pipeline.
   * POST /api/game/adaptation/analyze
   */
  public async analyzeStoryAdaptation(params: {
    storyId: string;
    title: string;
    rawText: string;
    profile?: any;
    options?: any;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/adaptation/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to analyze story adaptation: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 15: Get story adaptation review.
   * GET /api/game/adaptation/:storyId/review
   */
  public async getStoryAdaptationReview(storyId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/adaptation/${storyId}/review`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch story adaptation review: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 15: Resolve conflict in story bible.
   * POST /api/game/adaptation/:storyId/conflicts/:conflictId/resolve
   */
  public async resolveAdaptationConflict(
    storyId: string,
    conflictId: string,
    resolution: string
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/adaptation/${storyId}/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ resolution, userOverride: resolution }),
    });
    if (!res.ok) throw new Error(`Failed to resolve conflict: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 15: Duplicate adaptation branch.
   * POST /api/game/adaptation/:storyId/duplicate-branch
   */
  public async duplicateAdaptationBranch(
    storyId: string,
    newBranchId: string,
    branchTitle?: string
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/adaptation/${storyId}/duplicate-branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ newBranchId, branchTitle }),
    });
    if (!res.ok) throw new Error(`Failed to duplicate adaptation branch: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 15: Get record provenance.
   * GET /api/game/adaptation/:storyId/provenance/:targetId
   */
  public async getRecordProvenance(storyId: string, targetId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/adaptation/${storyId}/provenance/${targetId}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch provenance: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 15: List adapted stories.
   * GET /api/game/adaptation/list
   */
  public async listAdaptedStories(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/adaptation/list`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to list adapted stories: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 15: Get pipeline execution status.
   * GET /api/game/adaptation/:storyId/status
   */
  public async getAdaptationStatus(storyId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/adaptation/${encodeURIComponent(storyId)}/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch adaptation status: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 15: Select active story on server authority.
   * POST /api/game/adaptation/select
   */
  public async selectActiveStory(storyId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/adaptation/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ storyId }),
    });
    if (!res.ok) throw new Error(`Failed to select story: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 17: Get operational Living Bible requirement ledger.
   * GET /api/game/living-bible
   */
  public async getLivingBible(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/living-bible`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch Living Bible: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 17: Get Workstation status and iteration ledger.
   * GET /api/game/workstation
   */
  public async getWorkstationState(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/workstation`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch Workstation state: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Challenge 17: Record a new developer iteration into the Workstation ledger.
   * POST /api/game/workstation/iteration
   */
  public async recordWorkstationIteration(payload: {
    description: string;
    outcome: string;
    reason?: string;
    affectedRequirements?: string[];
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/workstation/iteration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Failed to record iteration: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Challenge 17: Record evidence for a requirement.
   * POST /api/game/living-bible/evidence
   */
  public async recordRequirementEvidence(payload: {
    requirementId: string;
    evidenceType: string;
    sourceReference: string;
    description: string;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/living-bible/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Failed to record evidence: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Challenge 17: Validate and promote a requirement status based on evidence.
   * POST /api/game/living-bible/promote
   */
  public async promoteRequirementStatus(
    requirementId: string,
    targetStatus: string
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/living-bible/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ requirementId, targetStatus }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Failed to promote requirement: HTTP ${res.status}`);
    }
    return await res.json();
  }

  // ==========================================
  // Challenge 16: Worlds & Campaign Discovery
  // ==========================================

  public async getStoryRuns(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/story-runs`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch Story Runs: HTTP ${res.status}`);
    return await res.json();
  }

  public async getWorlds(filters?: any): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.append(k, String(v));
      }
    }
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${this.baseUrl}/worlds${queryStr}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch worlds: HTTP ${res.status}`);
    return await res.json();
  }

  public async saveWorldVisualAsset(worldId: string, asset: {
    imageAsset?: string | null;
    imageMetadata?: any;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/visual-asset`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(asset),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Failed to save world visual asset: HTTP ${res.status}`);
    }
    return await res.json();
  }

  public async getWorldTemplate(worldId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch world template: HTTP ${res.status}`);
    return await res.json();
  }

  public async synthesizeWorld(input: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Failed to synthesize world: HTTP ${res.status}`);
    return await res.json();
  }

  public async startWorldRun(worldId: string, options: {
    confirmedCharacter?: any;
    characterId?: string;
    storyMode?: string;
    dndRulesMode?: string;
    characterName?: string;
    characterRole?: string;
    characterBackground?: string;
    characterAppearance?: string;
    characterPersonality?: string;
    characterMotivations?: string;
    characterEquipment?: string[];
    characterPortraitEmoji?: string;
    characterPortraitUrl?: string;
    capabilities?: any[];
    initialConditions?: string[];
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/start-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Failed to start world run: HTTP ${res.status}`);
    }
    return await res.json();
  }

  public async saveStoryRunVisualAsset(storyId: string, asset: {
    imageAsset?: string | null;
    imageMetadata?: any;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/runs/${encodeURIComponent(storyId)}/visual-asset`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(asset),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || `Failed to save Story Run visual asset: HTTP ${res.status}`);
    }
    return await res.json();
  }

  public async getStoryRun(storyId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/runs/${encodeURIComponent(storyId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to fetch story run: HTTP ${res.status}`);
    return await res.json();
  }

  public async setFaultInjection(mode: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/media/fault-injection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok) throw new Error(`Failed to set fault injection: HTTP ${res.status}`);
    return await res.json();
  }

  public async registerResearchEvidence(item: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/research/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error(`Failed to register research evidence: HTTP ${res.status}`);
    return await res.json();
  }

  public async listResearchEvidence(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/research/evidence`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to list research evidence: HTTP ${res.status}`);
    return await res.json();
  }

  public async adjudicateResearchEvidence(evidenceId: string, adjudicationResult: string, storyId = 'default_story'): Promise<any> {
    const res = await fetch(`${this.baseUrl}/research/adjudicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ evidenceId, adjudicationResult, storyId }),
    });
    if (!res.ok) throw new Error(`Failed to adjudicate research evidence: HTTP ${res.status}`);
    return await res.json();
  }

  // ============================================================
  // Character Creation Slice 2 Methods
  // ============================================================

  public async extractCharacterFromConcept(
    worldId: string,
    naturalLanguageConcept: string,
    existingDraft?: any,
    userEditedFields?: string[],
    narrativeRole?: 'PROTAGONIST' | 'SIDE_CHARACTER' | 'FREE_ROAM',
    allowDeterministicFallback = false
  ): Promise<any> {
    const deterministicFallback = allowDeterministicFallback === true;
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        naturalLanguageConcept,
        existingDraft,
        userEditedFields,
        narrativeRole,
        allowDeterministicFallback: deterministicFallback,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.toLowerCase().includes('application/json');

    if (!res.ok) {
      let payload: any = null;
      if (isJson) {
        try {
          payload = await res.json();
        } catch {
          // Ignore stream parse failure for truncated JSON
        }
      } else {
        const textPreview = (await res.text().catch(() => '')).slice(0, 200);
        const error: any = new Error(
          `API returned non-JSON response (HTTP ${res.status}, ${contentType || 'no content-type'}). Preview: ${textPreview}`
        );
        error.code = 'NON_JSON_RESPONSE';
        throw error;
      }

      const error: any = new Error(
        payload?.error || `Failed to extract character draft: HTTP ${res.status}`
      );
      error.code = payload?.code;
      error.requiresDeterministicConfirmation = payload?.requiresDeterministicConfirmation === true;
      error.reason = payload?.reason;
      throw error;
    }

    if (!isJson) {
      const textPreview = (await res.text().catch(() => '')).slice(0, 200);
      const error: any = new Error(
        `API returned non-JSON response (HTTP ${res.status}, Content-Type: ${contentType || 'none'}). Preview: ${textPreview}`
      );
      error.code = 'UNEXPECTED_HTML_RESPONSE';
      throw error;
    }

    return await res.json();
  }

  public async proposeCustomCapability(
    worldId: string,
    capabilityConcept: string,
    characterContext?: any
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/custom-capability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ capabilityConcept, characterContext }),
    });
    if (!res.ok) throw new Error(`Failed to propose custom capability: HTTP ${res.status}`);
    return await res.json();
  }

  public async proposeCustomFeat(
    worldId: string,
    featName: string,
    featConcept: string,
    characterContext?: any
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/custom-feat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ featName, featConcept, characterContext }),
    });
    if (!res.ok) throw new Error(`Failed to propose custom feat: HTTP ${res.status}`);
    return await res.json();
  }

  public async proposeCustomAttribute(
    worldId: string,
    attributeName: string,
    attributeConcept: string,
    category?: string,
    characterContext?: any
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/custom-attribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ attributeName, attributeConcept, category, characterContext }),
    });
    if (!res.ok) throw new Error(`Failed to propose custom attribute: HTTP ${res.status}`);
    return await res.json();
  }

  public async proposeCustomSkill(
    worldId: string,
    skillName: string,
    skillConcept: string,
    characterContext?: any
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/custom-skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ skillName, skillConcept, characterContext }),
    });
    if (!res.ok) throw new Error(`Failed to propose custom skill: HTTP ${res.status}`);
    return await res.json();
  }

  public async proposeCustomEquipment(
    worldId: string,
    itemName: string,
    itemConcept: string,
    characterContext?: any
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/custom-equipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ itemName, itemConcept, characterContext }),
    });
    if (!res.ok) throw new Error(`Failed to propose custom equipment: HTTP ${res.status}`);
    return await res.json();
  }

  public async getCharacterDrafts(worldId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/drafts`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to get character drafts: HTTP ${res.status}`);
    return await res.json();
  }

  public async saveCharacterDraft(worldId: string, draft: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ draft }),
    });
    if (!res.ok) throw new Error(`Failed to save character draft: HTTP ${res.status}`);
    return await res.json();
  }

  public async confirmCharacter(worldId: string, draft: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ draft }),
    });
    if (!res.ok) throw new Error(`Failed to confirm character: HTTP ${res.status}`);
    return await res.json();
  }

  public async getConfirmedCharacters(worldId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/worlds/${encodeURIComponent(worldId)}/characters/confirmed`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Failed to get confirmed characters: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Retrieves an already generated opening scene for a story run.
   */
  public async getOpeningScene(storyId: string): Promise<{ success: boolean; storyId: string; openingScene: import('../types').OpeningScene }> {
    const res = await fetch(`${this.baseUrl}/story-runs/${encodeURIComponent(storyId)}/opening`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Story-ID': storyId,
      },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || `Failed to fetch opening scene: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Idempotently generates or retrieves the opening scene for a story run.
   */
  public async generateOpeningScene(
    storyId: string,
    options?: { forceRegenerate?: boolean; timeoutMs?: number; simulateFailure?: boolean }
  ): Promise<{ success: boolean; storyId: string; openingScene: import('../types').OpeningScene; viewState?: import('../types').ExternalViewState }> {
    const res = await fetch(`${this.baseUrl}/story-runs/${encodeURIComponent(storyId)}/opening`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Story-ID': storyId,
      },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || `Failed to generate opening scene: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Retrieves the assembled opening working context for a story run.
   */
  public async getOpeningWorkingContext(storyId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/story-runs/${encodeURIComponent(storyId)}/opening/context`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Story-ID': storyId,
      },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || `Failed to fetch opening context: HTTP ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Generates or requests media image via the server's MediaAdapterService.
   */
  public async generateImage(payload: {
    storyId?: string;
    prompt: string;
    assetId?: string;
    aspectRatio?: string;
    tags?: string[];
    slotType?: import('../components/common/imageAssetTypes').ImageAssetSlotType;
  }): Promise<{ success: boolean; imageUrl?: string; isFallback?: boolean; promptFallback?: string; errorReason?: string }> {
    const res = await fetch(`${this.baseUrl}/media/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.errorReason || `Image generation failed: HTTP ${res.status}`);
    }

    return await res.json();
  }
}

export const apiClient = new ApiClient();

