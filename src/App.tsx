import { AudioHapticProvider } from './components/AudioHapticManager';
import { SensoryEventProcessor } from './components/SensoryEventProcessor';
import React, { useState, useEffect } from 'react';
import {
  ExternalViewState,
  DialogueChoice,
  Item,
  ActionRequest,
  ActionResult,
  ChronicleEntry,
  NpcDossier,
  CraftingRecipe,
} from './types';
import { apiClient } from './services/apiClient';
import { Header } from './components/Header';
import { StoryView } from './components/StoryView';
import { CharacterDossier } from './components/CharacterDossier';
import { InventoryView } from './components/InventoryView';
import { PowerWorkstation } from './components/PowerWorkstation';
import { TacticalCombatView } from './components/TacticalCombatView';
import { WorldMapView } from './components/WorldMapView';
import { ChronicleView } from './components/ChronicleView';
import { EpistemicInspectorModal } from './components/EpistemicInspectorModal';
import { ContextInspectorModal } from './components/ContextInspectorModal';
import { ArchiveModal } from './components/ArchiveModal';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  PowerState,
  CapabilityDefinition,
  CapabilityGraphNode,
} from './types';

export const App: React.FC = () => {
  // Pure presentation state received from the server authority over HTTP
  const [viewState, setViewState] = useState<ExternalViewState | null>(null);
  const [chronicleEntries, setChronicleEntries] = useState<ChronicleEntry[]>([]);
  const [dossiers, setDossiers] = useState<NpcDossier[]>([]);
  const [recipes, setRecipes] = useState<CraftingRecipe[]>([]);
  const [powerState, setPowerState] = useState<PowerState | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityDefinition[]>([]);
  const [capabilityGraph, setCapabilityGraph] = useState<CapabilityGraphNode[]>([]);
  const [isLoadingInitialState, setIsLoadingInitialState] = useState<boolean>(true);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    'story' | 'characters' | 'inventory' | 'capabilities' | 'combat' | 'map' | 'chronicle'
  >('story');
  const [isEpistemicModalOpen, setIsEpistemicModalOpen] = useState<boolean>(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState<boolean>(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState<boolean>(false);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const fetchAuxiliaryData = async () => {
    try {
      const [chronicleData, dossierData, recipeData, capData] = await Promise.all([
        apiClient.getChronicle().catch(() => []),
        apiClient.getDossiers().catch(() => []),
        apiClient.getRecipes().catch(() => []),
        apiClient.getCapabilities().catch(() => null),
      ]);
      setChronicleEntries(chronicleData);
      setDossiers(dossierData);
      setRecipes(recipeData);
      if (capData) {
        setPowerState(capData.powerState || null);
        setCapabilities(capData.capabilities || []);
        setCapabilityGraph(capData.graph || []);
      }
    } catch (e) {
      console.error('Failed to fetch auxiliary chronicle/dossier/capabilities data:', e);
    }
  };

  const fetchInitialState = async () => {
    setIsLoadingInitialState(true);
    setNetworkError(null);
    try {
      const [state, chronicleData, dossierData, recipeData, capData] = await Promise.all([
        apiClient.getGameState(),
        apiClient.getChronicle().catch(() => []),
        apiClient.getDossiers().catch(() => []),
        apiClient.getRecipes().catch(() => []),
        apiClient.getCapabilities().catch(() => null),
      ]);
      setViewState(state);
      setChronicleEntries(chronicleData);
      setDossiers(dossierData);
      setRecipes(recipeData);
      if (capData) {
        setPowerState(capData.powerState || null);
        setCapabilities(capData.capabilities || []);
        setCapabilityGraph(capData.graph || []);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect to server authority.';
      setNetworkError(message);
    } finally {
      setIsLoadingInitialState(false);
    }
  };

  useEffect(() => {
    fetchInitialState();
  }, []);

  /**
   * Dispatches an ActionRequest across the HTTP boundary to POST /api/game/action.
   * The client does not calculate outcomes; it renders the server-returned ExternalViewState.
   */
  const dispatchAction = async (
    action: ActionRequest,
    onComplete?: (result: ActionResult) => void
  ) => {
    setIsProcessingAction(true);
    try {
      const result = await apiClient.sendAction(action);
      setViewState(result.viewState);
      fetchAuxiliaryData();
      if (onComplete) {
        onComplete(result);
      }
    } catch (err: unknown) {
      console.error('Server action failed:', err);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleSelectChoice = (choice: DialogueChoice) => {
    dispatchAction({
      type: 'DIALOGUE_CHOICE',
      choiceId: choice.id,
      targetNodeId: choice.targetNodeId,
      intent: choice.intent,
      label: choice.label,
    });
  };

  const handleRequestTravel = (targetLocationId: string) => {
    dispatchAction(
      {
        type: 'TRAVEL_REQUEST',
        targetLocationId,
      },
      (res) => {
        if (res.success) {
          setActiveTab('story');
        }
      }
    );
  };

  const handleCancelTravel = () => {
    dispatchAction({
      type: 'CANCEL_TRAVEL',
    });
  };

  const handleEquipItem = (item: Item, targetSlot?: string) => {
    const slot = targetSlot || item.equippableSlot;
    if (!slot) return;
    dispatchAction({
      type: 'EQUIP_REQUEST',
      itemId: item.id,
      slot,
    });
  };

  const handleUnequipSlot = (slot: string) => {
    dispatchAction({
      type: 'UNEQUIP_REQUEST',
      slot,
    });
  };

  const handleInspectItem = (item: Item) => {
    dispatchAction({
      type: 'INSPECT_ITEM',
      itemId: item.id,
    });
  };

  const handleCraftRecipe = async (recipeId: string) => {
    setIsProcessingAction(true);
    try {
      await apiClient.craftItem(recipeId);
      const updatedState = await apiClient.getGameState();
      setViewState(updatedState);
      fetchAuxiliaryData();
    } catch (err: unknown) {
      console.error('Crafting failed:', err);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleRepairItem = async (itemId: string) => {
    setIsProcessingAction(true);
    try {
      await apiClient.repairItem(itemId, 50);
      const updatedState = await apiClient.getGameState();
      setViewState(updatedState);
      fetchAuxiliaryData();
    } catch (err: unknown) {
      console.error('Repair failed:', err);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleInspectSurroundings = () => {
    dispatchAction({
      type: 'INSPECT_SURROUNDINGS',
    });
  };

  const handleAdvanceCycle = () => {
    dispatchAction({
      type: 'ADVANCE_CYCLE',
    });
  };

  const handleEngageDialogue = (characterId: string) => {
    dispatchAction(
      {
        type: 'ENGAGE_DIALOGUE',
        characterId,
      },
      (res) => {
        if (res.success) {
          setActiveTab('story');
        }
      }
    );
  };

  // Loading initial state across the HTTP boundary
  if (isLoadingInitialState) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center font-sans p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <div className="space-y-1">
            <h2 className="font-serif text-lg font-bold text-stone-100">
              Connecting to Server Authority
            </h2>
            <p className="text-xs text-stone-400 font-mono">
              Querying GET /api/game/state across boundary...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Network connection failure
  if (networkError || !viewState) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center font-sans p-4">
        <div className="bg-stone-900 border border-red-900/50 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <div className="space-y-1">
            <h2 className="font-serif text-lg font-bold text-stone-100">
              Authority Connection Failed
            </h2>
            <p className="text-xs text-red-300 font-mono">
              {networkError || 'Unable to establish session with server authority.'}
            </p>
          </div>
          <button
            onClick={fetchInitialState}
            className="inline-flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 rounded-xl text-xs font-medium transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const activeLocation =
    viewState.activeLocation ||
    viewState.locations[viewState.activeLocationId] ||
    Object.values(viewState.locations)[0];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans">
      <Header
        worldTime={viewState.worldTime}
        activeLocation={activeLocation}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenEpistemicModal={() => setIsEpistemicModalOpen(true)}
        onOpenContextModal={() => setIsContextModalOpen(true)}
        onOpenArchiveModal={() => setIsArchiveModalOpen(true)}
        pendingRequestsCount={isProcessingAction ? 1 : 0}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {activeTab === 'story' && (
          <StoryView
            location={activeLocation}
            activeDialogue={viewState.activeDialogue}
            dialogueHistory={viewState.dialogueHistory}
            onSelectChoice={handleSelectChoice}
            onRequestInspect={handleInspectSurroundings}
            onRequestRest={handleAdvanceCycle}
            isProcessingAction={isProcessingAction}
          />
        )}

        {activeTab === 'characters' && (
          <CharacterDossier
            characters={viewState.characters}
            activeLocationId={viewState.activeLocationId}
            locations={viewState.locations}
            onEngageDialogue={handleEngageDialogue}
            dossiers={dossiers}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            inventory={viewState.inventory}
            equipment={viewState.equipment}
            onEquipItem={handleEquipItem}
            onUnequipSlot={handleUnequipSlot}
            onInspectItem={handleInspectItem}
            recipes={recipes}
            onCraftRecipe={handleCraftRecipe}
            onRepairItem={handleRepairItem}
            isProcessingAction={isProcessingAction}
          />
        )}

        {activeTab === 'capabilities' && (
          <PowerWorkstation
            powerState={powerState}
            capabilities={capabilities}
            graph={capabilityGraph}
            onRefresh={fetchAuxiliaryData}
          />
        )}

        {activeTab === 'combat' && (
          <TacticalCombatView onRefreshWorldState={fetchAuxiliaryData} />
        )}

        {activeTab === 'map' && (
          <WorldMapView
            locations={viewState.locations}
            activeLocationId={viewState.activeLocationId}
            activeJourney={viewState.activeJourney}
            isTraveling={viewState.isTraveling}
            onRequestTravel={handleRequestTravel}
            onCancelTravel={handleCancelTravel}
            isProcessingAction={isProcessingAction}
          />
        )}

        {activeTab === 'chronicle' && (
          <ChronicleView
            knowledgeBase={viewState.knowledgeBase}
            actionHistory={viewState.actionHistory}
            engineContractVersion={viewState.engineContractVersion}
            chronicleEntries={chronicleEntries}
          />
        )}
      </main>

      {/* Footer explaining relationship to core engine */}
      <footer className="border-t border-stone-850 bg-stone-900/50 py-4 px-4 text-center text-xs text-stone-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Dreamville External Client • HTTP API Presentation Layer
          </span>
          <span>
            Server Authority: Node.js Express Runtime • In-Memory Single Instance
          </span>
        </div>
      </footer>

      {/* Epistemic Separation Inspector Modal */}
      <EpistemicInspectorModal
        isOpen={isEpistemicModalOpen}
        onClose={() => setIsEpistemicModalOpen(false)}
      />

      {/* CH11 Working Context & Token Budgeting Inspector Modal */}
      <ContextInspectorModal
        isOpen={isContextModalOpen}
        onClose={() => setIsContextModalOpen(false)}
      />

      {/* CH13 Lossless Campaign Archive Modal */}
      <ArchiveModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        onRestoreSuccess={() => fetchInitialState()}
      />
    </div>
  );
};
