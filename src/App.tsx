import React, { useState } from 'react';
import { ExternalViewState, DialogueChoice, Item, ActionRequest, ActionResult } from './types';
import { mockEngineAdapter } from './services/MockEngineAdapter';
import { Header } from './components/Header';
import { StoryView } from './components/StoryView';
import { CharacterDossier } from './components/CharacterDossier';
import { InventoryView } from './components/InventoryView';
import { WorldMapView } from './components/WorldMapView';
import { ChronicleView } from './components/ChronicleView';
import { EpistemicInspectorModal } from './components/EpistemicInspectorModal';

export const App: React.FC = () => {
  // Downstream presentation state received from the authoritative engine adapter
  const [viewState, setViewState] = useState<ExternalViewState>(() =>
    mockEngineAdapter.getInitialViewState()
  );
  const [activeTab, setActiveTab] = useState<'story' | 'characters' | 'inventory' | 'map' | 'chronicle'>('story');
  const [isEpistemicModalOpen, setIsEpistemicModalOpen] = useState<boolean>(false);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const activeLocation =
    viewState.activeLocation ||
    viewState.locations[viewState.activeLocationId] ||
    Object.values(viewState.locations)[0];

  /**
   * Dispatches an ActionRequest to the mock engine adapter.
   * The client does not decide outcome; it receives and renders the authoritative result.
   */
  const dispatchAction = async (
    action: ActionRequest,
    onComplete?: (result: ActionResult) => void
  ) => {
    setIsProcessingAction(true);
    try {
      const result = await mockEngineAdapter.processAction(action);
      setViewState(result.viewState);
      if (onComplete) {
        onComplete(result);
      }
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

  const handleEquipItem = (item: Item) => {
    if (!item.equippableSlot) return;
    dispatchAction({
      type: 'EQUIP_REQUEST',
      itemId: item.id,
      slot: item.equippableSlot,
    });
  };

  const handleUnequipSlot = (slot: 'Head' | 'Cloak' | 'Hands' | 'Relic' | 'Footwear') => {
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

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans">
      <Header
        worldTime={viewState.worldTime}
        activeLocation={activeLocation}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenEpistemicModal={() => setIsEpistemicModalOpen(true)}
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
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            inventory={viewState.inventory}
            equipment={viewState.equipment}
            onEquipItem={handleEquipItem}
            onUnequipSlot={handleUnequipSlot}
            onInspectItem={handleInspectItem}
            isProcessingAction={isProcessingAction}
          />
        )}

        {activeTab === 'map' && (
          <WorldMapView
            locations={viewState.locations}
            activeLocationId={viewState.activeLocationId}
            onRequestTravel={handleRequestTravel}
            isProcessingAction={isProcessingAction}
          />
        )}

        {activeTab === 'chronicle' && (
          <ChronicleView
            knowledgeBase={viewState.knowledgeBase}
            actionHistory={viewState.actionHistory}
            engineContractVersion={viewState.engineContractVersion}
          />
        )}
      </main>

      {/* Footer explaining relationship to core engine */}
      <footer className="border-t border-stone-850 bg-stone-900/50 py-4 px-4 text-center text-xs text-stone-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Dreamville External Client • Downstream Presentation Layer
          </span>
          <span>
            Authoritative deterministic core maintained separately via MockEngineAdapter
          </span>
        </div>
      </footer>

      {/* Epistemic Separation Inspector Modal */}
      <EpistemicInspectorModal
        isOpen={isEpistemicModalOpen}
        onClose={() => setIsEpistemicModalOpen(false)}
      />
    </div>
  );
};
