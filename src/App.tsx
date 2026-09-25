import React, { useState, useEffect, useRef } from 'react';
import { AppRoute } from './routes';
import { AppShell } from './components/shell/AppShell';
import { StoryContextShell } from './components/storyContext/StoryContextShell';
import { CompendiumView } from './components/compendium/CompendiumView';
import { CompendiumCategory } from './components/compendium/compendiumTypes';
import { SettingsView, SettingsTab } from './components/settings/SettingsView';
import { SplashScreen } from './components/boot/SplashScreen';
import { OnboardingView, ONBOARDING_STORAGE_KEY } from './components/boot/OnboardingView';
import { DashboardView, StorySummary } from './components/dashboard/DashboardView';
import { StoryLibraryView } from './components/library/StoryLibraryView';
import { AudioHapticProvider } from './components/AudioHapticManager';
import { SensoryEventProcessor } from './components/SensoryEventProcessor';
import { StoryCodexView } from './components/StoryCodexView';
import { StoryEvidenceView } from './components/StoryEvidenceView';
import { StoryRelationshipsView } from './components/StoryRelationshipsView';

// Domain views
import { StoryView } from './components/StoryView';
import { CharacterSurface } from './components/CharacterSurface';
import { WorldView } from './components/WorldView';
import { RecentActionsView } from './components/RecentActionsView';
import { InventoryView } from './components/InventoryView';
import { TacticalCombatView } from './components/TacticalCombatView';
import { WorldMapView } from './components/WorldMapView';
import { ChronicleView } from './components/ChronicleView';
import { Phase8WorldWorkbench } from './components/Phase8WorldWorkbench';

// Modals & Workstations
import { AudioSettingsModal } from './components/AudioSettingsModal';
import { VoiceStudioModal } from './components/VoiceStudioModal';
import { ImportStoryModal } from './components/ImportStoryModal';
import { StoryLibraryModal } from './components/StoryLibraryModal';
import { WorldLibraryModal } from './components/WorldLibraryModal';
import { RoutingWorkstationModal } from './components/RoutingWorkstationModal';
import { LivingBibleWorkstationModal } from './components/LivingBibleWorkstationModal';
import { EpistemicInspectorModal } from './components/EpistemicInspectorModal';
import { ContextInspectorModal } from './components/ContextInspectorModal';
import { DeveloperDiagnosticsModal } from './components/DeveloperDiagnosticsModal';
import { ArchiveModal } from './components/ArchiveModal';
import { CreateStoryWizard } from './components/CreateStoryWizard';
import { CharacterGenesisView } from './components/characterGenesis/CharacterGenesisView';

import { apiClient } from './services/apiClient';
import {
  ExternalViewState,
  DialogueChoice,
  Item,
  ActionRequest,
  ActionResult,
  ChronicleEntry,
  NpcDossier,
  CraftingRecipe,
  PowerState,
  CapabilityDefinition,
  CapabilityGraphNode,
  WorldTemplate,
  OpeningScene,
  ActionAdvice,
  ActionTip,
} from './types';

export const App: React.FC = () => {
  // Boot & Navigation state
  const [bootPhase, setBootPhase] = useState<'splash' | 'onboarding' | 'ready'>('splash');
  const [splashStatus, setSplashStatus] = useState<'loading' | 'restoring' | 'ready' | 'error'>('loading');
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('dashboard');
  const [activeStoryId, setActiveStoryId] = useState<string>('default_story');

  // Presentation state received from server authority
  const [viewState, setViewState] = useState<ExternalViewState | null>(null);
  const [chronicleEntries, setChronicleEntries] = useState<ChronicleEntry[]>([]);
  const [dossiers, setDossiers] = useState<NpcDossier[]>([]);
  const [recipes, setRecipes] = useState<CraftingRecipe[]>([]);
  const [powerState, setPowerState] = useState<PowerState | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityDefinition[]>([]);
  const [skillInstances, setSkillInstances] = useState<any[]>([]);
  const [capabilityGraph, setCapabilityGraph] = useState<CapabilityGraphNode[]>([]);
  const [worldTemplates, setWorldTemplates] = useState<WorldTemplate[]>([]);
  const [phase8Projection, setPhase8Projection] = useState<any | null>(null);
  const [storyLibraryStories, setStoryLibraryStories] = useState<StorySummary[]>([]);
  const [isLoadingStoryLibrary, setIsLoadingStoryLibrary] = useState(false);
  const [storyLibraryError, setStoryLibraryError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);
  const [pendingActionAdvice, setPendingActionAdvice] = useState<ActionAdvice | null>(null);
  const [storyActionTips, setStoryActionTips] = useState<ActionTip[]>([]);
  const actionSeqRef = useRef<number>(0);

  // Modal overlays
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isStoryLibraryModalOpen, setIsStoryLibraryModalOpen] = useState(false);
  const [isWorldLibraryModalOpen, setIsWorldLibraryModalOpen] = useState(false);
  const [isRoutingModalOpen, setIsRoutingModalOpen] = useState(false);
  const [isLivingBibleModalOpen, setIsLivingBibleModalOpen] = useState(false);
  const [isEpistemicModalOpen, setIsEpistemicModalOpen] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [isDeveloperDiagnosticsOpen, setIsDeveloperDiagnosticsOpen] = useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [genesisWorld, setGenesisWorld] = useState<WorldTemplate | null>(null);
  const [activeOpeningScene, setActiveOpeningScene] = useState<OpeningScene | null>(null);
  const [isLoadingOpening, setIsLoadingOpening] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);

  const fetchStoryLibrary = async () => {
    setIsLoadingStoryLibrary(true);
    setStoryLibraryError(null);
    try {
      const runs = await apiClient.getStoryRuns();
      const summaries: StorySummary[] = runs.map((run: any) => ({
        storyId: run.storyId,
        runId: run.runId || run.storyId,
        title: run.title || run.storyTitle || 'Untitled Story',
        worldName: run.worldName || run.worldTitle || 'Unknown World',
        genre: run.genre || run.genreTags?.[0] || 'Dynamic Adventure',
        imageUrl: run.imageAsset,
        imageMetadata: run.imageMetadata,
        visualIdentity: run.visualIdentity,
        characterName: run.characterName,
        currentLocation: run.currentLocation,
        turnCount: run.turnCount || 0,
        lastPlayed: run.lastPlayed || run.updatedAt || run.createdAt || 'Never',
        excerpt: run.excerpt || '',
      }));
      setStoryLibraryStories(summaries);
    } catch (err: any) {
      setStoryLibraryError(err?.message || 'Failed to load persisted Story Runs.');
    } finally {
      setIsLoadingStoryLibrary(false);
    }
  };


  const fetchOpeningScene = async (storyId: string) => {
    if (!storyId || storyId === 'default_story') return;
    setIsLoadingOpening(true);
    setOpeningError(null);
    try {
      const res = await apiClient.generateOpeningScene(storyId);
      if (res.openingScene) {
        setActiveOpeningScene(res.openingScene);
      }
      if (res.viewState) {
        setViewState(res.viewState);
      }
    } catch (err: any) {
      setOpeningError(err?.message || 'Failed to assemble opening narrative.');
    } finally {
      setIsLoadingOpening(false);
    }
  };

  const handleRetryOpening = async () => {
    if (!activeStoryId || activeStoryId === 'default_story') return;
    setIsLoadingOpening(true);
    setOpeningError(null);
    try {
      const res = await apiClient.generateOpeningScene(activeStoryId, { forceRegenerate: true });
      if (res.openingScene) {
        setActiveOpeningScene(res.openingScene);
      }
      if (res.viewState) {
        setViewState(res.viewState);
      }
    } catch (err: any) {
      setOpeningError(err?.message || 'Failed to generate opening scene.');
    } finally {
      setIsLoadingOpening(false);
    }
  };

  const fetchAuxiliaryData = async () => {
    try {
      const [chronicleData, dossierData, recipeData, capData, worldsData, phase8Data, actionTipsData] = await Promise.all([
        apiClient.getChronicle().catch(() => []),
        apiClient.getDossiers().catch(() => []),
        apiClient.getRecipes().catch(() => []),
        apiClient.getCapabilities().catch(() => null),
        apiClient.getWorlds().catch(() => []),
        apiClient.getPhase8Projection(activeStoryId).catch(() => null),
        apiClient.getStoryActionTips(activeStoryId).catch(() => []),
      ]);
      setChronicleEntries(chronicleData);
      setDossiers(dossierData);
      setRecipes(recipeData);
      if (capData) {
        setPowerState(capData.powerState || null);
        setCapabilities(capData.capabilities || []);
        setSkillInstances(capData.skillInstances || []);
        setCapabilityGraph(capData.graph || []);
      }
      if (worldsData) {
        setWorldTemplates(worldsData);
      }
      setPhase8Projection(phase8Data);
      setStoryActionTips(actionTipsData);
    } catch (e) {
      console.error('Failed to fetch auxiliary chronicle/dossier/capabilities data:', e);
    }
  };

  const initializeApp = async (targetStoryId?: string) => {
    const storyIdToUse = targetStoryId || activeStoryId;
    setSplashStatus('loading');
    setNetworkError(null);
    try {
      const [state, chronicleData, dossierData, recipeData, capData, worldsData, phase8Data, actionTipsData] = await Promise.all([
        apiClient.getGameState(storyIdToUse),
        apiClient.getChronicle().catch(() => []),
        apiClient.getDossiers().catch(() => []),
        apiClient.getRecipes().catch(() => []),
        apiClient.getCapabilities().catch(() => null),
        apiClient.getWorlds().catch(() => []),
        apiClient.getPhase8Projection(storyIdToUse).catch(() => null),
        apiClient.getStoryActionTips(storyIdToUse).catch(() => []),
      ]);
      setViewState(state);
      if (state.openingScene) {
        setActiveOpeningScene(state.openingScene);
      } else if (storyIdToUse !== 'default_story') {
        fetchOpeningScene(storyIdToUse);
      } else {
        setActiveOpeningScene(null);
      }
      setChronicleEntries(chronicleData);
      setDossiers(dossierData);
      setRecipes(recipeData);
      if (capData) {
        setPowerState(capData.powerState || null);
        setCapabilities(capData.capabilities || []);
        setSkillInstances(capData.skillInstances || []);
        setCapabilityGraph(capData.graph || []);
      }
      if (worldsData) {
        setWorldTemplates(worldsData);
      }
      setPhase8Projection(phase8Data);
      setStoryActionTips(actionTipsData);

      setSplashStatus('ready');

      // Check onboarding persistence
      const onboardingDone = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      setTimeout(() => {
        if (!onboardingDone) {
          setBootPhase('onboarding');
        } else {
          setBootPhase('ready');
        }
      }, 400);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to connect to the DreamBook story service.';
      setNetworkError(message);
      setSplashStatus('error');
    }
  };

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    if (bootPhase === 'ready' && currentRoute === 'story-library') {
      fetchStoryLibrary();
    }
  }, [bootPhase, currentRoute]);

  const dispatchAction = async (
    action: ActionRequest,
    onComplete?: (result: ActionResult) => void
  ) => {
    const currentSeq = ++actionSeqRef.current;
    setIsProcessingAction(true);
    try {
      const payload = { ...action, storyId: (action as any).storyId || activeStoryId };
      const result = await apiClient.sendAction(payload);
      if (currentSeq !== actionSeqRef.current) {
        return;
      }
      setViewState(result.viewState);
      fetchAuxiliaryData();
      if (onComplete) {
        onComplete(result);
      }
    } catch (err) {
      if (currentSeq === actionSeqRef.current) {
        console.error('Failed to execute story action:', err);
      }
    } finally {
      if (currentSeq === actionSeqRef.current) {
        setIsProcessingAction(false);
      }
    }
  };

  // Event Handlers for Gameplay Interactions
  const handleSelectChoice = (choice: DialogueChoice) => {
    dispatchAction({
      type: 'DIALOGUE_CHOICE',
      choiceId: choice.id,
      targetNodeId: choice.targetNodeId || 'node_next',
      intent: choice.intent || choice.label,
      label: choice.label,
    });
  };

  const handleEquipItem = (item: Item, targetSlot?: string) => {
    dispatchAction({
      type: 'EQUIP_REQUEST',
      itemId: item.id,
      slot: targetSlot || item.equippableSlot || 'mainHand',
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

  const handleCraftRecipe = (recipeId: string) => {
    dispatchAction({
      type: 'CUSTOM_ACTION',
      actionText: `Craft recipe ${recipeId}`,
      intent: 'CRAFT_ITEM',
    } as any);
  };

  const handleRepairItem = (itemId: string) => {
    dispatchAction({
      type: 'CUSTOM_ACTION',
      actionText: `Repair item ${itemId}`,
      intent: 'REPAIR_ITEM',
    } as any);
  };

  const handleRequestTravel = (targetLocationId: string, _routeId?: string) => {
    dispatchAction({
      type: 'TRAVEL_REQUEST',
      targetLocationId,
    });
  };

  const handleCancelTravel = () => {
    dispatchAction({
      type: 'CANCEL_TRAVEL',
    });
  };

  const handleInspectSurroundings = () => {
    dispatchAction({
      type: 'INSPECT_SURROUNDINGS',
    });
  };

  const handleAdvanceCycle = () => {
    dispatchAction({
      type: 'ADVANCE_TIME',
      seconds: 28800,
    });
  };

  const handleCustomAction = async (actionText: string) => {
    setPendingActionAdvice(null);

    try {
      const response = await apiClient.adviseStoryAction(actionText, activeStoryId);
      const advice = response?.advice as ActionAdvice | undefined;

      if (advice?.mode === 'SUGGEST_ALTERNATIVE') {
        setPendingActionAdvice(advice);
        return;
      }

      dispatchAction({
        type: 'CUSTOM_ACTION',
        actionText,
        intent: actionText,
        intendedCapabilityId: advice?.recognizedCapability?.id,
      } as any);
    } catch (error) {
      console.warn('Story action preflight unavailable; continuing through canonical action path.', error);
      dispatchAction({
        type: 'CUSTOM_ACTION',
        actionText,
        intent: actionText,
      } as any);
    }
  };

  const handleAcceptActionAdvice = async (advice: ActionAdvice) => {
    const proposalId = advice.proposal?.proposalId;
    if (!proposalId) return;
    setPendingActionAdvice(null);
    setIsProcessingAction(true);
    try {
      const result = await apiClient.acceptStoryActionAdvice({
        actionText: advice.actionText,
        proposalId,
        storyId: activeStoryId,
      });
      setViewState(result.viewState);
      fetchAuxiliaryData();
    } catch (error) {
      console.error('Failed to accept story action advice:', error);
      setPendingActionAdvice(advice);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleRejectActionAdvice = (_advice: ActionAdvice) => {
    // Rejecting a capability proposal must not execute the original unsupported
    // action as a generic freeform narrative action. The player simply returns
    // to the normal turn composer with their existing abilities unchanged.
    setPendingActionAdvice(null);
  };

  const handleEngageDialogue = (characterId: string) => {
    dispatchAction(
      {
        type: 'ENGAGE_DIALOGUE',
        characterId,
      },
      (res) => {
        if (res.success) {
          setCurrentRoute('play.story');
        }
      }
    );
  };

  const handleNavigate = (route: AppRoute) => {
    // Intercept routes that trigger legacy workstations/modals
    if (route === 'worlds') {
      setCurrentRoute('worlds');
      return;
    }
    if (route === 'create' || route === 'create.bring-to-life' || route === 'create.genesis') {
      setCurrentRoute(route);
      return;
    }
    if (route === 'engine.settings') {
      setIsAudioSettingsOpen(true);
      return;
    }
    if (route === 'engine.routing') {
      setIsRoutingModalOpen(true);
      return;
    }
    if (route === 'engine.voice') {
      setIsVoiceStudioOpen(true);
      return;
    }
    if (route === 'engine.audio') {
      setIsAudioSettingsOpen(true);
      return;
    }
    if (route === 'ops.archive') {
      setIsArchiveModalOpen(true);
      return;
    }
    if (route === 'ops.bible') {
      setIsLivingBibleModalOpen(true);
      return;
    }
    if (route === 'ops.debug') {
      setIsDeveloperDiagnosticsOpen(true);
      return;
    }

    setCurrentRoute(route);
  };

  // 1. Splash Screen Phase
  if (bootPhase === 'splash') {
    return (
      <SplashScreen
        status={splashStatus}
        errorMessage={networkError || undefined}
        onRetry={initializeApp}
        onContinue={() => {
          const done = localStorage.getItem(ONBOARDING_STORAGE_KEY);
          setBootPhase(done ? 'ready' : 'onboarding');
        }}
      />
    );
  }

  // 2. First-Run Onboarding Phase
  if (bootPhase === 'onboarding') {
    return (
      <OnboardingView
        onComplete={() => setBootPhase('ready')}
        onSkip={() => setBootPhase('ready')}
      />
    );
  }

  const activeLocation =
    viewState?.activeLocation ||
    (viewState?.locations && viewState.activeLocationId ? viewState.locations[viewState.activeLocationId] : undefined) ||
    (viewState?.locations ? Object.values(viewState.locations)[0] : undefined);

  // Projection for Dashboard & Story Library
  const formattedWorldTime = viewState?.worldTime
    ? `${viewState.worldTime.period}, Cycle ${viewState.worldTime.cycle} (${viewState.worldTime.era})`
    : undefined;

  const activeRunFromLibrary = storyLibraryStories.find((story) => story.storyId === activeStoryId || story.runId === activeStoryId);

  const activeStorySummary: StorySummary | null = viewState
    ? {
        storyId: activeStoryId,
        runId: `run_${activeStoryId}`,
        title: viewState.openingScene?.worldName
          ? `Chronicle of ${viewState.openingScene.worldName}`
          : activeLocation
          ? `Chronicle of ${activeLocation.name}`
          : 'The Awakening Chronicle',
        worldName: viewState.openingScene?.worldName || activeLocation?.region || 'Living Realm',
        genre: activeRunFromLibrary?.genre || 'Dynamic Adventure',
        storyMode: activeRunFromLibrary?.storyMode,
        dndRulesMode: activeRunFromLibrary?.dndRulesMode,
        imageUrl: activeRunFromLibrary?.imageUrl,
        imageMetadata: activeRunFromLibrary?.imageMetadata,
        visualIdentity: activeRunFromLibrary?.visualIdentity,
        characterName: viewState.protagonist?.name || viewState.characters?.[0]?.name || 'Protagonist',
        currentLocation: activeLocation?.name || 'Sanctum Gateway',
        turnCount: viewState.actionHistory?.length || 1,
        lastPlayed: 'Active Session',
        excerpt:
          viewState.openingScene?.narrativeText?.slice(0, 120) ||
          viewState.activeDialogue?.text ||
          'The shadows lengthen across the ancient stone archways...',
      }
    : null; 


  const isPlayRoute = currentRoute.startsWith('play.');

  // Derive compendium category if route is compendium.*
  let compendiumCategory: CompendiumCategory = 'characters';
  if (currentRoute.startsWith('compendium.')) {
    const sub = currentRoute.replace('compendium.', '') as CompendiumCategory;
    if (['characters', 'equipment', 'powers', 'npcs', 'creatures', 'worlds', 'visuals'].includes(sub)) {
      compendiumCategory = sub;
    }
  }

  const activeStoryConfig = {
    storyId: activeStoryId,
    runId: activeRunFromLibrary?.runId || `run_${activeStoryId}`,
    title: activeStorySummary?.title || 'The Awakening Chronicle',
    worldName: activeStorySummary?.worldName || 'Living Aethelgard',
    ruleset: activeRunFromLibrary?.dndRulesMode || activeStorySummary?.dndRulesMode || 'FULL_DND',
    genre: activeStorySummary?.genre || 'Dark Fantasy',
    characterName: activeStorySummary?.characterName || 'Protagonist',
    currentLocation: activeStorySummary?.currentLocation || 'Sanctum Gateway',
    currentCycle: formattedWorldTime || 'Dawn, Cycle 1',
    turnCount: activeStorySummary?.turnCount || 1,
    hasCombatActive: false,
  };

  const renderPlayContent = () => (
    <>
      {currentRoute === 'play.story' && activeLocation && viewState && (
        <StoryView
          location={activeLocation}
          activeDialogue={viewState.activeDialogue}
          dialogueHistory={viewState.dialogueHistory}
          actionHistory={viewState.actionHistory}
          onSelectChoice={handleSelectChoice}
          onRequestInspect={handleInspectSurroundings}
          onRequestRest={handleAdvanceCycle}
          onCustomAction={handleCustomAction}
          pendingActionAdvice={pendingActionAdvice}
          actionTips={storyActionTips}
          onAcceptActionAdvice={handleAcceptActionAdvice}
          onRejectActionAdvice={handleRejectActionAdvice}
          isProcessingAction={isProcessingAction}
          openingScene={activeOpeningScene || viewState.openingScene || null}
          worldTitle={activeStorySummary?.worldName}
          worldId={(activeRunFromLibrary as any)?.worldId || (activeStorySummary as any)?.worldId}
          protagonistName={viewState.protagonist?.name}
          protagonistRole={viewState.protagonist?.title}
          protagonistPortraitUrl={viewState.protagonist?.portraitUrl}
          protagonistPortraitEmoji={viewState.protagonist?.portraitEmoji}
          protagonistConditionState={viewState.protagonist?.conditionState}
          isLoadingOpening={isLoadingOpening}
          openingError={openingError}
          onRetryOpening={handleRetryOpening}
        />
      )}

      {currentRoute === 'play.character' && viewState && (
        <CharacterSurface
          protagonist={viewState.protagonist}
          powerState={powerState}
          capabilities={capabilities}
          skillInstances={skillInstances}
          equipment={viewState.equipment}
          inventory={viewState.inventory}
        />
      )}

      {currentRoute === 'play.world' && viewState && (
        <WorldView
          worldName={activeStorySummary?.worldName || 'Current World'}
          characters={viewState.characters}
          activeLocationId={viewState.activeLocationId}
          locations={viewState.locations}
          onEngageDialogue={handleEngageDialogue}
          dossiers={dossiers}
          phase8Relationships={phase8Projection?.relationships || []}
        />
      )}

      {currentRoute === 'play.recent-actions' && viewState && (
        <RecentActionsView actionHistory={viewState.actionHistory} />
      )}

      {currentRoute === 'play.inventory' && viewState && (
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

      {currentRoute === 'play.combat' && (
        <TacticalCombatView onRefreshWorldState={fetchAuxiliaryData} />
      )}

      {currentRoute === 'play.map' && viewState && (
        <WorldMapView
          locations={viewState.locations}
          activeLocationId={viewState.activeLocationId}
          activeJourney={viewState.activeJourney}
          isTraveling={viewState.isTraveling}
          onRequestTravel={handleRequestTravel}
          onCancelTravel={handleCancelTravel}
          isProcessingAction={isProcessingAction}
          routeEdges={viewState.routeEdges}
        />
      )}

      {currentRoute === 'play.world-systems' && (
        <Phase8WorldWorkbench storyId={activeStoryId} />
      )}

      {currentRoute === 'play.codex' && viewState && (
        <StoryCodexView
          locations={viewState.locations}
          activeLocationId={viewState.activeLocationId}
          knowledgeBase={viewState.knowledgeBase}
          worldName={activeStorySummary?.worldName}
        />
      )}

      {currentRoute === 'play.evidence' && viewState && (
        <StoryEvidenceView knowledgeBase={viewState.knowledgeBase} />
      )}

      {currentRoute === 'play.relationships' && viewState && (
        <StoryRelationshipsView
          characters={viewState.characters}
          relationships={phase8Projection?.relationships || []}
        />
      )}

      {currentRoute === 'play.chronicle' && viewState && (
        <ChronicleView
          knowledgeBase={viewState.knowledgeBase}
          actionHistory={viewState.actionHistory}
          engineContractVersion={viewState.engineContractVersion}
          chronicleEntries={chronicleEntries}
        />
      )}
    </>
  );

  return (
    <AudioHapticProvider>
      <SensoryEventProcessor events={(viewState as any)?.sensoryEvents} />

      {isPlayRoute ? (
        <StoryContextShell
          storyConfig={activeStoryConfig}
          currentRoute={currentRoute}
          onNavigate={handleNavigate}
          onExitToLibrary={() => setCurrentRoute('story-library')}
          onOpenSettings={() => setIsAudioSettingsOpen(true)}
        >
          {renderPlayContent()}
        </StoryContextShell>
      ) : (
        <AppShell
          currentRoute={currentRoute}
          onNavigate={handleNavigate}
          activeStoryTitle={activeStorySummary?.title}
          worldClockTime={formattedWorldTime}
          isEngineReady={Boolean(viewState && !networkError)}
        >
          {/* Route Viewports */}
          {currentRoute === 'dashboard' && (
            <DashboardView
              activeStory={activeStorySummary}
              recentStories={storyLibraryStories}
              curatedWorlds={worldTemplates}
              isLoading={!viewState}
              onResumeStory={() => setCurrentRoute('play.story')}
              onNewStory={() => setCurrentRoute('create')}
              onExploreWorlds={() => setIsWorldLibraryModalOpen(true)}
              onOpenLibrary={() => setCurrentRoute('story-library')}
              onOpenSettings={() => setIsAudioSettingsOpen(true)}
              onSelectWorld={() => setIsWorldLibraryModalOpen(true)}
            />
          )}

          {currentRoute === 'story-library' && (
            <StoryLibraryView
              stories={storyLibraryStories}
              isLoading={isLoadingStoryLibrary}
              errorMessage={storyLibraryError || undefined}
              onRetry={fetchStoryLibrary}
              onResumeStory={(runId) => {
                const story = storyLibraryStories.find((entry) => entry.runId === runId);
                const storyId = story?.storyId || runId;
                apiClient.setActiveStoryId(storyId);
                setActiveStoryId(storyId);
                setCurrentRoute('play.story');
                initializeApp(storyId);
              }}
              onNewStory={() => setCurrentRoute('create')}
              onBranchStory={() => setIsStoryLibraryModalOpen(true)}
              onStoryAssetChange={async (runId, newUrl, provenance) => {
                try {
                  const updated = await apiClient.saveStoryRunVisualAsset(runId, {
                    imageAsset: newUrl ?? null,
                    imageMetadata: provenance ? { provenance, rightsStatus: 'UNKNOWN' } : undefined,
                  });
                  setStoryLibraryStories((current) => current.map((story) =>
                    story.runId === runId
                      ? { ...story, imageUrl: updated.imageAsset, imageMetadata: updated.imageMetadata, visualIdentity: updated.visualIdentity }
                      : story
                  ));
                } catch (err) {
                  console.error('Failed to save Story Run artwork:', err);
                }
              }}
            />
          )}

          {currentRoute === 'create.genesis' && (
            <CharacterGenesisView
              initialWorld={genesisWorld || worldTemplates?.[0] || null}
              onNavigateToWorldLibrary={() => setIsWorldLibraryModalOpen(true)}
              onCancel={() => setCurrentRoute('dashboard')}
              onStartStoryRun={(newStoryId, run, openingScene) => {
                apiClient.setActiveStoryId(newStoryId);
                setActiveStoryId(newStoryId);
                if (openingScene) {
                  setActiveOpeningScene(openingScene);
                }
                setCurrentRoute('play.story');
                initializeApp(newStoryId);
                fetchStoryLibrary();
              }}
            />
          )}

          {(currentRoute === 'create' || currentRoute === 'create.bring-to-life') && (
            <CreateStoryWizard
              onWorldAccepted={(world) => {
                setGenesisWorld(world as WorldTemplate);
                setCurrentRoute('create.genesis');
              }}
              onSelectRun={(runStoryId) => {
                if (runStoryId) {
                  apiClient.setActiveStoryId(runStoryId);
                  setActiveStoryId(runStoryId);
                  setCurrentRoute('play.story');
                  initializeApp(runStoryId);
                  fetchStoryLibrary();
                }
              }}
              onCancel={() => {
                setCurrentRoute('dashboard');
              }}
            />
          )}

          {currentRoute === 'worlds' && (
            <WorldLibraryModal
              isOpen={true}
              onClose={() => setCurrentRoute('dashboard')}
              onSelectRun={(storyId) => {
                apiClient.setActiveStoryId(storyId);
                setActiveStoryId(storyId);
                setCurrentRoute('play.story');
                initializeApp(storyId);
                fetchStoryLibrary();
              }}
              onGenesisCharacter={(world) => {
                setGenesisWorld(world);
                setCurrentRoute('create.genesis');
              }}
            />
          )}

          {(currentRoute === 'compendium' || currentRoute.startsWith('compendium.')) && (
            <CompendiumView
              activeStoryId={activeStoryId}
              initialCategory={compendiumCategory}
              onNavigateCategory={(cat) => setCurrentRoute(`compendium.${cat}` as AppRoute)}
            />
          )}

          {(currentRoute === 'settings' ||
            currentRoute === 'engine.settings' ||
            currentRoute === 'engine.routing' ||
            currentRoute === 'engine.voice' ||
            currentRoute === 'engine.audio') && (
            <SettingsView
              initialTab={
                currentRoute === 'engine.routing'
                  ? 'MODELS'
                  : currentRoute === 'engine.voice' || currentRoute === 'engine.audio'
                  ? 'AUDIO'
                  : 'MODELS'
              }
              onOpenAdvancedRouting={() => setIsRoutingModalOpen(true)}
              onOpenLivingBible={() => setIsLivingBibleModalOpen(true)}
              onOpenEpistemicInspector={() => setIsEpistemicModalOpen(true)}
              onOpenContextInspector={() => setIsContextModalOpen(true)}
              onOpenDeveloperDiagnostics={() => setIsDeveloperDiagnosticsOpen(true)}
            />
          )}
        </AppShell>
      )}

      {/* Modals & Diagnostic Workstations */}
      <AudioSettingsModal
        isOpen={isAudioSettingsOpen}
        onClose={() => setIsAudioSettingsOpen(false)}
      />
      <VoiceStudioModal
        isOpen={isVoiceStudioOpen}
        onClose={() => setIsVoiceStudioOpen(false)}
        storyId="default_story"
      />
      <ImportStoryModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onStoryAdapted={() => {
          setIsImportModalOpen(false);
          initializeApp();
        }}
      />
      <StoryLibraryModal
        isOpen={isStoryLibraryModalOpen}
        onClose={() => setIsStoryLibraryModalOpen(false)}
        onSelectStory={() => initializeApp()}
      />
      <WorldLibraryModal
        isOpen={isWorldLibraryModalOpen}
        onClose={() => setIsWorldLibraryModalOpen(false)}
        onGenesisCharacter={(world) => {
          setGenesisWorld(world);
          setIsWorldLibraryModalOpen(false);
          setCurrentRoute('create.genesis');
        }}
        onSelectRun={(runStoryId) => {
          if (runStoryId) {
            setActiveStoryId(runStoryId);
            setIsWorldLibraryModalOpen(false);
            setCurrentRoute('play.story');
            initializeApp(runStoryId);
          } else {
            initializeApp();
          }
        }}
      />
      <RoutingWorkstationModal
        isOpen={isRoutingModalOpen}
        onClose={() => setIsRoutingModalOpen(false)}
        storyId="default_story"
      />
      <LivingBibleWorkstationModal
        isOpen={isLivingBibleModalOpen}
        onClose={() => setIsLivingBibleModalOpen(false)}
      />
      <EpistemicInspectorModal
        isOpen={isEpistemicModalOpen}
        onClose={() => setIsEpistemicModalOpen(false)}
      />
      <ContextInspectorModal
        isOpen={isContextModalOpen}
        onClose={() => setIsContextModalOpen(false)}
      />
      <DeveloperDiagnosticsModal
        isOpen={isDeveloperDiagnosticsOpen}
        onClose={() => setIsDeveloperDiagnosticsOpen(false)}
        storyId={activeStoryId}
      />
      <ArchiveModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        onRestoreSuccess={() => initializeApp()}
      />
    </AudioHapticProvider>
  );
};
