import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  User,
  Shield,
  Zap,
  MapPin,
  Compass,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Save,
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Edit3,
  FileText,
  Clock,
  Layers,
  Info,
  ChevronRight,
  ChevronDown,
  Play,
  BarChart2,
  Eye,
  X,
  Sword,
  Package,
  HelpCircle,
  Briefcase,
  Award,
  BookOpen,
} from 'lucide-react';
import {
  CharacterGenesisDraft,
  ConfirmedCharacter,
  CapabilityDefinition,
  GeneratedTechnique,
  StartingEquipmentItem,
  WorldTemplate,
  CharacterProvenanceSource,
  CharacterStoryMode,
  CharacterCoreStats,
  CharacterFeat,
  CharacterSkill,
  CharacterStatDefinition,
  EquipmentSlotId,
  ItemOrSkillIcon,
} from '../../types';
import {
  STANDARD_DND_SKILLS_CATALOG,
  getInitialDndSkills,
  calculateSkillModifier,
} from '../../data/dndSkillsCatalog';
import {
  getEquipmentClass,
  isEquipable,
  getHandUsage,
  getCompatibleEquipmentSlots,
  getOccupiedSlots,
  canEquipItemToSlot,
  getItemsCompatibleWithSlot,
  getConflictingEquippedItems,
  normalizeItemEquipmentMetadata,
} from '../../data/equipmentRulesEngine';
import {
  getDefaultIconForSkill,
  getDefaultIconForEquipment,
} from '../../data/iconSystem';
import { IconStudioModal } from './IconStudioModal';
import { apiClient } from '../../services/apiClient';

interface CharacterGenesisViewProps {
  initialWorld?: WorldTemplate | null;
  onConfirmSuccess?: (character: ConfirmedCharacter) => void;
  onStartStoryRun?: (storyId: string, run: any, openingScene?: any) => void;
  onCancel?: () => void;
  onNavigateToWorldLibrary?: () => void;
}

const NARRATIVE_ROLE_OPTIONS: Array<{
  value: CharacterStoryMode;
  label: string;
  description: string;
}> = [
  {
    value: 'PROTAGONIST',
    label: 'Protagonist',
    description: 'You are the central character. The main campaign and opening arc are built around your character.',
  },
  {
    value: 'SIDE_CHARACTER',
    label: 'Side Character',
    description: 'You play a character inside a larger story. Major protagonists and world events can continue without revolving around you.',
  },
  {
    value: 'FREE_ROAM',
    label: 'Free Roam',
    description: 'You are an independent character in an open sandbox. No predetermined hero arc is forced onto you.',
  },
];

const PRESET_CONCEPTS = [
  {
    label: 'Elven Spellblade',
    concept: 'A weathered elven spellblade exiled from the high canopy for wielding forbidden astral magic, quiet and observant, seeking redemption.',
  },
  {
    label: 'Frontier Ranger',
    concept: 'A rugged human scout from the outer borderlands with keen tracking instincts, armed with a recurve bow and hunting hounds, untrusting of cityfolk.',
  },
  {
    label: 'Shadow Infiltrator',
    concept: 'A covert rogue trained in shadowy stealth and lockpicking, carrying dual daggers and a grappling hook, driven by an unpaid debt.',
  },
  {
    label: 'Arcane Scholar',
    concept: 'A methodical novice wizard researching ancient forgotten relics, bearing runed scrolls, an iron staff, and a deep thirst for hidden knowledge.',
  },
];

export const CharacterGenesisView: React.FC<CharacterGenesisViewProps> = ({
  initialWorld,
  onConfirmSuccess,
  onStartStoryRun,
  onCancel,
  onNavigateToWorldLibrary,
}) => {
  // Available worlds if not provided
  const [availableWorlds, setAvailableWorlds] = useState<WorldTemplate[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<WorldTemplate | null>(initialWorld || null);

  // Stepper state: 1: Concept, 2: Dossier, 3: Capabilities, 4: Equipment, 5: Starting State, 6: Portrait, 7: Review
  const [activeStep, setActiveStep] = useState<number>(1);

  // Concept & draft state
  const [naturalConcept, setNaturalConcept] = useState<string>('');
  const [selectedNarrativeRole, setSelectedNarrativeRole] = useState<CharacterStoryMode>('PROTAGONIST');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [deterministicFallbackPrompt, setDeterministicFallbackPrompt] = useState<{ reason: string } | null>(null);
  const [extractionActivity, setExtractionActivity] = useState<string | null>(null);
  const [extractionModel, setExtractionModel] = useState<string | null>(null);
  const [extractionElapsedSeconds, setExtractionElapsedSeconds] = useState(0);

  // The active Draft & Review Gate
  const [draft, setDraft] = useState<CharacterGenesisDraft | null>(null);
  const [pendingAiDraft, setPendingAiDraft] = useState<CharacterGenesisDraft | null>(null);
  const [userEditedFields, setUserEditedFields] = useState<Set<string>>(new Set());

  // Custom capability proposal state
  const [customCapInput, setCustomCapInput] = useState<string>('');
  const [isProposingCap, setIsProposingCap] = useState<boolean>(false);
  const [capProposalError, setCapProposalError] = useState<string | null>(null);
  const [pendingCapProposal, setPendingCapProposal] = useState<(CapabilityDefinition & { generatedSkills: GeneratedTechnique[] }) | null>(null);

  // Custom feat proposal state
  const [isProposingFeat, setIsProposingFeat] = useState<boolean>(false);
  const [featProposalError, setFeatProposalError] = useState<string | null>(null);
  const [pendingFeatProposal, setPendingFeatProposal] = useState<CharacterFeat | null>(null);

  // Custom skill proposal state
  const [customSkillName, setCustomSkillName] = useState<string>('');
  const [customSkillConcept, setCustomSkillConcept] = useState<string>('');
  const [isProposingSkill, setIsProposingSkill] = useState<boolean>(false);
  const [skillProposalError, setSkillProposalError] = useState<string | null>(null);
  const [pendingSkillProposal, setPendingSkillProposal] = useState<CharacterSkill | null>(null);

  // Custom attribute proposal state
  const [customAttributeConcept, setCustomAttributeConcept] = useState<string>('');
  const [isProposingAttribute, setIsProposingAttribute] = useState<boolean>(false);
  const [attributeProposalError, setAttributeProposalError] = useState<string | null>(null);
  const [pendingAttributeProposal, setPendingAttributeProposal] = useState<CharacterStatDefinition | null>(null);

  // Custom equipment proposal state
  const [isProposingEquipment, setIsProposingEquipment] = useState<boolean>(false);
  const [equipmentProposalError, setEquipmentProposalError] = useState<string | null>(null);
  const [pendingEquipmentProposal, setPendingEquipmentProposal] = useState<StartingEquipmentItem | null>(null);

  // Inspection & Modals
  const [inspectingItem, setInspectingItem] = useState<StartingEquipmentItem | null>(null);
  const [inspectingSkill, setInspectingSkill] = useState<CharacterSkill | null>(null);
  const [equipSlotSelectModalItem, setEquipSlotSelectModalItem] = useState<StartingEquipmentItem | null>(null);

  // Icon Studio & Equipment Rule Engine Modals
  const [iconStudioTarget, setIconStudioTarget] = useState<{
    itemOrSkill: CharacterSkill | StartingEquipmentItem;
    type: 'SKILL' | 'EQUIPMENT';
  } | null>(null);
  const [slotPickerModalItem, setSlotPickerModalItem] = useState<StartingEquipmentItem | null>(null);
  const [paperDollPickerSlot, setPaperDollPickerSlot] = useState<EquipmentSlotId | null>(null);
  const [equipConflictState, setEquipConflictState] = useState<{
    itemToEquip: StartingEquipmentItem;
    targetSlot: EquipmentSlotId;
    conflicts: StartingEquipmentItem[];
  } | null>(null);

  // Draft persistence & history
  const [savedDrafts, setSavedDrafts] = useState<CharacterGenesisDraft[]>([]);
  const [confirmedCharacters, setConfirmedCharacters] = useState<ConfirmedCharacter[]>([]);
  const [showDraftsModal, setShowDraftsModal] = useState<boolean>(false);
  const [saveDraftStatus, setSaveDraftStatus] = useState<string | null>(null);

  // Confirmed result state
  const [confirmedCharacter, setConfirmedCharacter] = useState<ConfirmedCharacter | null>(null);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  // StoryRun Creation state (Slice 3)
  const [isStartingRun, setIsStartingRun] = useState<boolean>(false);
  const [startRunError, setStartRunError] = useState<string | null>(null);

  // Portrait generation state
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState<boolean>(false);
  const [customImageUrl, setCustomImageUrl] = useState<string>('');
  const [customFeatName, setCustomFeatName] = useState<string>('');
  const [customFeatDescription, setCustomFeatDescription] = useState<string>('');
  const [customEquipmentName, setCustomEquipmentName] = useState<string>('');
  const [customEquipmentDescription, setCustomEquipmentDescription] = useState<string>('');
  const [customAttributeName, setCustomAttributeName] = useState<string>('');
  const [customAttributeValue, setCustomAttributeValue] = useState<string>('10');
  const [customStatName, setCustomStatName] = useState<string>('');
  const [customStatValue, setCustomStatValue] = useState<string>('10');
  const [autosaveStatus, setAutosaveStatus] = useState<string>('Not saved');
  const [showInterpretation, setShowInterpretation] = useState<boolean>(true);

  useEffect(() => {
    if (!draft || !selectedWorld) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await apiClient.saveCharacterDraft(selectedWorld.worldId, draft);
        if (res.success) setAutosaveStatus('Autosaved ' + new Date().toLocaleTimeString());
      } catch {
        setAutosaveStatus('Autosave pending');
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [draft, selectedWorld]);

  // Load available worlds on mount if needed
  useEffect(() => {
    const loadWorlds = async () => {
      try {
        const worlds = await apiClient.getWorlds();
        if (worlds && worlds.length > 0) {
          setAvailableWorlds(worlds);
          if (!selectedWorld) {
            setSelectedWorld(worlds[0]);
          }
        }
      } catch (err) {
        console.warn('Could not load worlds for character genesis:', err);
      }
    };
    loadWorlds();
  }, []);

  // Update selectedWorld if prop changes
  useEffect(() => {
    if (initialWorld) {
      setSelectedWorld(initialWorld);
    }
  }, [initialWorld]);

  // Load drafts and confirmed characters for selected world
  useEffect(() => {
    if (!selectedWorld) return;
    const fetchWorldDrafts = async () => {
      try {
        const res = await apiClient.getCharacterDrafts(selectedWorld.worldId);
        if (res.success && res.drafts) {
          setSavedDrafts(res.drafts);
        }
        const confRes = await apiClient.getConfirmedCharacters(selectedWorld.worldId);
        if (confRes.success && confRes.characters) {
          setConfirmedCharacters(confRes.characters);
        }
      } catch (err) {
        console.warn('Could not load saved drafts for world:', err);
      }
    };
    fetchWorldDrafts();
  }, [selectedWorld]);

  // Mark field as user edited
  const markFieldEdited = (fieldKey: string) => {
    setUserEditedFields((prev) => new Set(prev).add(fieldKey));
    if (draft) {
      setDraft((prevDraft) => {
        if (!prevDraft) return prevDraft;
        return {
          ...prevDraft,
          provenance: {
            ...prevDraft.provenance,
            [fieldKey]: 'USER_EDITED' as CharacterProvenanceSource,
          },
          fieldLocks: Array.from(new Set([...(prevDraft.fieldLocks || []), fieldKey])),
        };
      });
    }
  };

  const isFieldLocked = (fieldKey: string): boolean => Boolean(draft?.fieldLocks?.includes(fieldKey));

  const toggleFieldLock = (fieldKey: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const locks = new Set(prev.fieldLocks || []);
      if (locks.has(fieldKey)) locks.delete(fieldKey);
      else locks.add(fieldKey);
      return { ...prev, fieldLocks: Array.from(locks) };
    });
  };

  const saveRevisionSnapshot = (label: string) => {
    if (!draft) return;
    const nextRevision = (draft.revision || 0) + 1;
    setDraft({
      ...draft,
      revision: nextRevision,
      revisionHistory: [
        ...(draft.revisionHistory || []).slice(-9),
        {
          revision: nextRevision,
          savedAt: new Date().toISOString(),
          label,
          snapshot: JSON.parse(JSON.stringify(draft)),
        },
      ],
    });
  };

  const addCustomFeat = () => {
    if (!draft || !customFeatName.trim()) return;
    const id = 'feat_player_' + Date.now();
    const feat = {
      id,
      name: customFeatName.trim(),
      description: customFeatDescription.trim() || 'Player-created achievement.',
      effects: [],
      prerequisites: [],
      tags: ['PLAYER_CREATED'],
      provenance: 'PLAYER_INPUT' as CharacterProvenanceSource,
      worldId: selectedWorld?.worldId,
    };
    setDraft({ ...draft, feats: [...(draft.feats || []), feat] });
    markFieldEdited('feats');
    setCustomFeatName('');
    setCustomFeatDescription('');
  };

  const addCustomEquipment = () => {
    if (!draft || !customEquipmentName.trim()) return;
    const rawItem: StartingEquipmentItem = {
      id: 'eq_player_' + Date.now(),
      name: customEquipmentName.trim(),
      category: 'Miscellaneous',
      description: customEquipmentDescription.trim() || 'Player-created starting equipment.',
      isEquipped: false,
      quantity: 1,
      provenance: 'PLAYER_INPUT',
      sourceUserPrompt: customEquipmentDescription.trim() || customEquipmentName.trim(),
    };
    const item = normalizeItemEquipmentMetadata(rawItem);
    setDraft({
      ...draft,
      startingEquipment: {
        ...draft.startingEquipment,
        inventory: [...draft.startingEquipment.inventory, item],
      },
    });
    markFieldEdited('startingEquipment');
    setCustomEquipmentName('');
    setCustomEquipmentDescription('');
  };

  const addCustomStat = (kind: 'attribute' | 'stat') => {
    if (!draft) return;
    const name = kind === 'attribute' ? customAttributeName.trim() : customStatName.trim();
    const valueText = kind === 'attribute' ? customAttributeValue : customStatValue;
    if (!name) return;
    const entry = {
      id: (kind === 'attribute' ? 'attr_' : 'stat_') + Date.now(),
      name,
      value: Number(valueText) || 10,
      baseValue: Number(valueText) || 10,
      provenance: 'PLAYER_INPUT' as CharacterProvenanceSource,
    };
    setDraft({
      ...draft,
      [kind === 'attribute' ? 'attributes' : 'stats']: [
        ...(draft[kind === 'attribute' ? 'attributes' : 'stats'] || []),
        entry,
      ],
    } as CharacterGenesisDraft);
    markFieldEdited(kind === 'attribute' ? 'attributes' : 'stats');
    if (kind === 'attribute') setCustomAttributeName('');
    else setCustomStatName('');
  };

  const handleSuggestStartingContext = async (mode: 'AI_SUGGEST' | 'SURPRISE_ME') => {
    if (!selectedWorld || !draft) return;
    try {
      const locked = [
        'identity','appearance','personality','background','role','motivations',
        'relationships','condition','capabilities','generatedSkills','feats',
        'titles','startingEquipment','portraitAsset','attributes','stats','traits'
      ];
      const concept = naturalConcept + '\n\nStarting context instruction: ' +
        (mode === 'SURPRISE_ME'
          ? 'Surprise the player with a coherent but unexpected starting location and dramatic situation.'
          : 'Suggest the most narratively coherent starting location and situation for this character and world.');
      const res = await apiClient.extractCharacterFromConcept(
        selectedWorld.worldId,
        concept,
        draft,
        locked,
        draft.storyMode || selectedNarrativeRole
      );
      if (res.success && res.draft) {
        setDraft({
          ...draft,
          startingLocation: res.draft.startingLocation,
          startingSituation: res.draft.startingSituation,
          startingLocationMode: mode,
          startingSituationMode: mode,
        });
        markFieldEdited('startingLocation');
        markFieldEdited('startingSituation');
      }
    } catch (err: any) {
      setSaveDraftStatus('Could not generate a starting context: ' + (err.message || 'Unknown error'));
    }
  };

  const restoreRevision = (revision: number) => {
    if (!draft) return;
    const target = (draft.revisionHistory || []).find((entry) => entry.revision === revision);
    if (!target?.snapshot) return;
    setDraft({
      ...draft,
      ...(target.snapshot as CharacterGenesisDraft),
      revision: (draft.revision || 0) + 1,
      revisionHistory: [...(draft.revisionHistory || []), {
        revision: (draft.revision || 0) + 1,
        savedAt: new Date().toISOString(),
        label: 'Restored revision ' + revision,
        snapshot: JSON.parse(JSON.stringify(target.snapshot)),
      }],
    });
    setSaveDraftStatus('Restored revision ' + revision + '. Review before confirming.');
  };

  useEffect(() => {
    if (!isExtracting) return;
    const startedAt = Date.now();
    setExtractionElapsedSeconds(0);

    const timer = window.setInterval(() => {
      setExtractionElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isExtracting]);

  // 1. Natural Language Extraction Handler
  // The first attempt may only use AI. Deterministic extraction requires an explicit
  // player decision after DreamBook reports that no usable AI result is available.
  const handleExtractCharacter = async (allowDeterministicFallback = false) => {
    if (!selectedWorld) {
      setExtractionError('Please select an active world template first.');
      return;
    }
    if (!naturalConcept.trim()) {
      setExtractionError('Please enter a natural language character concept.');
      return;
    }

    setExtractionError(null);
    setDeterministicFallbackPrompt(null);
    setExtractionElapsedSeconds(0);
    setExtractionModel(null);
    setExtractionActivity(
      allowDeterministicFallback
        ? 'Building the deterministic draft you explicitly requested...'
        : 'Preparing the Character Genesis extraction...'
    );
    setIsExtracting(true);

    try {
      let activeModelName: string | null = null;

      if (!allowDeterministicFallback) {
        try {
          const selection = await apiClient.selectOrchestratorModel({
            task: 'narrative.generate',
            contextTokens: Math.max(1000, Math.ceil((naturalConcept.length + 5000) / 4)),
          });
          const selected = selection?.selectedModel;
          if (selected && !selected.isEmergencyFloor) {
            activeModelName = selected.displayName || selected.modelId;
            const fallbackCount = Array.isArray(selection.fallbacks)
              ? selection.fallbacks.filter((model: any) => !model?.isEmergencyFloor).length
              : 0;
            setExtractionModel(activeModelName);
            setExtractionActivity(
              fallbackCount > 0
                ? `Contacting ${activeModelName} • ${fallbackCount} AI fallback model(s) available`
                : `Contacting ${activeModelName}`
            );
          } else {
            setExtractionActivity('Checking AI availability...');
          }
        } catch {
          setExtractionActivity('Contacting the configured AI model...');
        }
      }

      setExtractionActivity(
        allowDeterministicFallback
          ? 'Building the deterministic character draft...'
          : activeModelName
          ? `Waiting for ${activeModelName} to return the character interpretation...`
          : 'Waiting for the AI model to return the character interpretation...'
      );

      const res = await apiClient.extractCharacterFromConcept(
        selectedWorld.worldId,
        naturalConcept,
        draft || undefined,
        Array.from(userEditedFields),
        draft?.storyMode || undefined,
        allowDeterministicFallback
      );

      setExtractionActivity(
        allowDeterministicFallback
          ? 'Assembling the deterministic character dossier...'
          : 'AI response received • validating the structured Character Genesis response...'
      );

      if (res.success && res.draft) {
        setPendingAiDraft(res.draft);
        setExtractionActivity('Character proposal synthesized • please review below.');
      } else {
        throw new Error(res.error || 'Failed to extract character draft.');
      }
    } catch (err: any) {
      if (err?.requiresDeterministicConfirmation) {
        setExtractionError(null);
        setExtractionActivity('AI providers did not return a usable response.');
        setDeterministicFallbackPrompt({
          reason:
            err?.reason ||
            err?.message ||
            'AI providers did not return a usable character extraction.',
        });
      } else {
        setExtractionActivity(null);
        setExtractionError(err?.message || 'An error occurred during character extraction.');
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleContinueWithDeterministicExtraction = async () => {
    setDeterministicFallbackPrompt(null);
    await handleExtractCharacter(true);
  };

  const handleAcceptPendingAiDraft = async () => {
    if (!pendingAiDraft) return;
    setDraft(pendingAiDraft);
    setSelectedNarrativeRole(pendingAiDraft.storyMode || 'PROTAGONIST');
    setPendingAiDraft(null);
    setActiveStep(2);
    if (selectedWorld) {
      await apiClient.saveCharacterDraft(selectedWorld.worldId, pendingAiDraft);
    }
  };

  const handleRejectPendingAiDraft = () => {
    setPendingAiDraft(null);
  };

  // 2. Propose Custom Capability (AI Proposal Review Gate)
  const handleProposeCustomCapability = async () => {
    if (!selectedWorld) return;
    if (!customCapInput.trim()) {
      setCapProposalError('Enter a capability concept name or description.');
      return;
    }

    setCapProposalError(null);
    setIsProposingCap(true);

    try {
      const res = await apiClient.proposeCustomCapability(selectedWorld.worldId, customCapInput, {
        role: draft?.role?.role || draft?.role?.archetype || draft?.role?.profession,
        background: draft?.background?.history,
        species: draft?.identity?.species,
      });

      if (res.success && res.capability) {
        setPendingCapProposal(res.capability);
      } else {
        throw new Error(res.error || 'Failed to propose custom capability.');
      }
    } catch (err: any) {
      setCapProposalError(err.message || 'Error proposing capability.');
    } finally {
      setIsProposingCap(false);
    }
  };

  const handleAcceptCapProposal = () => {
    if (!pendingCapProposal || !draft) return;
    const newCap = { ...pendingCapProposal };
    const newSkills = pendingCapProposal.generatedSkills || [];

    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        capabilities: [...prev.capabilities, newCap],
        generatedSkills: [...prev.generatedSkills, ...newSkills],
      };
    });

    markFieldEdited('capabilities');
    markFieldEdited('generatedSkills');
    setPendingCapProposal(null);
    setCustomCapInput('');
  };

  const handleRejectCapProposal = () => {
    setPendingCapProposal(null);
  };

  // 3. Propose Custom Feat (AI Proposal Review Gate)
  const handleProposeCustomFeat = async () => {
    if (!selectedWorld) return;
    if (!customFeatName.trim() && !customFeatDescription.trim()) {
      setFeatProposalError('Enter a feat name or concept description.');
      return;
    }

    setFeatProposalError(null);
    setIsProposingFeat(true);

    try {
      const res = await apiClient.proposeCustomFeat(
        selectedWorld.worldId,
        customFeatName,
        customFeatDescription,
        {
          role: draft?.role?.role || draft?.role?.archetype || draft?.role?.profession,
          background: draft?.background?.history,
          species: draft?.identity?.species,
        }
      );

      if (res.success && res.feat) {
        setPendingFeatProposal(res.feat);
      } else {
        throw new Error(res.error || 'Failed to propose custom feat.');
      }
    } catch (err: any) {
      setFeatProposalError(err.message || 'Error proposing custom feat.');
    } finally {
      setIsProposingFeat(false);
    }
  };

  const handleAcceptFeatProposal = () => {
    if (!pendingFeatProposal || !draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        feats: [...prev.feats, pendingFeatProposal],
      };
    });

    markFieldEdited('feats');
    setPendingFeatProposal(null);
    setCustomFeatName('');
    setCustomFeatDescription('');
  };

  const handleRejectFeatProposal = () => {
    setPendingFeatProposal(null);
  };

  // Ensure standard D&D 18 skills exist on draft
  useEffect(() => {
    if (draft && (!draft.skills || draft.skills.length === 0)) {
      const initialSkills = getInitialDndSkills(draft.skills || []);
      setDraft((prev) => (prev ? { ...prev, skills: initialSkills } : prev));
    }
  }, [draft?.draftId]);

  // 4. Propose Custom Skill (AI Proposal Review Gate)
  const handleProposeCustomSkill = async () => {
    if (!selectedWorld) return;
    if (!customSkillName.trim() && !customSkillConcept.trim()) {
      setSkillProposalError('Enter a skill name or skill concept description.');
      return;
    }

    setSkillProposalError(null);
    setIsProposingSkill(true);

    try {
      const res = await apiClient.proposeCustomSkill(
        selectedWorld.worldId,
        customSkillName,
        customSkillConcept || customSkillName,
        {
          role: draft?.role?.role || draft?.role?.archetype || draft?.role?.profession,
          background: draft?.background?.history,
          species: draft?.identity?.species,
        }
      );

      if (res.success && res.skill) {
        setPendingSkillProposal(res.skill);
      } else {
        throw new Error(res.error || 'Failed to propose custom skill.');
      }
    } catch (err: any) {
      setSkillProposalError(err.message || 'Error proposing custom skill.');
    } finally {
      setIsProposingSkill(false);
    }
  };

  const handleAcceptSkillProposal = () => {
    if (!pendingSkillProposal || !draft) return;
    const currentSkills = getInitialDndSkills(draft.skills || []);
    setDraft({
      ...draft,
      skills: [...currentSkills, pendingSkillProposal],
    });

    markFieldEdited('skills');
    setPendingSkillProposal(null);
    setCustomSkillName('');
    setCustomSkillConcept('');
  };

  const handleRejectSkillProposal = () => {
    setPendingSkillProposal(null);
  };

  const toggleSkillProficiency = (skillId: string) => {
    if (!draft) return;
    const currentSkills = getInitialDndSkills(draft.skills || []);
    const updatedSkills = currentSkills.map((sk) => {
      if (sk.id === skillId) {
        let nextProf: 'NONE' | 'PROFICIENT' | 'EXPERTISE' = 'PROFICIENT';
        if (sk.proficiency === 'NONE') nextProf = 'PROFICIENT';
        else if (sk.proficiency === 'PROFICIENT') nextProf = 'EXPERTISE';
        else nextProf = 'NONE';

        return {
          ...sk,
          proficiency: nextProf,
          isProficient: nextProf === 'PROFICIENT' || nextProf === 'EXPERTISE',
          isExpertise: nextProf === 'EXPERTISE',
          provenance: 'USER_EDITED' as CharacterProvenanceSource,
        };
      }
      return sk;
    });

    setDraft({ ...draft, skills: updatedSkills });
    markFieldEdited('skills');
  };

  // 5. Propose Custom Attribute (AI Proposal Review Gate)
  const handleProposeCustomAttribute = async () => {
    if (!selectedWorld) return;
    if (!customAttributeName.trim() && !customAttributeConcept.trim()) {
      setAttributeProposalError('Enter an attribute name or concept description.');
      return;
    }

    setAttributeProposalError(null);
    setIsProposingAttribute(true);

    try {
      const res = await apiClient.proposeCustomAttribute(
        selectedWorld.worldId,
        customAttributeName,
        customAttributeConcept || customAttributeName,
        'custom_attribute',
        {
          role: draft?.role?.role || draft?.role?.archetype || draft?.role?.profession,
          background: draft?.background?.history,
          species: draft?.identity?.species,
        }
      );

      if (res.success && res.attribute) {
        setPendingAttributeProposal(res.attribute);
      } else {
        throw new Error(res.error || 'Failed to propose custom attribute.');
      }
    } catch (err: any) {
      setAttributeProposalError(err.message || 'Error proposing custom attribute.');
    } finally {
      setIsProposingAttribute(false);
    }
  };

  const handleAcceptAttributeProposal = () => {
    if (!pendingAttributeProposal || !draft) return;
    setDraft({
      ...draft,
      attributes: [...(draft.attributes || []), pendingAttributeProposal],
    });

    markFieldEdited('attributes');
    setPendingAttributeProposal(null);
    setCustomAttributeName('');
    setCustomAttributeConcept('');
  };

  const handleRejectAttributeProposal = () => {
    setPendingAttributeProposal(null);
  };

  // 6. Propose Custom Equipment (AI Proposal Review Gate)
  const handleProposeCustomEquipment = async () => {
    if (!selectedWorld) return;
    if (!customEquipmentName.trim() && !customEquipmentDescription.trim()) {
      setEquipmentProposalError('Enter an equipment item name or concept description.');
      return;
    }

    setEquipmentProposalError(null);
    setIsProposingEquipment(true);

    try {
      const res = await apiClient.proposeCustomEquipment(
        selectedWorld.worldId,
        customEquipmentName,
        customEquipmentDescription || customEquipmentName,
        {
          role: draft?.role?.role || draft?.role?.archetype || draft?.role?.profession,
          background: draft?.background?.history,
          species: draft?.identity?.species,
        }
      );

      if (res.success && res.item) {
        setPendingEquipmentProposal(res.item);
      } else {
        throw new Error(res.error || 'Failed to propose custom equipment.');
      }
    } catch (err: any) {
      setEquipmentProposalError(err.message || 'Error proposing custom equipment.');
    } finally {
      setIsProposingEquipment(false);
    }
  };

  const handleAcceptEquipmentProposal = () => {
    if (!pendingEquipmentProposal || !draft) return;
    const normalizedItem = normalizeItemEquipmentMetadata(pendingEquipmentProposal);
    setDraft({
      ...draft,
      startingEquipment: {
        ...draft.startingEquipment,
        inventory: [...draft.startingEquipment.inventory, normalizedItem],
      },
    });

    markFieldEdited('startingEquipment');
    setPendingEquipmentProposal(null);
    setCustomEquipmentName('');
    setCustomEquipmentDescription('');
  };

  const handleRejectEquipmentProposal = () => {
    setPendingEquipmentProposal(null);
  };

  // Equipment Rules Engine Handler Functions
  const executeEquip = (itemToEquip: StartingEquipmentItem, targetSlot: EquipmentSlotId) => {
    if (!draft) return;
    const normalized = normalizeItemEquipmentMetadata(itemToEquip);
    const currentEquipped = draft.startingEquipment.equipped;
    const currentInventory = draft.startingEquipment.inventory;

    // Determine conflicting items currently equipped
    const conflicts = getConflictingEquippedItems(normalized, targetSlot, currentEquipped);
    const conflictIds = new Set(conflicts.map((c) => c.id));

    // Remove itemToEquip and any conflicting items from equipped array
    const remainingEquipped = currentEquipped.filter(
      (i) => i.id !== normalized.id && !conflictIds.has(i.id)
    );

    // Remove itemToEquip from inventory array
    const remainingInventory = currentInventory.filter((i) => i.id !== normalized.id);

    // Convert conflicting items back to unequipped inventory items
    const unequippedConflicts = conflicts.map((c) => ({
      ...c,
      isEquipped: false,
      slot: undefined,
      provenance: (c.provenance === 'PLAYER_INPUT' ? 'PLAYER_INPUT' : 'USER_EDITED') as CharacterProvenanceSource,
    }));

    const newlyEquippedItem: StartingEquipmentItem = {
      ...normalized,
      isEquipped: true,
      slot: targetSlot,
      provenance: (normalized.provenance === 'PLAYER_INPUT' ? 'PLAYER_INPUT' : 'USER_EDITED') as CharacterProvenanceSource,
    };

    setDraft({
      ...draft,
      startingEquipment: {
        ...draft.startingEquipment,
        equipped: [...remainingEquipped, newlyEquippedItem],
        inventory: [...remainingInventory, ...unequippedConflicts],
      },
    });

    markFieldEdited('startingEquipment');
    setInspectingItem(null);
    setSlotPickerModalItem(null);
    setPaperDollPickerSlot(null);
    setEquipConflictState(null);
  };

  const handleInitiateEquip = (item: StartingEquipmentItem, chosenSlot?: EquipmentSlotId) => {
    if (!draft) return;
    const normalized = normalizeItemEquipmentMetadata(item);
    if (!isEquipable(normalized)) return;

    if (chosenSlot) {
      if (!canEquipItemToSlot(normalized, chosenSlot)) return;
      const conflicts = getConflictingEquippedItems(normalized, chosenSlot, draft.startingEquipment.equipped);
      if (conflicts.length > 0) {
        setEquipConflictState({
          itemToEquip: normalized,
          targetSlot: chosenSlot,
          conflicts,
        });
      } else {
        executeEquip(normalized, chosenSlot);
      }
      return;
    }

    const compatibleSlots = getCompatibleEquipmentSlots(normalized);
    if (compatibleSlots.length === 0) return;
    if (compatibleSlots.length === 1) {
      handleInitiateEquip(normalized, compatibleSlots[0]);
    } else {
      setSlotPickerModalItem(normalized);
    }
  };

  const handleUnequipItem = (itemToUnequip: StartingEquipmentItem) => {
    if (!draft) return;
    const updatedEquipped = draft.startingEquipment.equipped.filter((i) => i.id !== itemToUnequip.id);
    const updatedInventory: StartingEquipmentItem[] = [
      ...draft.startingEquipment.inventory.filter((i) => i.id !== itemToUnequip.id),
      {
        ...itemToUnequip,
        isEquipped: false,
        slot: undefined,
        provenance: (itemToUnequip.provenance === 'PLAYER_INPUT' ? 'PLAYER_INPUT' : 'USER_EDITED') as CharacterProvenanceSource,
      },
    ];

    setDraft({
      ...draft,
      startingEquipment: {
        ...draft.startingEquipment,
        equipped: updatedEquipped,
        inventory: updatedInventory,
      },
    });

    markFieldEdited('startingEquipment');
    setInspectingItem(null);
  };

  const handleSaveIconFromStudio = (updatedIcon: ItemOrSkillIcon) => {
    if (!draft || !iconStudioTarget) return;
    const target = iconStudioTarget.itemOrSkill;

    if (iconStudioTarget.type === 'SKILL') {
      const updatedSkills = (draft.skills || []).map((sk) => {
        if (sk.id === target.id) {
          return { ...sk, icon: updatedIcon };
        }
        return sk;
      });
      setDraft({ ...draft, skills: updatedSkills });
      markFieldEdited('skills');
    } else {
      const isEquipped = draft.startingEquipment.equipped.some((i) => i.id === target.id);
      if (isEquipped) {
        const updatedEquipped = draft.startingEquipment.equipped.map((i) =>
          i.id === target.id ? { ...i, icon: updatedIcon } : i
        );
        setDraft({
          ...draft,
          startingEquipment: { ...draft.startingEquipment, equipped: updatedEquipped },
        });
      } else {
        const updatedInv = draft.startingEquipment.inventory.map((i) =>
          i.id === target.id ? { ...i, icon: updatedIcon } : i
        );
        setDraft({
          ...draft,
          startingEquipment: { ...draft.startingEquipment, inventory: updatedInv },
        });
      }
      markFieldEdited('startingEquipment');
    }

    setIconStudioTarget(null);
  };

  const handleDeleteItem = (itemId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      startingEquipment: {
        ...draft.startingEquipment,
        equipped: draft.startingEquipment.equipped.filter((i) => i.id !== itemId),
        inventory: draft.startingEquipment.inventory.filter((i) => i.id !== itemId),
      },
    });
    markFieldEdited('startingEquipment');
    setInspectingItem(null);
  };

  // Update Core D&D Stats with 1-20 limits on ability scores
  const updateCoreStat = (field: keyof CharacterCoreStats, value: any) => {
    if (!draft) return;
    const currentCore = draft.coreStats || {
      level: 1, armorClass: 10, speed: 30, hitDice: '1d8', hpCurrent: 10, hpMax: 10,
      strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10,
    };

    let updatedCore: CharacterCoreStats = { ...currentCore, [field]: value };

    if (['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(field)) {
      const numVal = Math.max(1, Math.min(20, Math.floor(Number(value) || 10)));
      (updatedCore as any)[field] = numVal;
    } else if (field === 'level') {
      updatedCore.level = Math.max(1, Math.min(30, Math.floor(Number(value) || 1)));
    } else if (field === 'armorClass') {
      updatedCore.armorClass = Math.max(1, Math.min(50, Math.floor(Number(value) || 10)));
    } else if (field === 'speed') {
      updatedCore.speed = Math.max(0, Math.min(300, Math.floor(Number(value) || 30)));
    } else if (field === 'hpMax') {
      const newMax = Math.max(1, Math.floor(Number(value) || 10));
      updatedCore.hpMax = newMax;
      if (updatedCore.hpCurrent > newMax) updatedCore.hpCurrent = newMax;
    } else if (field === 'hpCurrent') {
      const maxHp = updatedCore.hpMax || 10;
      updatedCore.hpCurrent = Math.max(0, Math.min(maxHp, Math.floor(Number(value) || 0)));
    }

    setDraft({
      ...draft,
      coreStats: updatedCore,
      startingState: {
        ...draft.startingState,
        healthCurrent: updatedCore.hpCurrent,
        healthMax: updatedCore.hpMax,
      },
    });
    markFieldEdited('coreStats');
  };

  // Delete Capability
  const handleDeleteCapability = (capId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      capabilities: draft.capabilities.filter((c) => c.id !== capId),
      // keep or unlink skills
    });
    markFieldEdited('capabilities');
  };

  // Delete Technique / Skill
  const handleDeleteTechnique = (skillId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      generatedSkills: draft.generatedSkills.filter((s) => s.id !== skillId),
    });
    markFieldEdited('generatedSkills');
  };

  // Save Draft to Server
  const handleSaveDraft = async () => {
    if (!selectedWorld || !draft) return;
    try {
      const revisedDraft = {
        ...draft,
        revision: (draft.revision || 0) + 1,
        revisionHistory: [
          ...(draft.revisionHistory || []).slice(-9),
          {
            revision: (draft.revision || 0) + 1,
            savedAt: new Date().toISOString(),
            label: 'Manual save',
            snapshot: JSON.parse(JSON.stringify(draft)),
          },
        ],
      };
      setDraft(revisedDraft);
      const res = await apiClient.saveCharacterDraft(selectedWorld.worldId, revisedDraft);
      if (res.success) {
        setSaveDraftStatus('Draft successfully saved to world archive.');
        setSavedDrafts((prev) => {
          const idx = prev.findIndex((d) => d.draftId === draft.draftId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = draft;
            return next;
          }
          return [...prev, draft];
        });
        setTimeout(() => setSaveDraftStatus(null), 3500);
      }
    } catch (err: any) {
      setSaveDraftStatus(`Failed to save draft: ${err.message}`);
    }
  };

  // Reload Draft
  const handleLoadDraft = (d: CharacterGenesisDraft) => {
    setDraft(d);
    setSelectedNarrativeRole(d.storyMode || 'PROTAGONIST');
    setShowDraftsModal(false);
    setActiveStep(2);
  };

  // Portrait AI generation / test fallback
  const handleGeneratePortrait = async () => {
    if (!draft) return;
    setIsGeneratingPortrait(true);
    try {
      const res = await apiClient.generateImage({
        prompt: draft.portraitAsset?.promptFallback || `Portrait of ${draft.identity.name}`,
        storyId: 'default_story',
      });
      if (res && res.imageUrl) {
        setDraft({
          ...draft,
          portraitAsset: {
            ...draft.portraitAsset!,
            imageUrl: res.imageUrl,
            isFallback: false,
            status: 'ready',
          },
        });
        markFieldEdited('portraitAsset');
      }
    } catch (err) {
      console.warn('Portrait generation failed, fallback preserved:', err);
    } finally {
      setIsGeneratingPortrait(false);
    }
  };

  // Explicit Character Confirmation (Strictly does NOT start a StoryRun!)
  const handleConfirmCharacter = async () => {
    if (!selectedWorld || !draft) return;
    setConfirmationError(null);
    setIsConfirming(true);

    try {
      const res = await apiClient.confirmCharacter(selectedWorld.worldId, draft);
      if (res.success && res.character) {
        setConfirmedCharacter(res.character);
        setConfirmedCharacters((prev) => [...prev, res.character]);
        if (onConfirmSuccess) {
          onConfirmSuccess(res.character);
        }
      } else {
        throw new Error(res.error || 'Failed to confirm character.');
      }
    } catch (err: any) {
      setConfirmationError(err.message || 'Error confirming character.');
    } finally {
      setIsConfirming(false);
    }
  };

  // Slice 3: Create and Launch StoryRun from Confirmed Character
  const handleStartStoryRun = async () => {
    if (!selectedWorld || !confirmedCharacter) return;
    setIsStartingRun(true);
    setStartRunError(null);

    try {
      const res = await apiClient.startWorldRun(selectedWorld.worldId, {
        confirmedCharacter,
        storyMode: confirmedCharacter.storyMode || 'PROTAGONIST',
      });
      if (res.success && res.storyId) {
        if (onStartStoryRun) {
          onStartStoryRun(res.storyId, res.run, res.openingScene);
        }
      } else {
        throw new Error(res.error || 'Failed to initialize story run.');
      }
    } catch (err: any) {
      setStartRunError(err.message || 'Error starting story run.');
    } finally {
      setIsStartingRun(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col">
      {/* Top Header / Context Bar */}
      <header className="border-b border-neutral-800 bg-neutral-950 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
              Character Genesis Workstation
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                Slice 2
              </span>
            </h1>
            <p className="text-xs text-neutral-400">
              Canonical Character Architect & Provenance Engine
            </p>
          </div>
        </div>

        {/* World Binding Badge & Selector */}
        <div className="flex items-center gap-3">
          {selectedWorld ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-xs">
              <span className="text-neutral-400">Target World:</span>
              <strong className="text-neutral-200">{selectedWorld.title}</strong>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                v{selectedWorld.worldManifestVersion}
              </span>
              {availableWorlds.length > 1 && (
                <button
                  onClick={() => setSelectedWorld(null)}
                  className="ml-2 text-indigo-400 hover:text-indigo-300 underline text-[11px]"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => onNavigateToWorldLibrary && onNavigateToWorldLibrary()}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-neutral-300"
            >
              Select World
            </button>
          )}

          {draft && (
            <button
              onClick={handleSaveDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-neutral-200 transition-colors"
            >
              <Save className="w-3.5 h-3.5 text-neutral-400" />
              <span>Save Draft</span>
            </button>
          )}

          <button
            onClick={() => setShowDraftsModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-neutral-200 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-neutral-400" />
            <span>Drafts ({savedDrafts.length})</span>
          </button>

          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-400 hover:text-white text-xs transition-colors"
            >
              Exit
            </button>
          )}
        </div>
      </header>

      {/* Save Draft Notification */}
      {saveDraftStatus && (
        <div className="bg-indigo-950/80 border-b border-indigo-800 px-6 py-2 text-xs text-indigo-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          <span>{saveDraftStatus}</span>
        </div>
      )}

      {/* Stepper Navigation */}
      <div className="border-b border-neutral-800 bg-neutral-950/60 px-6 py-2.5 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max text-xs">
          {[
            { step: 1, label: '1. Concept & Extraction', icon: Sparkles },
            { step: 2, label: '2. Identity & Bio', icon: User },
            { step: 3, label: '3. Capabilities & Skills', icon: Zap },
            { step: 4, label: '4. Stats & Attributes', icon: BarChart2 },
            { step: 5, label: '5. Starting Equipment', icon: Shield },
            { step: 6, label: '6. Location & Situation', icon: MapPin },
            { step: 7, label: '7. Portrait Studio', icon: ImageIcon },
            { step: 8, label: '8. Review & Confirm', icon: CheckCircle2 },
          ].map((item) => {
            const Icon = item.icon;
            const isCompleted = activeStep > item.step || (item.step === 1 && draft !== null);
            const isCurrent = activeStep === item.step;
            const isDisabled = item.step > 1 && !draft;

            return (
              <button
                key={item.step}
                disabled={isDisabled}
                onClick={() => setActiveStep(item.step)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  isCurrent
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : isCompleted
                    ? 'text-neutral-300 hover:bg-neutral-800'
                    : 'text-neutral-500 hover:bg-neutral-900/50 cursor-not-allowed'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6 min-w-0">
        {/* World Selection View if no world selected */}
        {!selectedWorld && (
          <div className="p-8 rounded-xl bg-neutral-950 border border-neutral-800 text-center max-w-xl mx-auto space-y-4 my-auto">
            <Compass className="w-10 h-10 text-indigo-400 mx-auto" />
            <h2 className="text-xl font-semibold text-white">Select a Target World</h2>
            <p className="text-sm text-neutral-400">
              Character Genesis binds your player character to the canonical rules, geography, and ontology of a specific world template.
            </p>
            <div className="grid grid-cols-1 gap-2 pt-2">
              {availableWorlds.map((w) => (
                <button
                  key={w.worldId}
                  onClick={() => setSelectedWorld(w)}
                  className="p-3 rounded-lg border border-neutral-800 hover:border-indigo-500/50 bg-neutral-900 text-left flex items-center justify-between transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{w.title}</div>
                    <div className="text-xs text-neutral-400">
                      {w.genreTags?.join(', ')} • v{w.worldManifestVersion}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-500" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 1: CONCEPT & NATURAL LANGUAGE EXTRACTION */}
        {selectedWorld && activeStep === 1 && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Natural Language Character Concept
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    Describe your character in everyday words. The engine will extract structured identity, background, motivations, capabilities, equipment, and starting conditions.
                  </p>
                </div>
                <span className="text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded-md">
                  Bound to: {selectedWorld.title} (v{selectedWorld.worldManifestVersion})
                </span>
              </div>

              {/* Concept Input */}
              <div className="space-y-2">
                <textarea
                  id="character-concept-input"
                  value={naturalConcept}
                  onChange={(e) => setNaturalConcept(e.target.value)}
                  placeholder="E.g., A weathered elven spellblade exiled from the high canopy for using forbidden shadow magic, seeking redemption across the borderlands..."
                  className="w-full h-32 p-4 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />

                {/* Preset Suggestions */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-neutral-400">Quick Inspirations:</span>
                  {PRESET_CONCEPTS.map((preset) => (
                    <button
                      type="button"
                      key={preset.label}
                      onClick={() => setNaturalConcept(preset.concept)}
                      className="text-xs px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {draft?.aiExtractionSummary && (
                <div className="rounded-lg border border-indigo-900/70 bg-indigo-950/30 p-4">
                  <button
                    type="button"
                    onClick={() => setShowInterpretation(!showInterpretation)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <span className="text-xs font-semibold text-indigo-300">AI Interpretation Before Editing</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showInterpretation ? 'rotate-180' : ''}`} />
                  </button>
                  {showInterpretation && (
                    <div className="mt-3 space-y-2 text-xs text-neutral-300">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-neutral-500">Extraction source</span>
                        <span
                          className={
                            draft.aiExtractionSummary.generationSource === 'DETERMINISTIC_FALLBACK'
                              ? 'text-[10px] px-2 py-0.5 rounded border border-amber-800 bg-amber-950/40 text-amber-300'
                              : draft.aiExtractionSummary.generationSource === 'AI_FALLBACK'
                              ? 'text-[10px] px-2 py-0.5 rounded border border-yellow-800 bg-yellow-950/30 text-yellow-300'
                              : 'text-[10px] px-2 py-0.5 rounded border border-indigo-800 bg-indigo-950/40 text-indigo-300'
                          }
                        >
                          {draft.aiExtractionSummary.generationSource || 'LEGACY_UNKNOWN'}
                        </span>
                      </div>
                      <p>{draft.aiExtractionSummary.interpretation}</p>
                      <div><span className="text-neutral-500">Key facts:</span> {draft.aiExtractionSummary.keyFacts.join(' • ') || 'None'}</div>
                      <div><span className="text-neutral-500">AI proposes:</span> {draft.aiExtractionSummary.proposedHighlights.join(' • ') || 'None'}</div>
                      {draft.aiExtractionSummary.uncertainties?.length ? (
                        <div className="text-amber-300"><span className="text-amber-400">Uncertainties:</span> {draft.aiExtractionSummary.uncertainties.join(' • ')}</div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {deterministicFallbackPrompt && (
                <div className="rounded-lg border border-amber-700/70 bg-amber-950/30 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-amber-200">AI character extraction is unavailable</div>
                      <p className="text-xs text-amber-100/80">
                        DreamBook could not get a usable AI result, so no character draft has been generated yet.
                      </p>
                      <p className="text-xs text-amber-100/80">
                        Continuing will use the deterministic concept extractor instead. It will preserve the concept you entered,
                        but it will not provide AI-generated interpretation.
                      </p>
                      {deterministicFallbackPrompt.reason && (
                        <p className="text-[11px] text-amber-300/70">Reason: {deterministicFallbackPrompt.reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDeterministicFallbackPrompt(null)}
                      className="px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
                    >
                      Keep Editing Concept
                    </button>
                    <button
                      type="button"
                      onClick={handleContinueWithDeterministicExtraction}
                      disabled={isExtracting}
                      className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors"
                    >
                      {isExtracting ? 'Building Deterministic Draft...' : 'Continue with Deterministic Extraction'}
                    </button>
                  </div>
                </div>
              )}

              {extractionError && (
                <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{extractionError}</span>
                </div>
              )}

              <div className="pt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-neutral-400">
                  {userEditedFields.size > 0 && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Edit3 className="w-3.5 h-3.5" />
                      {userEditedFields.size} custom field(s) will be strictly preserved during re-extraction
                    </span>
                  )}
                  </div>

                  <button
                    type="button"
                    id="btn-extract-character"
                    onClick={() => handleExtractCharacter()}
                    disabled={isExtracting || !naturalConcept.trim() || Boolean(deterministicFallbackPrompt)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors shadow-sm"
                  >
                  {isExtracting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Synthesizing Character Dossier...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Extract & Generate Character</span>
                    </>
                  )}
                </button>
                </div>

                {isExtracting && (
                  <div className="mt-3 w-full max-w-xl rounded-lg border border-indigo-900/70 bg-indigo-950/25 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-xs text-indigo-200">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:300ms]" />
                      </span>
                      <span>{extractionActivity || 'Working on your character...'}</span>
                      <span className="ml-auto text-[10px] text-indigo-300/70">{extractionElapsedSeconds}s</span>
                    </div>
                    {extractionModel && (
                      <div className="mt-1 text-[10px] text-neutral-400">
                        Active AI model: <span className="font-mono text-neutral-300">{extractionModel}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* AI CHARACTER GENERATION REVIEW GATE */}
            {pendingAiDraft && (
              <div className="p-6 rounded-xl bg-neutral-950 border-2 border-indigo-500/80 space-y-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-400" />
                      <h3 className="text-base font-bold text-white">AI Character Extraction Proposal</h3>
                      <span
                        className={
                          pendingAiDraft.aiExtractionSummary?.generationSource === 'DETERMINISTIC_FALLBACK'
                            ? 'text-xs px-2.5 py-0.5 rounded border border-amber-700 bg-amber-950/60 text-amber-300 font-mono'
                            : pendingAiDraft.aiExtractionSummary?.generationSource === 'AI_FALLBACK'
                            ? 'text-xs px-2.5 py-0.5 rounded border border-yellow-700 bg-yellow-950/50 text-yellow-300 font-mono'
                            : 'text-xs px-2.5 py-0.5 rounded border border-indigo-600 bg-indigo-950/60 text-indigo-300 font-mono'
                        }
                      >
                        {pendingAiDraft.aiExtractionSummary?.generationSource === 'DETERMINISTIC_FALLBACK'
                          ? 'Deterministic Extraction'
                          : pendingAiDraft.aiExtractionSummary?.generationSource === 'AI_FALLBACK'
                          ? 'Fallback AI Model'
                          : 'Primary AI Model'}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                      Review the AI's interpretation and proposed character before committing them to your active dossier.
                    </p>
                  </div>
                </div>

                {/* Interpretation Box */}
                <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2 text-xs">
                  <div className="font-semibold text-indigo-300 uppercase tracking-wider text-[11px]">
                    AI Interpretation & Synthesis
                  </div>
                  <p className="text-neutral-200 leading-relaxed text-sm">
                    {pendingAiDraft.aiExtractionSummary?.interpretation || 'Proposed character based on your natural language concept.'}
                  </p>

                  {pendingAiDraft.aiExtractionSummary?.keyFacts?.length ? (
                    <div className="pt-2 border-t border-neutral-800 flex flex-wrap items-center gap-1.5">
                      <span className="text-neutral-400 font-medium">Key Facts:</span>
                      {pendingAiDraft.aiExtractionSummary.keyFacts.map((fact, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px]">
                          {fact}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {pendingAiDraft.aiExtractionSummary?.proposedHighlights?.length ? (
                    <div className="pt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-neutral-400 font-medium font-semibold">AI Highlights:</span>
                      {pendingAiDraft.aiExtractionSummary.proposedHighlights.map((hl, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 text-[11px]">
                          {hl}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {pendingAiDraft.aiExtractionSummary?.uncertainties?.length ? (
                    <div className="pt-1 text-amber-300 text-[11px]">
                      <span className="font-semibold text-amber-400">Uncertainties / Assumptions:</span>{' '}
                      {pendingAiDraft.aiExtractionSummary.uncertainties.join(' • ')}
                    </div>
                  ) : null}
                </div>

                {/* Proposed Character Card Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-lg bg-neutral-900/90 border border-neutral-800 space-y-2">
                    <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Proposed Identity & Role
                    </div>
                    <div className="text-base font-bold text-white">{pendingAiDraft.identity.name}</div>
                    <div className="text-neutral-300">
                      {pendingAiDraft.identity.species} • {pendingAiDraft.role.profession || pendingAiDraft.role.archetype}
                    </div>
                    <div className="text-neutral-400 text-[11px] line-clamp-3">
                      {pendingAiDraft.appearance.physicalDescription}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-neutral-900/90 border border-neutral-800 space-y-2">
                    <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Core D&D Stats & Capabilities
                    </div>
                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-indigo-300 font-semibold">
                      <div>Lvl: {pendingAiDraft.coreStats?.level ?? 1}</div>
                      <div>AC: {pendingAiDraft.coreStats?.armorClass ?? 10}</div>
                      <div>Speed: {pendingAiDraft.coreStats?.speed ?? 30}ft</div>
                      <div>HD: {pendingAiDraft.coreStats?.hitDice ?? '1d8'}</div>
                      <div>HP: {pendingAiDraft.coreStats?.hpCurrent ?? 10}/{pendingAiDraft.coreStats?.hpMax ?? 10}</div>
                    </div>
                    <div className="pt-1 text-[11px] font-mono text-neutral-400">
                      STR {pendingAiDraft.coreStats?.strength ?? 10} • DEX {pendingAiDraft.coreStats?.dexterity ?? 10} • CON {pendingAiDraft.coreStats?.constitution ?? 10} • INT {pendingAiDraft.coreStats?.intelligence ?? 10} • WIS {pendingAiDraft.coreStats?.wisdom ?? 10} • CHA {pendingAiDraft.coreStats?.charisma ?? 10}
                    </div>
                    <div className="pt-1 text-neutral-300">
                      <span className="text-neutral-500">Capabilities ({pendingAiDraft.capabilities?.length || 0}):</span>{' '}
                      {pendingAiDraft.capabilities?.map((c) => c.name).join(', ') || 'None'}
                    </div>
                  </div>
                </div>

                {/* Review Gate Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={handleRejectPendingAiDraft}
                    className="px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-300 hover:text-white transition-colors"
                  >
                    Change / Keep Editing Concept
                  </button>
                  <button
                    type="button"
                    id="btn-use-proposed-character"
                    onClick={handleAcceptPendingAiDraft}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Use This Character & Continue</span>
                  </button>
                </div>
              </div>
            )}

            {/* World Context Snapshot Card */}
            <div className="p-5 rounded-xl bg-neutral-950/60 border border-neutral-800/80 space-y-3">
              <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-neutral-400" />
                World Canonical Context
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div className="text-neutral-400">Genre & Tone</div>
                  <div className="font-medium text-neutral-200 mt-0.5">
                    {selectedWorld.genreTags?.join(', ')} • {selectedWorld.toneTags?.join(', ')}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div className="text-neutral-400">Era & Setting</div>
                  <div className="font-medium text-neutral-200 mt-0.5">
                    {selectedWorld.defaultEra || 'Current Era'} • {selectedWorld.setting || 'Known Realm'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div className="text-neutral-400">Rules & Canon</div>
                  <div className="font-medium text-neutral-200 mt-0.5">
                    {selectedWorld.canonMode || 'Canon'} • {selectedWorld.rulesetId || 'Standard'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div className="text-neutral-400">Known Geography</div>
                  <div className="font-medium text-neutral-200 mt-0.5">
                    {selectedWorld.geography?.nodes?.length || 0} Canonical Nodes
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: DOSSIER & STRUCTURED FIELDS */}
        {draft && activeStep === 2 && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-neutral-950 border border-neutral-800 space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-400" />
                    Identity & Background Dossier
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Fine-tune demographic, psychological, and historical attributes. Manual edits are permanently marked with USER_EDITED provenance.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleFieldLock('identity')}
                    className="text-[10px] px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-400"
                  >
                    {isFieldLocked('identity') ? '🔒 Identity locked' : '🔓 Lock identity'}
                  </button>
                  <button
                    onClick={() => toggleFieldLock('capabilities')}
                    className="text-[10px] px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-400"
                  >
                    {isFieldLocked('capabilities') ? '🔒 Capabilities locked' : '🔓 Lock capabilities'}
                  </button>
                  <span className="text-xs text-neutral-400 font-mono">Draft {draft.draftId.slice(0, 10)}…</span>
                </div>
              </div>

              {/* 1. Identity Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Core Identity
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Character Name</label>
                    <input
                      type="text"
                      id="input-identity-name"
                      value={draft.identity.name}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          identity: { ...draft.identity, name: e.target.value },
                        });
                        markFieldEdited('identity');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Species / Race</label>
                    <input
                      type="text"
                      value={draft.identity.species}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          identity: { ...draft.identity, species: e.target.value },
                        });
                        markFieldEdited('identity');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Age</label>
                    <input
                      type="text"
                      value={draft.identity.age}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          identity: { ...draft.identity, age: e.target.value },
                        });
                        markFieldEdited('identity');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Gender</label>
                    <input
                      type="text"
                      value={draft.identity.gender || ''}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          identity: { ...draft.identity, gender: e.target.value },
                        });
                        markFieldEdited('identity');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Role & Archetype */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Role & Archetype
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Archetype</label>
                    <input
                      type="text"
                      value={draft.role.archetype}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          role: { ...draft.role, archetype: e.target.value },
                        });
                        markFieldEdited('role');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Profession</label>
                    <input
                      type="text"
                      value={draft.role.profession}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          role: { ...draft.role, profession: e.target.value },
                        });
                        markFieldEdited('role');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Narrative Role</label>
                    <select
                      value={draft.storyMode || 'PROTAGONIST'}
                      onChange={(e) => {
                        const mode = e.target.value as CharacterStoryMode;
                        const roleLabel =
                          mode === 'PROTAGONIST'
                            ? 'Protagonist'
                            : mode === 'SIDE_CHARACTER'
                            ? 'Side Character'
                            : 'Free Roam';
                        setSelectedNarrativeRole(mode);
                        setDraft({
                          ...draft,
                          storyMode: mode,
                          role: { ...draft.role, role: roleLabel },
                          provenance: {
                            ...draft.provenance,
                            role: 'USER_EDITED',
                          },
                          fieldLocks: Array.from(new Set([...(draft.fieldLocks || []), 'storyMode', 'role'])),
                        });
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      {NARRATIVE_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
                      {NARRATIVE_ROLE_OPTIONS.find((option) => option.value === (draft.storyMode || 'PROTAGONIST'))?.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Appearance & Distinguishing Traits */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Appearance
                </h3>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Physical Description</label>
                  <textarea
                    rows={2}
                    value={draft.appearance.physicalDescription}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        appearance: { ...draft.appearance, physicalDescription: e.target.value },
                      });
                      markFieldEdited('appearance');
                    }}
                    className="w-full p-3 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Distinguishing Traits (Comma Separated)</label>
                  <input
                    type="text"
                    value={draft.appearance.distinguishingTraits.join(', ')}
                    onChange={(e) => {
                      const traits = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
                      setDraft({
                        ...draft,
                        appearance: { ...draft.appearance, distinguishingTraits: traits },
                      });
                      markFieldEdited('appearance');
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 4. Background & History */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Background & Upbringing
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">History</label>
                    <textarea
                      rows={3}
                      value={draft.background.history}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          background: { ...draft.background, history: e.target.value },
                        });
                        markFieldEdited('background');
                      }}
                      className="w-full p-3 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Upbringing / Origin</label>
                    <textarea
                      rows={3}
                      value={draft.background.upbringing}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          background: { ...draft.background, upbringing: e.target.value },
                        });
                        markFieldEdited('background');
                      }}
                      className="w-full p-3 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* 5. Motivations (Goals, Fears, Desires) */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Psychology & Motivations
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Goals</label>
                    <input
                      type="text"
                      value={draft.motivations.goals.join(', ')}
                      onChange={(e) => {
                        const goals = e.target.value.split(',').map((g) => g.trim()).filter(Boolean);
                        setDraft({
                          ...draft,
                          motivations: { ...draft.motivations, goals },
                        });
                        markFieldEdited('motivations');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Fears</label>
                    <input
                      type="text"
                      value={draft.motivations.fears.join(', ')}
                      onChange={(e) => {
                        const fears = e.target.value.split(',').map((f) => f.trim()).filter(Boolean);
                        setDraft({
                          ...draft,
                          motivations: { ...draft.motivations, fears },
                        });
                        markFieldEdited('motivations');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Desires</label>
                    <input
                      type="text"
                      value={draft.motivations.desires.join(', ')}
                      onChange={(e) => {
                        const desires = e.target.value.split(',').map((d) => d.trim()).filter(Boolean);
                        setDraft({
                          ...draft,
                          motivations: { ...draft.motivations, desires },
                        });
                        markFieldEdited('motivations');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveStep(1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Concept</span>
              </button>
              <button
                onClick={() => setActiveStep(3)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
              >
                <span>Proceed to Capabilities</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CAPABILITIES & SKILLS / TECHNIQUES */}
        {draft && activeStep === 3 && (
          <div className="space-y-6">
            {/* Custom Capability Proposal Bar */}
            <div className="p-5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
              <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                Propose Custom Capability (AI Synthesis)
              </h3>
              <p className="text-xs text-neutral-400">
                Propose a unique supernatural power, combat technique, or domain mastery. The engine will synthesize a structured capability schema and derive complementary techniques linked by lineage.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  id="input-custom-capability"
                  value={customCapInput}
                  onChange={(e) => setCustomCapInput(e.target.value)}
                  placeholder="E.g., Shadow Manipulation, Chrono-Stutter, Blood Siphon..."
                  className="flex-1 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  id="btn-propose-capability"
                  onClick={handleProposeCustomCapability}
                  disabled={isProposingCap || !customCapInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-colors"
                >
                  {isProposingCap ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Synthesize Capability</span>
                </button>
              </div>
              {capProposalError && (
                <div className="text-xs text-red-400">{capProposalError}</div>
              )}

              {/* Review Gate for Pending Capability Proposal */}
              {pendingCapProposal && (
                <div className="p-4 rounded-xl bg-indigo-950/70 border-2 border-indigo-500 space-y-3 mt-3 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span>Synthesized Capability Proposal</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-900 text-indigo-200 border border-indigo-700 font-mono">
                      {pendingCapProposal.powerTier || 'TIER_1'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-white">{pendingCapProposal.name}</div>
                  <p className="text-xs text-neutral-300 leading-relaxed">{pendingCapProposal.description}</p>
                  {pendingCapProposal.generatedSkills?.length ? (
                    <div className="text-xs text-indigo-200 pt-1 border-t border-indigo-900/80">
                      <span className="font-semibold text-neutral-400">Derived Techniques ({pendingCapProposal.generatedSkills.length}):</span>{' '}
                      {pendingCapProposal.generatedSkills.map((s) => s.name).join(', ')}
                    </div>
                  ) : null}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-900">
                    <button
                      onClick={handleRejectCapProposal}
                      className="px-3 py-1.5 rounded bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 hover:text-white"
                    >
                      Reject
                    </button>
                    <button
                      id="btn-accept-capability"
                      onClick={handleAcceptCapProposal}
                      className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Accept & Add Capability</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Capabilities Cards */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center justify-between">
                <span>Active Capabilities ({draft.capabilities.length})</span>
                <span className="text-[11px] text-neutral-500 font-normal">
                  Underlying potential & power pool
                </span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {draft.capabilities.map((cap) => (
                  <div
                    key={cap.id}
                    className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3 relative group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                          {cap.name}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 font-mono">
                            {cap.powerTier}
                          </span>
                        </h4>
                        <div className="text-xs text-neutral-400 mt-0.5">
                          {cap.category} • Mode: {cap.activationMode || 'immediate'}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteCapability(cap.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-500 hover:text-red-400 transition-opacity"
                        title="Remove Capability"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs text-neutral-300 leading-relaxed">
                      {cap.description}
                    </p>

                    <div className="flex items-center gap-4 text-[11px] text-neutral-400 border-t border-neutral-800/80 pt-2 font-mono">
                      <span>Cost: {cap.baseEnergyCost ?? 15} Energy</span>
                      <span>Strain: {cap.baseStrainCost ?? 5}</span>
                      <span className="ml-auto text-[10px] text-indigo-400 uppercase">
                        {cap.provenance || 'AI_GENERATED'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Generated Skills / Techniques Lineage */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center justify-between">
                <span>Derived Techniques & Skills ({draft.generatedSkills.length})</span>
                <span className="text-[11px] text-neutral-500 font-normal">
                  Concrete combat & spell expressions linked to parent capabilities
                </span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {draft.generatedSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2 relative group"
                  >
                    <div className="flex items-start justify-between">
                      <h5 className="text-xs font-semibold text-white">{skill.name}</h5>
                      <button
                        onClick={() => handleDeleteTechnique(skill.id)}
                        className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-opacity"
                        title="Delete Technique (Preserves parent capability)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      {skill.description}
                    </p>

                    <div className="text-[10px] text-indigo-300/80 pt-1 border-t border-neutral-800/60 flex items-center justify-between font-mono">
                      <span>Lineage: {skill.parentCapabilityName}</span>
                      <span>{skill.range || 'Close'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setActiveStep(2)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Dossier</span>
              </button>
              <button
                onClick={() => setActiveStep(4)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
              >
                <span>Proceed to Stats & Attributes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: DEDICATED STATS & ATTRIBUTES TAB */}
        {draft && activeStep === 4 && (
          <div className="space-y-6">
            {/* Core D&D Stats Card */}
            <div className="p-6 rounded-xl bg-neutral-950 border border-neutral-800 space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-indigo-400" />
                    Permanent D&D Core Stats & Abilities
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Configure official D&D combat statistics and core ability scores (clamped between 1 and 20).
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  D&D 5e Ruleset
                </span>
              </div>

              {/* Combat Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400">Level</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={draft.coreStats?.level ?? 1}
                    onChange={(e) => updateCoreStat('level', e.target.value)}
                    className="w-full px-2 py-1 rounded bg-neutral-950 border border-neutral-700 font-mono text-sm text-white font-bold"
                  />
                </div>
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400">Armor Class (AC)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={draft.coreStats?.armorClass ?? 10}
                    onChange={(e) => updateCoreStat('armorClass', e.target.value)}
                    className="w-full px-2 py-1 rounded bg-neutral-950 border border-neutral-700 font-mono text-sm text-white font-bold"
                  />
                </div>
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400">Speed (ft)</label>
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={draft.coreStats?.speed ?? 30}
                    onChange={(e) => updateCoreStat('speed', e.target.value)}
                    className="w-full px-2 py-1 rounded bg-neutral-950 border border-neutral-700 font-mono text-sm text-white font-bold"
                  />
                </div>
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400">Hit Dice</label>
                  <input
                    type="text"
                    value={draft.coreStats?.hitDice ?? '1d8'}
                    onChange={(e) => updateCoreStat('hitDice', e.target.value)}
                    className="w-full px-2 py-1 rounded bg-neutral-950 border border-neutral-700 font-mono text-sm text-white font-bold"
                  />
                </div>
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400">Current HP</label>
                  <input
                    type="number"
                    min={0}
                    max={draft.coreStats?.hpMax ?? 10}
                    value={draft.coreStats?.hpCurrent ?? 10}
                    onChange={(e) => updateCoreStat('hpCurrent', e.target.value)}
                    className="w-full px-2 py-1 rounded bg-neutral-950 border border-neutral-700 font-mono text-sm text-emerald-400 font-bold"
                  />
                </div>
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400">Max HP</label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={draft.coreStats?.hpMax ?? 10}
                    onChange={(e) => updateCoreStat('hpMax', e.target.value)}
                    className="w-full px-2 py-1 rounded bg-neutral-950 border border-neutral-700 font-mono text-sm text-emerald-400 font-bold"
                  />
                </div>
              </div>

              {/* 6 Core Ability Scores Grid */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Core Ability Scores (1 - 20)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {[
                    { key: 'strength', label: 'Strength (STR)', score: draft.coreStats?.strength ?? 10 },
                    { key: 'dexterity', label: 'Dexterity (DEX)', score: draft.coreStats?.dexterity ?? 10 },
                    { key: 'constitution', label: 'Constitution (CON)', score: draft.coreStats?.constitution ?? 10 },
                    { key: 'intelligence', label: 'Intelligence (INT)', score: draft.coreStats?.intelligence ?? 10 },
                    { key: 'wisdom', label: 'Wisdom (WIS)', score: draft.coreStats?.wisdom ?? 10 },
                    { key: 'charisma', label: 'Charisma (CHA)', score: draft.coreStats?.charisma ?? 10 },
                  ].map((stat) => {
                    const mod = Math.floor((stat.score - 10) / 2);
                    const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
                    return (
                      <div key={stat.key} className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 text-center space-y-1">
                        <div className="text-[11px] font-semibold text-neutral-300 uppercase">{stat.key.slice(0, 3)}</div>
                        <div className="text-[10px] text-neutral-500">{stat.label}</div>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={stat.score}
                          onChange={(e) => updateCoreStat(stat.key as any, e.target.value)}
                          className="w-16 mx-auto text-center px-2 py-1 rounded bg-neutral-950 border border-neutral-700 font-mono text-base font-bold text-white focus:outline-none focus:border-indigo-500"
                        />
                        <div className="text-xs font-mono font-bold text-indigo-400 pt-0.5">
                          Modifier: {modStr}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* D&D Skills & Proficiencies Card */}
            <div className="p-6 rounded-xl bg-neutral-950 border border-neutral-800 space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    D&D Skills & Proficiencies
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    18 official D&D 5e skills automatically initialized and calculated from ability modifiers and proficiency bonus.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    PB: +{Math.floor(( (draft.coreStats?.level || 1) - 1) / 4) + 2}
                  </span>
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
                    Proficient: {(draft.skills || []).filter(s => s.proficiency === 'PROFICIENT' || s.proficiency === 'EXPERTISE').length}
                  </span>
                </div>
              </div>

              {/* Skills Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
                {getInitialDndSkills(draft.skills || []).map((skill) => {
                  const modObj = calculateSkillModifier(skill, draft.coreStats);
                  const modStr = modObj.modString;
                  return (
                    <div
                      key={skill.id}
                      className={`p-2.5 rounded-lg border transition-all flex items-center justify-between text-xs ${
                        skill.proficiency === 'EXPERTISE'
                          ? 'bg-purple-950/40 border-purple-500/50'
                          : skill.proficiency === 'PROFICIENT'
                          ? 'bg-emerald-950/40 border-emerald-500/50'
                          : 'bg-neutral-900 border-neutral-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Icon & Icon Studio Button */}
                        <div className="relative group/icon shrink-0">
                          <div className="w-7 h-7 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-center text-sm overflow-hidden shadow-inner">
                            {skill.icon?.url ? (
                              <img src={skill.icon.url} alt={skill.name} className="w-full h-full object-cover" />
                            ) : (
                              <span>{getDefaultIconForSkill(skill).emoji}</span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIconStudioTarget({ itemOrSkill: skill, type: 'SKILL' });
                            }}
                            className="absolute -top-1 -right-1 p-0.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white opacity-0 group-hover/icon:opacity-100 transition-opacity text-[9px] shadow z-10"
                            title="Customize Icon in Icon Studio"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                          </button>
                        </div>

                        <button
                          onClick={() => setInspectingSkill(skill)}
                          className="text-neutral-500 hover:text-indigo-300 shrink-0"
                          title="Inspect skill details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{skill.name}</span>
                            {skill.isCustom && (
                              <span className="text-[9px] px-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono shrink-0">
                                CUSTOM
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-400 font-mono">
                            {skill.governingAbility.slice(0, 3)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs font-bold text-indigo-300">
                          {modStr}
                        </span>
                        <button
                          onClick={() => toggleSkillProficiency(skill.id)}
                          className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase font-semibold transition-all ${
                            skill.proficiency === 'EXPERTISE'
                              ? 'bg-purple-600 text-white shadow-sm'
                              : skill.proficiency === 'PROFICIENT'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
                          }`}
                          title="Click to cycle: None -> Proficient -> Expertise -> None"
                        >
                          {skill.proficiency === 'EXPERTISE' ? 'EXP' : skill.proficiency === 'PROFICIENT' ? 'PROF' : '—'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AI Custom Skill Synthesis */}
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3 pt-3">
                <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>AI Custom Skill Synthesis</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customSkillName}
                    onChange={(e) => setCustomSkillName(e.target.value)}
                    placeholder="Custom skill name (e.g. Void Navigation)"
                    className="px-3 py-2 rounded bg-neutral-950 border border-neutral-700 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={customSkillConcept}
                    onChange={(e) => setCustomSkillConcept(e.target.value)}
                    placeholder="Skill concept or mechanical usage"
                    className="px-3 py-2 rounded bg-neutral-950 border border-neutral-700 text-xs text-white"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    id="btn-propose-skill"
                    onClick={handleProposeCustomSkill}
                    disabled={isProposingSkill || (!customSkillName.trim() && !customSkillConcept.trim())}
                    className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-medium flex items-center gap-1.5 shadow-sm"
                  >
                    {isProposingSkill ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Synthesize AI Skill</span>
                  </button>
                </div>
                {skillProposalError && <div className="text-xs text-red-400">{skillProposalError}</div>}

                {/* Skill Proposal Review Gate */}
                {pendingSkillProposal && (
                  <div className="p-4 rounded-lg bg-indigo-950/70 border-2 border-indigo-500 space-y-2 mt-2 shadow-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-300 uppercase">
                        AI Proposed Skill: {pendingSkillProposal.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-900 text-indigo-200 border border-indigo-700 font-mono">
                        Governing: {pendingSkillProposal.governingAbility}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">{pendingSkillProposal.description}</p>
                    {pendingSkillProposal.mechanicalDescription && (
                      <div className="text-xs text-indigo-200 font-mono pt-1 border-t border-indigo-900">
                        <span className="text-neutral-400">Mechanics:</span> {pendingSkillProposal.mechanicalDescription}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-900">
                      <button
                        onClick={handleRejectSkillProposal}
                        className="px-3 py-1 rounded bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 hover:text-white"
                      >
                        Reject
                      </button>
                      <button
                        id="btn-accept-skill"
                        onClick={handleAcceptSkillProposal}
                        className="px-3.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept & Add Skill</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Extensible Custom Attributes & Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Custom Attributes & World Stats */}
              <div className="p-5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5" />
                    Custom Attributes & World Stats ({draft.attributes?.length || 0})
                  </h3>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(draft.attributes || []).map((entry) => (
                    <div key={entry.id} className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-semibold">{entry.name}</span>
                        <div className="flex items-center gap-2">
                          {entry.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono">
                              {entry.category}
                            </span>
                          )}
                          <input
                            type="number"
                            value={entry.value}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setDraft({
                                ...draft,
                                attributes: draft.attributes?.map((a) => (a.id === entry.id ? { ...a, value: val } : a)),
                              });
                              markFieldEdited('attributes');
                            }}
                            className="w-16 px-2 py-0.5 rounded bg-neutral-950 border border-neutral-700 text-right font-mono text-indigo-300 font-bold focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                      {entry.description && (
                        <p className="text-[11px] text-neutral-400 leading-tight">{entry.description}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* AI Custom Attribute Generator */}
                <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3 pt-3">
                  <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>AI Custom Attribute Generator</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={customAttributeName}
                      onChange={(e) => setCustomAttributeName(e.target.value)}
                      placeholder="Attribute name (e.g. Mana Pool)"
                      className="px-3 py-2 rounded bg-neutral-950 border border-neutral-700 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={customAttributeConcept}
                      onChange={(e) => setCustomAttributeConcept(e.target.value)}
                      placeholder="Concept or mechanical role"
                      className="px-3 py-2 rounded bg-neutral-950 border border-neutral-700 text-xs text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      id="btn-propose-attribute"
                      onClick={handleProposeCustomAttribute}
                      disabled={isProposingAttribute || (!customAttributeName.trim() && !customAttributeConcept.trim())}
                      className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-medium flex items-center gap-1.5 shadow-sm"
                    >
                      {isProposingAttribute ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>Synthesize AI Attribute</span>
                    </button>
                    <button
                      onClick={() => addCustomStat('attribute')}
                      disabled={!customAttributeName.trim()}
                      className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-xs text-neutral-300 font-medium"
                    >
                      Add Manual
                    </button>
                  </div>
                  {attributeProposalError && <div className="text-xs text-red-400">{attributeProposalError}</div>}

                  {/* Attribute Proposal Review Gate */}
                  {pendingAttributeProposal && (
                    <div className="p-4 rounded-lg bg-indigo-950/70 border-2 border-indigo-500 space-y-2 mt-2 shadow-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-300 uppercase">
                          AI Proposed Attribute: {pendingAttributeProposal.name}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-300">
                          Base Val: {pendingAttributeProposal.baseValue}
                        </span>
                      </div>
                      {pendingAttributeProposal.description && (
                        <p className="text-xs text-neutral-300 leading-relaxed">{pendingAttributeProposal.description}</p>
                      )}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-900">
                        <button
                          onClick={handleRejectAttributeProposal}
                          className="px-3 py-1 rounded bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 hover:text-white"
                        >
                          Reject
                        </button>
                        <button
                          id="btn-accept-attribute"
                          onClick={handleAcceptAttributeProposal}
                          className="px-3.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept Attribute</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Feats & Titles + AI Custom Feat Generator */}
              <div className="p-5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Feats, Titles & Special Traits ({draft.feats?.length || 0})
                  </h3>
                </div>

                {/* List of Feats */}
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(draft.feats || []).map((feat) => (
                    <div key={feat.id} className="rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-white">{feat.name}</div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                          {feat.tags?.[0] || 'FEAT'}
                        </span>
                      </div>
                      <div className="text-neutral-400 text-[11px] leading-relaxed">{feat.description}</div>
                      {feat.effects?.length ? (
                        <div className="text-indigo-300 text-[10px] font-mono pt-1 border-t border-neutral-800">
                          {feat.effects.map((e) => `${e.type || 'Effect'}: ${e.description}`).join(' • ')}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {/* AI Feat Synthesis Generator */}
                <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3 pt-3">
                  <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>AI Custom Feat Generator</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={customFeatName}
                      onChange={(e) => setCustomFeatName(e.target.value)}
                      placeholder="Feat concept name (e.g., Shadow Walker)"
                      className="px-3 py-2 rounded bg-neutral-950 border border-neutral-700 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={customFeatDescription}
                      onChange={(e) => setCustomFeatDescription(e.target.value)}
                      placeholder="Desired mechanical effect"
                      className="px-3 py-2 rounded bg-neutral-950 border border-neutral-700 text-xs text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      id="btn-propose-feat"
                      onClick={handleProposeCustomFeat}
                      disabled={isProposingFeat || (!customFeatName.trim() && !customFeatDescription.trim())}
                      className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-medium flex items-center gap-1.5 shadow-sm"
                    >
                      {isProposingFeat ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>Synthesize AI Feat</span>
                    </button>
                    <button
                      onClick={addCustomFeat}
                      disabled={!customFeatName.trim()}
                      className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-xs text-neutral-300 font-medium"
                    >
                      Add Manual Feat
                    </button>
                  </div>
                  {featProposalError && <div className="text-xs text-red-400">{featProposalError}</div>}

                  {/* Feat Proposal Review Gate */}
                  {pendingFeatProposal && (
                    <div className="p-4 rounded-lg bg-indigo-950/70 border-2 border-indigo-500 space-y-2 mt-2 shadow-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-300 uppercase">
                          AI Proposed Feat: {pendingFeatProposal.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-900 text-indigo-200 border border-indigo-700 font-mono">
                          {pendingFeatProposal.tags?.[0] || 'FEAT'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-300 leading-relaxed">{pendingFeatProposal.description}</p>
                      {pendingFeatProposal.effects?.length ? (
                        <div className="text-xs text-indigo-200 font-mono pt-1 border-t border-indigo-900">
                          <span className="text-neutral-400">Effects:</span>{' '}
                          {pendingFeatProposal.effects.map((e) => `${e.type || 'Effect'}: ${e.description}`).join(' • ')}
                        </div>
                      ) : null}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-900">
                        <button
                          onClick={handleRejectFeatProposal}
                          className="px-3 py-1 rounded bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 hover:text-white"
                        >
                          Reject
                        </button>
                        <button
                          id="btn-accept-feat"
                          onClick={handleAcceptFeatProposal}
                          className="px-3.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept Feat</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setActiveStep(3)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Capabilities</span>
              </button>
              <button
                onClick={() => setActiveStep(5)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
              >
                <span>Proceed to Equipment</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: STARTING EQUIPMENT & PAPER DOLL */}
        {draft && activeStep === 5 && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-neutral-950 border border-neutral-800 space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    Starting Equipment Loadout & Paper Doll
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Configure active equipped paper-doll slots and carried pack supplies with interactive inspection.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    Equipped: {draft.startingEquipment.equipped.length} items
                  </span>
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
                    Inventory: {draft.startingEquipment.inventory.length} items
                  </span>
                </div>
              </div>

              {/* AI Custom Equipment Synthesis */}
              <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
                <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>AI Custom Equipment Synthesis</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customEquipmentName}
                    onChange={(e) => setCustomEquipmentName(e.target.value)}
                    placeholder="Item concept (e.g. Solar Dagger)"
                    className="px-3 py-2 rounded bg-neutral-950 border border-neutral-700 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={customEquipmentDescription}
                    onChange={(e) => setCustomEquipmentDescription(e.target.value)}
                    placeholder="Desired properties / mechanical effect"
                    className="px-3 py-2 rounded bg-neutral-950 border border-neutral-700 text-xs text-white"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    id="btn-propose-equipment"
                    onClick={handleProposeCustomEquipment}
                    disabled={isProposingEquipment || (!customEquipmentName.trim() && !customEquipmentDescription.trim())}
                    className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-medium flex items-center gap-1.5 shadow-sm"
                  >
                    {isProposingEquipment ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Synthesize AI Item</span>
                  </button>
                  <button
                    onClick={addCustomEquipment}
                    disabled={!customEquipmentName.trim()}
                    className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-xs text-neutral-300 font-medium"
                  >
                    Add Manual Item
                  </button>
                </div>
                {equipmentProposalError && <div className="text-xs text-red-400">{equipmentProposalError}</div>}

                {/* Equipment Proposal Review Gate */}
                {pendingEquipmentProposal && (
                  <div className="p-4 rounded-lg bg-indigo-950/70 border-2 border-indigo-500 space-y-2 mt-2 shadow-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-300 uppercase">
                        AI Proposed Equipment: {pendingEquipmentProposal.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-900 text-indigo-200 border border-indigo-700 font-mono">
                        {pendingEquipmentProposal.category} • Slot: {pendingEquipmentProposal.slot || 'Inventory'}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">{pendingEquipmentProposal.description}</p>
                    {pendingEquipmentProposal.properties ? (
                      <div className="text-xs text-indigo-200 font-mono pt-1 border-t border-indigo-900">
                        <span className="text-neutral-400">Properties:</span>{' '}
                        {Array.isArray(pendingEquipmentProposal.properties)
                          ? (pendingEquipmentProposal.properties as any[]).join(', ')
                          : Object.entries(pendingEquipmentProposal.properties).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </div>
                    ) : null}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-900">
                      <button
                        onClick={handleRejectEquipmentProposal}
                        className="px-3 py-1 rounded bg-neutral-900 border border-neutral-700 text-xs text-neutral-300 hover:text-white"
                      >
                        Reject
                      </button>
                      <button
                        id="btn-accept-equipment"
                        onClick={handleAcceptEquipmentProposal}
                        className="px-3.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept & Add Item</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Visual Paper Doll */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-400" />
                  Equipped Paper-Doll Slots
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {[
                    { key: 'head', label: 'Head', icon: User },
                    { key: 'neck', label: 'Neck / Amulet', icon: Shield },
                    { key: 'back', label: 'Back / Cloak', icon: Shield },
                    { key: 'body', label: 'Body Armor', icon: Shield },
                    { key: 'mainHand', label: 'Main Hand', icon: Sword },
                    { key: 'offHand', label: 'Off Hand / Shield', icon: Shield },
                    { key: 'gloves', label: 'Gloves / Hands', icon: User },
                    { key: 'belt', label: 'Waist / Belt', icon: Briefcase },
                    { key: 'ring', label: 'Finger / Ring', icon: Award },
                    { key: 'legs', label: 'Legs / Greaves', icon: User },
                    { key: 'feet', label: 'Feet / Boots', icon: User },
                    { key: 'ammunition', label: 'Ammunition / Quiver', icon: Package },
                  ].map((slotDef) => {
                    const slotKey = slotDef.key as EquipmentSlotId;
                    const IconComp = slotDef.icon;

                    // Find item that occupies this slot
                    const equippedItem = draft.startingEquipment.equipped.find((item) => {
                      const itemSlot = (item.slot || 'mainHand') as EquipmentSlotId;
                      const occupied = getOccupiedSlots(item, itemSlot);
                      return occupied.includes(slotKey);
                    });

                    const isPrimarySlot = equippedItem && (equippedItem.slot || '').toLowerCase() === slotKey.toLowerCase();
                    const isTwoHandedOffHand = equippedItem && !isPrimarySlot && getHandUsage(equippedItem) === 'TWO_HAND';

                    return (
                      <div
                        key={slotDef.key}
                        className={`p-3 rounded-xl border text-left transition-all space-y-2 relative group ${
                          equippedItem
                            ? isTwoHandedOffHand
                              ? 'bg-purple-950/30 border-purple-800/60'
                              : 'bg-neutral-900 border-indigo-500/60 shadow-sm hover:border-indigo-400'
                            : 'bg-neutral-950/80 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-mono text-neutral-400 flex items-center gap-1">
                            <IconComp className="w-3 h-3 text-indigo-400" />
                            {slotDef.label}
                          </span>
                          {equippedItem && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 font-mono border border-indigo-800">
                              {equippedItem.rarity || 'Common'}
                            </span>
                          )}
                        </div>

                        {equippedItem ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              {/* Icon & Icon Studio trigger */}
                              <div className="relative group/icon shrink-0">
                                <div className="w-6 h-6 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-center text-xs overflow-hidden">
                                  {equippedItem.icon?.url ? (
                                    <img src={equippedItem.icon.url} alt={equippedItem.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span>{getDefaultIconForEquipment(equippedItem).emoji}</span>
                                  )}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIconStudioTarget({ itemOrSkill: equippedItem, type: 'EQUIPMENT' });
                                  }}
                                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white opacity-0 group-hover/icon:opacity-100 transition-opacity text-[8px] shadow z-10"
                                  title="Customize Icon in Icon Studio"
                                >
                                  <Edit3 className="w-2 h-2" />
                                </button>
                              </div>
                              <div className="font-semibold text-xs text-white truncate min-w-0">
                                {equippedItem.name}
                              </div>
                            </div>

                            {isTwoHandedOffHand && (
                              <div className="text-[10px] text-purple-300 font-mono italic">
                                ↔ Occupied by 2H Main Hand
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-1 pt-1 border-t border-neutral-800">
                              <button
                                onClick={() => setInspectingItem(equippedItem)}
                                className="text-[10px] text-indigo-300 hover:text-indigo-200 flex items-center gap-0.5"
                              >
                                <Eye className="w-3 h-3" />
                                Inspect
                              </button>
                              <button
                                onClick={() => handleUnequipItem(equippedItem)}
                                className="text-[10px] text-amber-400 hover:text-amber-300 font-medium"
                              >
                                Unequip
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPaperDollPickerSlot(slotKey)}
                            className="w-full py-2 rounded border border-dashed border-neutral-800 hover:border-indigo-500/50 text-[11px] text-neutral-500 hover:text-indigo-300 flex items-center justify-center gap-1 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Equip Item</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Carried Inventory Items (Pack Supplies) */}
              <div className="space-y-3 pt-4 border-t border-neutral-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-neutral-400" />
                    Carried Pack Supplies ({draft.startingEquipment.inventory.length})
                  </h3>
                </div>

                {draft.startingEquipment.inventory.length === 0 ? (
                  <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800 text-xs text-neutral-500 text-center">
                    No items in carried inventory. Use AI item synthesis or manual entry above.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                    {draft.startingEquipment.inventory.map((item) => {
                      const normalized = normalizeItemEquipmentMetadata(item);
                      const equipable = isEquipable(normalized);
                      const defaultIcon = getDefaultIconForEquipment(normalized);

                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between text-xs hover:border-neutral-700 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Icon & Icon Studio trigger */}
                            <div className="relative group/icon shrink-0">
                              <div className="w-8 h-8 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-center text-base overflow-hidden shadow-inner">
                                {normalized.icon?.url ? (
                                  <img src={normalized.icon.url} alt={normalized.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{defaultIcon.emoji}</span>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIconStudioTarget({ itemOrSkill: normalized, type: 'EQUIPMENT' });
                                }}
                                className="absolute -top-1 -right-1 p-0.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white opacity-0 group-hover/icon:opacity-100 transition-opacity text-[8px] shadow z-10"
                                title="Customize Icon in Icon Studio"
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            <div className="min-w-0 space-y-0.5">
                              <div className="font-medium text-white truncate flex items-center gap-1.5">
                                <span className="truncate">{normalized.name}</span>
                                {normalized.quantity > 1 && (
                                  <span className="text-[10px] font-mono text-neutral-400">x{normalized.quantity}</span>
                                )}
                              </div>
                              <div className="text-[10px] text-neutral-400 uppercase font-mono">
                                {normalized.category} • {normalized.rarity || 'Common'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <button
                              onClick={() => setInspectingItem(normalized)}
                              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-indigo-300"
                              title="Inspect item"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {equipable ? (
                              <button
                                onClick={() => handleInitiateEquip(normalized)}
                                className="px-2 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 hover:bg-indigo-900 text-[10px] font-semibold"
                              >
                                Equip
                              </button>
                            ) : (
                              <span className="px-2 py-1 rounded bg-neutral-950 text-neutral-500 border border-neutral-800 text-[10px] font-mono uppercase">
                                Pack Item
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Categorized Equipment Lists */}
              <div className="pt-4 border-t border-neutral-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="font-medium text-neutral-300 mb-1">Weapons</div>
                  <div className="text-neutral-400 text-[11px] space-y-0.5">
                    {draft.startingEquipment.weapons.map((w, i) => (
                      <div key={i}>• {w}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-neutral-300 mb-1">Armor</div>
                  <div className="text-neutral-400 text-[11px] space-y-0.5">
                    {draft.startingEquipment.armor.map((a, i) => (
                      <div key={i}>• {a}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-neutral-300 mb-1">Tools</div>
                  <div className="text-neutral-400 text-[11px] space-y-0.5">
                    {draft.startingEquipment.tools.map((t, i) => (
                      <div key={i}>• {t}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-neutral-300 mb-1">Consumables</div>
                  <div className="text-neutral-400 text-[11px] space-y-0.5">
                    {draft.startingEquipment.consumables.map((c, i) => (
                      <div key={i}>• {c}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveStep(4)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Stats & Attributes</span>
              </button>
              <button
                onClick={() => setActiveStep(6)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
              >
                <span>Proceed to Location & Situation</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: STARTING LOCATION & SITUATION */}
        {draft && activeStep === 6 && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-neutral-950 border border-neutral-800 space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-400" />
                    Starting Location & Dramatic Situation
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Select a canonical world location and establish the opening scene narrative conditions.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-indigo-950/20 border border-indigo-900/70 space-y-3">
                <div className="text-xs font-semibold text-indigo-300">How should DreamBook choose your beginning?</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleSuggestStartingContext('AI_SUGGEST')} className="px-3 py-1.5 rounded bg-indigo-700 text-xs">AI Suggest</button>
                  <button onClick={() => handleSuggestStartingContext('SURPRISE_ME')} className="px-3 py-1.5 rounded bg-neutral-800 text-xs">Surprise Me</button>
                  <button onClick={() => setDraft({ ...draft, startingLocationMode: 'CHOOSE', startingSituationMode: 'CHOOSE' })} className="px-3 py-1.5 rounded bg-neutral-800 text-xs">I'll Choose</button>
                </div>
                <div className="text-[11px] text-neutral-400">Current mode: {draft.startingLocationMode} • Situation: {draft.startingSituationMode}</div>
              </div>

              {/* Canonical Location Selection */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Canonical Starting Location
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(selectedWorld?.geography?.nodes || [draft.startingLocation]).map((node: any) => {
                    const isSelected = draft.startingLocation.locationId === node.id;
                    return (
                      <button
                        key={node.id}
                        onClick={() => {
                          setDraft({
                            ...draft,
                            startingLocation: {
                              locationId: node.id,
                              name: node.name,
                              region: node.region || 'Frontier',
                              description: node.description || 'Waypoint',
                              coordinates: node.coordinates,
                            },
                          });
                          markFieldEdited('startingLocation');
                        }}
                        className={`p-3.5 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-sm'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{node.name}</span>
                          {isSelected && <Check className="w-4 h-4 text-indigo-400" />}
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-1">
                          Region: {node.region || 'Frontier'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dramatic Situation Editor */}
              <div className="space-y-4 pt-4 border-t border-neutral-800">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  Initial Scene & Dramatic Hook
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Opening Summary</label>
                    <textarea
                      rows={2}
                      value={draft.startingSituation.summary}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          startingSituation: { ...draft.startingSituation, summary: e.target.value },
                        });
                        markFieldEdited('startingSituation');
                      }}
                      className="w-full p-3 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Inciting Dramatic Hook</label>
                    <textarea
                      rows={2}
                      value={draft.startingSituation.hook}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          startingSituation: { ...draft.startingSituation, hook: e.target.value },
                        });
                        markFieldEdited('startingSituation');
                      }}
                      className="w-full p-3 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Initial Environmental Conditions</label>
                    <input
                      type="text"
                      value={draft.startingSituation.initialConditions}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          startingSituation: { ...draft.startingSituation, initialConditions: e.target.value },
                        });
                        markFieldEdited('startingSituation');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Why Here Now</label>
                    <input
                      type="text"
                      value={draft.startingSituation.whyHereNow}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          startingSituation: { ...draft.startingSituation, whyHereNow: e.target.value },
                        });
                        markFieldEdited('startingSituation');
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveStep(5)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Equipment</span>
              </button>
              <button
                onClick={() => setActiveStep(7)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
              >
                <span>Proceed to Portrait</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 7: PORTRAIT STUDIO */}
        {draft && activeStep === 7 && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-neutral-950 border border-neutral-800 space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-indigo-400" />
                    Portrait & Visual Identity Studio
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Review or synthesize visual assets. Built with resilient fallbacks for seamless offline or preview operation.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                {/* Visual Avatar Card */}
                <div className="min-w-0 max-w-full p-6 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col items-center text-center space-y-4 overflow-hidden">
                  <div className="w-32 h-32 max-w-full max-h-32 shrink-0 rounded-2xl bg-neutral-950 border-2 border-indigo-500/40 flex items-center justify-center overflow-hidden shadow-inner relative">
                    {draft.portraitAsset?.imageUrl ? (
                      <img
                        src={draft.portraitAsset.imageUrl}
                        alt={draft.identity.name}
                        className="w-full h-full max-w-full max-h-full object-cover"
                      />
                    ) : (
                      <div className="text-5xl select-none">{draft.portraitAsset?.emoji || '👤'}</div>
                    )}
                  </div>

                  <div className="w-full max-w-full min-w-0 px-2 overflow-hidden">
                    <h3 className="text-base font-semibold text-white truncate max-w-full">{draft.identity.name}</h3>
                    <p className="text-xs text-neutral-400 break-words">
                      {draft.identity.species} {draft.role.profession}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2 max-w-full">
                    <label className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs cursor-pointer shrink-0">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file || !draft) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            setDraft({
                              ...draft,
                              portraitAsset: {
                                ...draft.portraitAsset!,
                                imageUrl: String(reader.result),
                                source: 'UPLOAD',
                                isFallback: false,
                                status: 'ready',
                              },
                            });
                            markFieldEdited('portraitAsset');
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    <button
                      onClick={() => draft && setDraft({
                        ...draft,
                        portraitAsset: { ...draft.portraitAsset!, pinned: !draft.portraitAsset?.pinned },
                      })}
                      className={`px-3 py-1.5 rounded-lg text-xs shrink-0 ${draft.portraitAsset?.pinned ? 'bg-indigo-700' : 'bg-neutral-800'}`}
                    >
                      {draft.portraitAsset?.pinned ? 'Pinned' : 'Pin Portrait'}
                    </button>
                  </div>

                  {/* Emoji Selector */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2 max-w-full">
                    {['🧙‍♂️', '⚔️', '🗡️', '🏹', '✨', '🤖', '🧝‍♀️', '👤'].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          setDraft({
                            ...draft,
                            portraitAsset: {
                              ...draft.portraitAsset!,
                              emoji,
                            },
                          });
                          markFieldEdited('portraitAsset');
                        }}
                        className={`text-xl p-1.5 rounded-lg border transition-colors shrink-0 ${
                          draft.portraitAsset?.emoji === emoji
                            ? 'bg-indigo-950 border-indigo-500'
                            : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Portrait Prompt & Custom URL */}
                <div className="space-y-4 min-w-0 max-w-full">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Synthesized AI Portrait Prompt
                    </label>
                    <textarea
                      rows={3}
                      value={draft.portraitAsset?.promptFallback || ''}
                      onChange={(e) => {
                        setDraft({
                          ...draft,
                          portraitAsset: {
                            ...draft.portraitAsset!,
                            promptFallback: e.target.value,
                          },
                        });
                        markFieldEdited('portraitAsset');
                      }}
                      className="w-full max-w-full p-3 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono resize-y"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-neutral-300">
                      Import Custom Image URL (Optional)
                    </label>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 max-w-full">
                      <input
                        type="text"
                        value={customImageUrl}
                        onChange={(e) => setCustomImageUrl(e.target.value)}
                        placeholder="https://example.com/character.png"
                        className="flex-1 min-w-0 w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={() => {
                          if (!customImageUrl.trim()) return;
                          setDraft({
                            ...draft,
                            portraitAsset: {
                              ...draft.portraitAsset!,
                              imageUrl: customImageUrl,
                              isFallback: false,
                              status: 'ready',
                            },
                          });
                          markFieldEdited('portraitAsset');
                        }}
                        className="shrink-0 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-white whitespace-nowrap"
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleGeneratePortrait}
                      disabled={isGeneratingPortrait}
                      className="max-w-full flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-colors"
                    >
                      {isGeneratingPortrait ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="break-words text-left">Synthesize Portrait via Presentation Adapter</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setActiveStep(6)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Location</span>
              </button>
              <button
                onClick={() => setActiveStep(8)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors"
              >
                <span>Proceed to Final Review</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 8: REVIEW & EXPLICIT CONFIRMATION */}
        {draft && activeStep === 8 && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-neutral-950 border border-neutral-800 space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Dossier Audit & Character Confirmation
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Review full attributes and validate against world constraints. Confirmation permanently seals the character to this world.
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                  Ready for Canonical Registration
                </span>
              </div>

              {/* Validation Status Box */}
              {draft.validationState && (
                <div
                  className={`p-4 rounded-lg border text-xs space-y-1.5 ${
                    draft.validationState.isValid
                      ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-300'
                      : 'bg-red-950/30 border-red-800/80 text-red-300'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    {draft.validationState.isValid ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Validation Passed: All fields comply with world rules.</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span>Validation Errors Detected:</span>
                      </>
                    )}
                  </div>
                  {draft.validationState.errors?.map((err, i) => (
                    <div key={i} className="text-red-400 pl-5">• {err}</div>
                  ))}
                  {draft.validationState.warnings?.map((warn, i) => (
                    <div key={i} className="text-amber-300 pl-5">• Warning: {warn}</div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 text-xs">
                  <div className="font-semibold text-indigo-400 uppercase tracking-wider">Rules & Achievements</div>
                  <div className="mt-2 text-neutral-300">Attributes: {(draft.attributes || []).length} • Stats: {(draft.stats || []).length} • Feats: {(draft.feats || []).length} • Titles: {(draft.titles || []).length}</div>
                  <div className="text-neutral-500 mt-1">Player edits are preserved and locked from accidental AI overwrite.</div>
                </div>
                <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 text-xs">
                  <div className="font-semibold text-indigo-400 uppercase tracking-wider">Starting State</div>
                  <div className="mt-2 text-neutral-300">HP {draft.startingState.healthCurrent}/{draft.startingState.healthMax} • Conditions {(draft.startingState.conditions || []).length}</div>
                  <div className="text-neutral-500 mt-1">Location mode: {draft.startingLocationMode} • Situation mode: {draft.startingSituationMode}</div>
                </div>
              </div>

              {(draft.revisionHistory || []).length > 0 && (
                <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Revision History</span>
                    <span className="text-[10px] text-neutral-500">Restore any previous draft before confirmation</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(draft.revisionHistory || []).slice().reverse().map((entry) => (
                      <button
                        key={entry.revision}
                        onClick={() => restoreRevision(entry.revision)}
                        className="px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:border-indigo-600 text-[11px] text-neutral-300"
                      >
                        v{entry.revision} · {entry.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Comprehensive Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 1. Identity & Origin */}
                <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2 text-xs">
                  <div className="font-semibold text-indigo-400 uppercase tracking-wider">
                    Protagonist Identity
                  </div>
                  <div className="text-sm font-medium text-white">{draft.identity.name}</div>
                  <div className="text-neutral-400">
                    {draft.identity.species} • Age: {draft.identity.age} • {draft.role.profession}
                  </div>
                  <div className="text-neutral-300 leading-relaxed pt-1">
                    {draft.appearance.physicalDescription}
                  </div>
                </div>

                {/* 2. D&D Core Stats */}
                <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2 text-xs">
                  <div className="font-semibold text-indigo-400 uppercase tracking-wider">
                    D&D Core Combat & Stats
                  </div>
                  <div className="text-sm font-medium text-white font-mono">
                    Lvl {draft.coreStats?.level || 1} • AC {draft.coreStats?.armorClass || 10} • HP {draft.coreStats?.hpCurrent || 10}/{draft.coreStats?.hpMax || 10}
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1 font-mono text-[10px] text-neutral-300">
                    <div>STR: <span className="text-indigo-300 font-bold">{draft.coreStats?.strength || 10}</span></div>
                    <div>DEX: <span className="text-indigo-300 font-bold">{draft.coreStats?.dexterity || 10}</span></div>
                    <div>CON: <span className="text-indigo-300 font-bold">{draft.coreStats?.constitution || 10}</span></div>
                    <div>INT: <span className="text-indigo-300 font-bold">{draft.coreStats?.intelligence || 10}</span></div>
                    <div>WIS: <span className="text-indigo-300 font-bold">{draft.coreStats?.wisdom || 10}</span></div>
                    <div>CHA: <span className="text-indigo-300 font-bold">{draft.coreStats?.charisma || 10}</span></div>
                  </div>
                </div>

                {/* 3. Capabilities & Techniques */}
                <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2 text-xs">
                  <div className="font-semibold text-indigo-400 uppercase tracking-wider">
                    Capabilities ({draft.capabilities.length}) & Feats ({draft.feats?.length || 0})
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {draft.capabilities.map((c) => (
                      <div key={c.id} className="text-neutral-300 flex items-center justify-between">
                        <span>• {c.name}</span>
                        <span className="text-[10px] text-neutral-500 font-mono">{c.powerTier}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Starting Waypoint */}
                <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 space-y-2 text-xs">
                  <div className="font-semibold text-indigo-400 uppercase tracking-wider">
                    Starting Waypoint
                  </div>
                  <div className="text-sm font-medium text-white">{draft.startingLocation.name}</div>
                  <div className="text-neutral-400">Region: {draft.startingLocation.region}</div>
                  <div className="text-neutral-300 leading-relaxed pt-1">
                    {draft.startingSituation.summary}
                  </div>
                </div>
              </div>

              {confirmationError && (
                <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-xs text-red-200">
                  {confirmationError}
                </div>
              )}

              {/* Confirmation Success State */}
              {confirmedCharacter && (
                <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-600 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Protagonist Successfully Confirmed!</span>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    <strong>{confirmedCharacter.identity.name}</strong> is now registered in the world archive (World ID: <code>{confirmedCharacter.worldId}</code>, Manifest v{confirmedCharacter.worldVersion}).
                  </p>
                  <div className="p-3 rounded bg-neutral-950 border border-emerald-900/60 font-mono text-[11px] text-neutral-300">
                    Character ID: {confirmedCharacter.characterId} • Confirmed At: {confirmedCharacter.confirmedAt}
                  </div>
                  <p className="text-[11px] text-amber-300">
                    🔒 Strict Isolation Guarantee: Confirmation did NOT initiate a StoryRun. You can safely create more characters, inspect drafts, or launch when ready.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setActiveStep(7)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Portrait</span>
                </button>

                {!confirmedCharacter ? (
                  <button
                    id="btn-confirm-character"
                    onClick={handleConfirmCharacter}
                    disabled={isConfirming || !draft.validationState?.isValid}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors shadow-md"
                  >
                    {isConfirming ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Confirm Character</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      id="btn-start-storyrun"
                      onClick={handleStartStoryRun}
                      disabled={isStartingRun}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white transition-colors shadow-md"
                    >
                      {isStartingRun ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      <span>Begin Story Run</span>
                    </button>
                    <button
                      onClick={() => {
                        setConfirmedCharacter(null);
                        setActiveStep(1);
                        setNaturalConcept('');
                        setDraft(null);
                        setStartRunError(null);
                      }}
                      className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 transition-colors"
                    >
                      Create Another Character
                    </button>
                  </div>
                )}
              </div>

              {startRunError && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/80 text-xs text-red-300 flex items-center gap-2 mt-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{startRunError}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Drafts Modal */}
      {showDraftsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-neutral-950 border border-neutral-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                Saved Drafts & Confirmed Characters
              </h3>
              <button
                onClick={() => setShowDraftsModal(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              <div>
                <h4 className="text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wider">
                  Drafts ({savedDrafts.length})
                </h4>
                {savedDrafts.length === 0 ? (
                  <div className="text-xs text-neutral-500 italic p-2">No drafts saved yet.</div>
                ) : (
                  <div className="space-y-2">
                    {savedDrafts.map((d) => (
                      <div
                        key={d.draftId}
                        className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between hover:border-neutral-700 text-xs"
                      >
                        <div>
                          <div className="font-medium text-white">{d.identity.name}</div>
                          <div className="text-[11px] text-neutral-400">
                            {d.role.profession} • v{d.worldVersion}
                          </div>
                        </div>
                        <button
                          onClick={() => handleLoadDraft(d)}
                          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs"
                        >
                          Load
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wider">
                  Confirmed Characters ({confirmedCharacters.length})
                </h4>
                {confirmedCharacters.length === 0 ? (
                  <div className="text-xs text-neutral-500 italic p-2">No characters confirmed yet.</div>
                ) : (
                  <div className="space-y-2">
                    {confirmedCharacters.map((c) => (
                      <div
                        key={c.characterId}
                        className="p-3 rounded-lg bg-neutral-900 border border-emerald-900/60 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-medium text-emerald-300">{c.identity.name}</div>
                          <div className="text-[11px] text-neutral-400">
                            {c.role.profession} • Confirmed: {new Date(c.confirmedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                          Confirmed
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INSPECTION MODAL: EQUIPMENT ITEM */}
      {inspectingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">{inspectingItem.name}</h3>
              </div>
              <button
                onClick={() => setInspectingItem(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono uppercase">
                {inspectingItem.category}
              </span>
              <span className="px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800 font-mono">
                Rarity: {inspectingItem.rarity || 'Common'}
              </span>
              {inspectingItem.slot && (
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono uppercase">
                  Slot: {inspectingItem.slot}
                </span>
              )}
              <span className="px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 font-mono">
                Qty: {inspectingItem.quantity}
              </span>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
              {inspectingItem.description || 'No detailed description provided.'}
            </p>

            {inspectingItem.properties ? (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase">Properties & Tagging:</span>
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(inspectingItem.properties)
                    ? (inspectingItem.properties as any[])
                    : Object.entries(inspectingItem.properties).map(([k, v]) => `${k}: ${v}`)
                  ).map((prop: any, i: number) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800">
                      {String(prop)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {inspectingItem.provenance && (
              <div className="text-[10px] text-neutral-500 font-mono pt-2 border-t border-neutral-800">
                Provenance: {String(inspectingItem.provenance)}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
              <button
                onClick={() => handleDeleteItem(inspectingItem.id)}
                className="px-3 py-1.5 rounded bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800 text-xs font-medium flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Item</span>
              </button>

              <div className="flex items-center gap-2">
                {inspectingItem.isEquipped ? (
                  <button
                    onClick={() => handleUnequipItem(inspectingItem)}
                    className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold"
                  >
                    Unequip Item
                  </button>
                ) : isEquipable(inspectingItem) ? (
                  <button
                    onClick={() => handleInitiateEquip(inspectingItem)}
                    className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                  >
                    Equip Item
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-500 text-xs font-mono uppercase">
                    Pack Item
                  </span>
                )}
                <button
                  onClick={() => setInspectingItem(null)}
                  className="px-4 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INSPECTION MODAL: SKILL */}
      {inspectingSkill && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">{inspectingSkill.name}</h3>
              </div>
              <button
                onClick={() => setInspectingSkill(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono uppercase">
                Governing: {inspectingSkill.governingAbility}
              </span>
              <span className="px-2 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800 font-mono">
                Proficiency: {inspectingSkill.proficiency}
              </span>
              {inspectingSkill.isCustom && (
                <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                  Custom AI Skill
                </span>
              )}
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
              {inspectingSkill.description}
            </p>

            {inspectingSkill.mechanicalDescription && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase">Mechanical Application:</span>
                <p className="text-xs text-indigo-200 font-mono bg-neutral-900 p-2.5 rounded border border-neutral-800">
                  {inspectingSkill.mechanicalDescription}
                </p>
              </div>
            )}

            {inspectingSkill.provenance && (
              <div className="text-[10px] text-neutral-500 font-mono pt-2 border-t border-neutral-800">
                Provenance: {String(inspectingSkill.provenance)}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-neutral-800">
              <button
                onClick={() => setInspectingSkill(null)}
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ICON STUDIO MODAL */}
      <IconStudioModal
        isOpen={!!iconStudioTarget}
        onClose={() => setIconStudioTarget(null)}
        targetItemOrSkill={iconStudioTarget?.itemOrSkill || null}
        targetType={iconStudioTarget?.type || 'EQUIPMENT'}
        onSaveIcon={handleSaveIconFromStudio}
      />

      {/* COMPATIBLE SLOT SELECTION MODAL */}
      {slotPickerModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Select Legal Slot</h3>
                <p className="text-xs text-neutral-400">Compatible slots for {slotPickerModalItem.name}</p>
              </div>
              <button
                onClick={() => setSlotPickerModalItem(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs">
              {getCompatibleEquipmentSlots(slotPickerModalItem).map((slotKey) => (
                <button
                  key={slotKey}
                  onClick={() => handleInitiateEquip(slotPickerModalItem, slotKey)}
                  className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-indigo-500 hover:bg-neutral-850 text-left text-neutral-200 transition-all font-medium flex items-center justify-between"
                >
                  <span className="capitalize font-mono text-indigo-300">{slotKey}</span>
                  <span className="text-[10px] text-neutral-500">Legal Equipment Slot</span>
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-800">
              <button
                onClick={() => setSlotPickerModalItem(null)}
                className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAPER DOLL SLOT PICKER MODAL (WHEN CLICKING AN EMPTY SLOT) */}
      {paperDollPickerSlot && draft && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white capitalize">Equip Item to {paperDollPickerSlot}</h3>
                <p className="text-xs text-neutral-400">Showing items in pack supplies compatible with this slot.</p>
              </div>
              <button
                onClick={() => setPaperDollPickerSlot(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const compatibleItems = draft.startingEquipment.inventory.filter((item) =>
                canEquipItemToSlot(item, paperDollPickerSlot)
              );

              if (compatibleItems.length === 0) {
                return (
                  <div className="p-6 text-center space-y-2 bg-neutral-900/50 rounded-xl border border-neutral-800">
                    <p className="text-xs text-neutral-400">No compatible equipment items found in carried supplies for this slot.</p>
                    <p className="text-[11px] text-neutral-500">Synthesize an item or add one to your inventory first.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                  {compatibleItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between hover:border-indigo-500/50 transition-colors"
                    >
                      <div>
                        <div className="text-xs font-semibold text-white">{item.name}</div>
                        <div className="text-[10px] text-neutral-400 uppercase font-mono">{item.category} • {item.rarity || 'Common'}</div>
                      </div>
                      <button
                        onClick={() => handleInitiateEquip(item, paperDollPickerSlot)}
                        className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                      >
                        Equip Here
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="flex justify-end pt-2 border-t border-neutral-800">
              <button
                onClick={() => setPaperDollPickerSlot(null)}
                className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EQUIPMENT CONFLICT RESOLUTION MODAL */}
      {equipConflictState && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-amber-500/50 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-neutral-800 pb-3">
              <div className="p-2 rounded-lg bg-amber-950 text-amber-400 border border-amber-800">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Equipment Slot Conflict</h3>
                <p className="text-xs text-amber-300/90">Equipping requires un-equipping existing items</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Equipping <strong className="text-white">{equipConflictState.itemToEquip.name}</strong> to{' '}
              <span className="font-mono text-indigo-300 capitalize">{equipConflictState.targetSlot}</span> will safely move the following equipped item(s) back to your carried pack supplies:
            </p>

            <div className="space-y-1.5 bg-neutral-900 p-3 rounded-lg border border-neutral-800">
              {equipConflictState.conflicts.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-xs text-amber-200">
                  <span className="font-medium">• {item.name}</span>
                  <span className="text-[10px] font-mono text-neutral-400">({item.slot || 'Equipped'})</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setEquipConflictState(null)}
                className="px-3.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300"
              >
                Cancel
              </button>
              <button
                onClick={() => executeEquip(equipConflictState.itemToEquip, equipConflictState.targetSlot)}
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm"
              >
                Confirm & Swap Equipment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};