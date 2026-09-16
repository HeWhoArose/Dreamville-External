import { EngineState, DialogueNode } from './serverTypes';

/**
 * Server-side test secret used specifically to verify the epistemic boundary.
 * The server must hold this, but it must NEVER be emitted in API responses or client bundles.
 */
export const SERVER_BOUNDARY_TEST_SECRET = 'TEST_SECRET_SIGIL_OMEGA_ARCHIVAL_7734';

export const INITIAL_DIALOGUE_NODES: Record<string, DialogueNode> = {
  maren_intro: {
    nodeId: 'maren_intro',
    speakerId: 'char_maren',
    speakerName: 'Maren the Archivist',
    text: 'Scribe Vael. The astral rings of the Whispering Orrery ground to a halt three bells past dusk. The bronze armature remains lukewarm, yet the lenses refuse to refract the zenith beam. Did you bring the brass quadrant?',
    epistemicNote: 'Maren recognizes Vael and reports direct observations. She knows the rings stopped, but not the subterranean cause.',
    choices: [
      {
        id: 'c1',
        label: 'Present the Astrolabe and inspect the armature',
        intent: 'INSPECT_DEVICE',
        targetNodeId: 'maren_inspect',
      },
      {
        id: 'c2',
        label: 'Inquire about the strange hum heard before the stoppage',
        intent: 'INQUIRE_PHENOMENON',
        targetNodeId: 'maren_hum',
      },
      {
        id: 'c3',
        label: 'Ask if Master Elian left any instructions before departing',
        intent: 'INQUIRE_PERSON',
        targetNodeId: 'maren_elian',
      },
    ],
  },
  maren_inspect: {
    nodeId: 'maren_inspect',
    speakerId: 'char_maren',
    speakerName: 'Maren the Archivist',
    text: 'Careful with the vernier scale. Look here: micro-fractures along the third prism ring. This was not fatigue; an oscillation pulse resonated upward through the bedrock.',
    epistemicNote: 'Observational clue unlocked: Subterranean resonant fracture.',
    choices: [
      {
        id: 'c1_1',
        label: 'Record the fracture coordinates in the chronicle',
        intent: 'RECORD_CHRONICLE',
        targetNodeId: 'maren_record_done',
      },
      {
        id: 'c1_2',
        label: 'Suggest traveling to the Lantern Vault to check the core seals',
        intent: 'SUGGEST_TRAVEL',
        targetNodeId: 'maren_vault_advice',
      },
    ],
    rewardKnowledge: {
      id: 'k_prism_fracture',
      category: 'Clue',
      title: 'Resonance Fracture in Third Prism Ring',
      summary: 'The third prism ring cracked from an upward subterranean acoustic pulse rather than normal mechanical wear.',
      source: 'Direct observation at Whispering Orrery',
    },
  },
  maren_hum: {
    nodeId: 'maren_hum',
    speakerId: 'char_maren',
    speakerName: 'Maren the Archivist',
    text: 'It sounded like wet crystal grinding against bell-metal. The ravens in the bell-cote scattered south toward the Glasswood before the second harmonic completed.',
    epistemicNote: 'Contextual lore: fauna reaction and harmonic direction.',
    choices: [
      {
        id: 'c2_1',
        label: 'Check the southward alignment of the azimuth needle',
        intent: 'INSPECT_DEVICE',
        targetNodeId: 'maren_inspect',
      },
    ],
  },
  maren_elian: {
    nodeId: 'maren_elian',
    speakerId: 'char_maren',
    speakerName: 'Maren the Archivist',
    text: 'He sealed the archive ante-chamber with tallow wax and departed for the Lantern Vault at dawn. He took only the Verdigris Key and three flasks of vitriol.',
    epistemicNote: 'Travel clue: Master Elian is at the Lantern Vault.',
    choices: [
      {
        id: 'c3_1',
        label: 'Prepare to journey toward the Lantern Vault',
        intent: 'SUGGEST_TRAVEL',
        targetNodeId: 'maren_vault_advice',
      },
    ],
    rewardKnowledge: {
      id: 'k_elian_departure',
      category: 'Person',
      title: 'Elian Departure to Lantern Vault',
      summary: 'Master Elian departed at dawn carrying the Verdigris Key and vitriol, heading for the subterranean Lantern Vault.',
      source: 'Account from Archivist Maren',
    },
  },
  maren_vault_advice: {
    nodeId: 'maren_vault_advice',
    speakerId: 'char_maren',
    speakerName: 'Maren the Archivist',
    text: 'If you head for the Vault, heed the low gallery vents. Take my Luminary Veil to filter the damp vapor. May the quiet guide your stylus, Scribe.',
    epistemicNote: 'Pre-requisite advice for Vault navigation.',
    choices: [
      {
        id: 'c4_1',
        label: 'Acknowledge advice and return to observation desk',
        intent: 'CONCLUDE_DIALOGUE',
        targetNodeId: 'maren_intro',
      },
    ],
  },
  maren_record_done: {
    nodeId: 'maren_record_done',
    speakerId: 'char_maren',
    speakerName: 'Maren the Archivist',
    text: 'The record is entered. If the core engine validates this inscription, the chronicle shall reflect the acoustic anomaly for posterity.',
    epistemicNote: 'Dialogue concluded; chronicle state modified.',
    choices: [
      {
        id: 'c5_1',
        label: 'Resume monitoring the celestial dials',
        intent: 'RETURN_IDLE',
        targetNodeId: 'maren_intro',
      },
    ],
  },
  elian_intro: {
    nodeId: 'elian_intro',
    speakerId: 'char_elian',
    speakerName: 'Master Elian',
    text: 'Step no closer to the threshold, Vael. The tallow seal has softened. The vault lanterns are flickering out of sequence, consuming fuel that was meant to burn for seven centuries.',
    epistemicNote: 'Elian is agitated. He is attempting to protect the vault core.',
    choices: [
      {
        id: 'ce_1',
        label: 'Present the chronicle log from the Whispering Orrery',
        intent: 'OFFER_EVIDENCE',
        targetNodeId: 'elian_examine_log',
      },
      {
        id: 'ce_2',
        label: 'Ask what threatens the seven-century flame',
        intent: 'INQUIRE_CORE',
        targetNodeId: 'elian_explain_threat',
      },
    ],
  },
  elian_examine_log: {
    nodeId: 'elian_examine_log',
    speakerId: 'char_elian',
    speakerName: 'Master Elian',
    text: 'An acoustic pulse from the bedrock? Then the deep siphon has breached. We have hours, not cycles, before the cistern overflow drowns the lower gears.',
    epistemicNote: 'Critical situation revealed.',
    choices: [
      {
        id: 'ce_1_1',
        label: 'Inquire how the external scribe can assist',
        intent: 'OFFER_ASSISTANCE',
        targetNodeId: 'elian_explain_threat',
      },
    ],
    rewardKnowledge: {
      id: 'k_deep_siphon_breach',
      category: 'Lore',
      title: 'Deep Siphon Subterranean Breach',
      summary: 'The acoustic shockwave originated from a fracture in the deep cistern siphon beneath the Lantern Vault.',
      source: 'Master Elian during emergency consult',
    },
  },
  elian_explain_threat: {
    nodeId: 'elian_explain_threat',
    speakerId: 'char_elian',
    speakerName: 'Master Elian',
    text: 'Maintain the external chronicle faithfully. Every anomaly you record provides calibration data for the automated locks. Do not let the Orrery record go dormant.',
    epistemicNote: 'Mission directive reaffirmation.',
    choices: [
      {
        id: 'ce_2_1',
        label: 'Promise vigilance and return to post',
        intent: 'CONCLUDE_DIALOGUE',
        targetNodeId: 'elian_intro',
      },
    ],
  },
};

export const INITIAL_ENGINE_STATE: EngineState = {
  engineContractVersion: 'v0.9.4-mock-server-authority',
  serverBoundarySecret: SERVER_BOUNDARY_TEST_SECRET,
  worldTime: {
    cycle: 42,
    period: 'Dusk',
    era: 'Era of the Silent Meridian',
  },
  activeLocationId: 'loc_whispering_orrery',
  protagonist: {
    name: 'Scribe Vael',
    title: 'Keeper of the Downstream Ledger',
    vitality: 'Attuned',
    currentFocus: 'Investigating anomalous astrolabe harmonics',
  },
  locations: {
    loc_whispering_orrery: {
      id: 'loc_whispering_orrery',
      name: 'The Whispering Orrery',
      region: 'Upper Spire Plateau',
      description: 'A colossal bronze astrolabe suspended over a bottomless chasm. Concentric rings hum softly even when the wind dies down.',
      coordinates: { x: 120, y: 84 },
      accessible: true,
      ambientSensory: 'A faint ozone tang in the air and rhythmic metallic ticking.',
      discovered: true,
    },
    loc_lantern_vault: {
      id: 'loc_lantern_vault',
      name: 'The Lantern Vault',
      region: 'Subterranean Bastion',
      description: 'Catacombs lined with glass vessels containing eternal phosphoric tallow. The silence is heavy and damp.',
      coordinates: { x: 80, y: 210 },
      accessible: true,
      ambientSensory: 'Slow drips of mineral water and a sulfurous warmth.',
      discovered: true,
    },
    loc_glasswood_verge: {
      id: 'loc_glasswood_verge',
      name: 'Glasswood Verge',
      region: 'Silicate Basin',
      description: 'A petrified woodland where calcified branches chime in the gale. Fragile filaments drift like spider silk.',
      coordinates: { x: 260, y: 140 },
      accessible: false,
      ambientSensory: 'High-pitched crystalline ringing and brittle wind gusts.',
      discovered: true,
    },
    loc_sunken_scriptorium: {
      id: 'loc_sunken_scriptorium',
      name: 'Sunken Scriptorium',
      region: 'Low Marsh Trenches',
      description: 'Ancient archives submerged beneath dark brackish pools. Vellum cases float in sealed reed baskets.',
      coordinates: { x: 190, y: 310 },
      accessible: false,
      ambientSensory: 'Smell of wet vellum, cedar resin, and still black water.',
      discovered: false,
    },
  },
  characters: {
    char_maren: {
      id: 'char_maren',
      name: 'Maren the Archivist',
      title: 'Caretaker of the Celestial Armatures',
      role: 'Astronomical Technician',
      locationId: 'loc_whispering_orrery',
      presence: 'present',
      disposition: 'Enigmatic',
      portraitEmoji: '🔭',
      playerVisibleKnowledge: [
        'Experienced observer of the Whispering Orrery rings.',
        'Noticed recent mechanical oscillations that do not align with seasonal drift.',
        'Holds the spare optical vernier in her ledger satchel.',
      ],
      // CRITICAL SERVER-SIDE CANONICAL SECRET — NEVER LEAK TO CLIENT
      hiddenCanonicalContext:
        'SERVER CANONICAL SECRET: Maren discovered that the third prism cracked because she dropped an iron wrench into the lower gearing two nights ago. She is concealing her negligence fearing demotion to the marsh archives.',
    },
    char_elian: {
      id: 'char_elian',
      name: 'Master Elian',
      title: 'Senior Custodian of the Vault Keys',
      role: 'Vault Arbiter',
      locationId: 'loc_lantern_vault',
      presence: 'present',
      disposition: 'Cautious',
      portraitEmoji: '🗝️',
      playerVisibleKnowledge: [
        'Has tended the perpetual lanterns for over forty seasonal cycles.',
        'Knows the combination seals of the upper three tiers.',
      ],
      // CRITICAL SERVER-SIDE CANONICAL SECRET — NEVER LEAK TO CLIENT
      hiddenCanonicalContext:
        'SERVER CANONICAL SECRET: Elian carries the clandestine master cipher for Vault Tier VII sewn into the hem of his tunic. He believes Vael is an auditor sent by the High Chancery.',
    },
    char_sentry_kaelen: {
      id: 'char_sentry_kaelen',
      name: 'Sentry Kaelen',
      title: 'Watchman of the Glasswood Verge',
      role: 'Border Patrolman',
      locationId: 'loc_glasswood_verge',
      presence: 'absent',
      disposition: 'Friendly',
      portraitEmoji: '🛡️',
      playerVisibleKnowledge: [
        'Maintains the perimeter beacons between the Spire and the Silicate Basin.',
        'Refuses passage without a signed wax transit seal from Master Elian.',
      ],
      // CRITICAL SERVER-SIDE CANONICAL SECRET — NEVER LEAK TO CLIENT
      hiddenCanonicalContext:
        'SERVER CANONICAL SECRET: Kaelen accepts bribes of dried tallow root to allow unrecorded night passage through the southern bramble path.',
    },
  },
  activeDialogue: INITIAL_DIALOGUE_NODES.maren_intro,
  dialogueHistory: [
    {
      speaker: 'Maren the Archivist',
      text: 'Scribe Vael. The astral rings of the Whispering Orrery ground to a halt three bells past dusk. The bronze armature remains lukewarm, yet the lenses refuse to refract the zenith beam. Did you bring the brass quadrant?',
      cycle: 42,
    },
  ],
  inventory: [
    {
      id: 'item_brass_astrolabe',
      name: 'Chancery Brass Astrolabe',
      category: 'Artifact',
      description: 'A precision-engraved navigational instrument showing meridian angles. Essential for aligning observation optics.',
      quantity: 1,
      weight: 1.2,
      rarity: 'Rare',
      equippableSlot: 'Hands',
      icon: '🧭',
    },
    {
      id: 'item_luminary_veil',
      name: 'Tallow-Treated Luminary Veil',
      category: 'Relic',
      description: 'A gossamer cowl treated with mineral oil to filter noxious subterranean vapors and phosphorus glare.',
      quantity: 1,
      weight: 0.4,
      rarity: 'Uncommon',
      equippableSlot: 'Head',
      icon: '🧣',
    },
    {
      id: 'item_scribed_vellum',
      name: 'Roll of Blank Scriptorium Vellum',
      category: 'Tome',
      description: 'Heavy parchment treated with pumice stone. Ready for official chronicling of celestial anomalies.',
      quantity: 3,
      weight: 0.6,
      rarity: 'Common',
      icon: '📜',
    },
    {
      id: 'item_glasswood_spore_flask',
      name: 'Phial of Silicate Spores',
      category: 'Reagent',
      description: 'Luminesces with a soft pale cyan hue when exposed to mechanical friction.',
      quantity: 1,
      weight: 0.2,
      rarity: 'Rare',
      equippableSlot: 'Relic',
      icon: '🧪',
    },
  ],
  equipment: {
    Head: null,
    Cloak: null,
    Hands: null,
    Relic: null,
    Footwear: null,
  },
  knowledgeBase: [
    {
      id: 'k_orrery_halt',
      category: 'Lore',
      title: 'Stoppage of the Whispering Orrery',
      acquiredAtCycle: 42,
      summary: 'The main meridian rings ceased movement three bells past dusk without visible structural impact.',
      source: 'Initial observation report',
    },
    {
      id: 'k_glasswood_isolation',
      category: 'Location',
      title: 'Glasswood Verge Travel Restriction',
      acquiredAtCycle: 40,
      summary: 'Passage into the Silicate Basin requires authorization seal from the Vault Custodian.',
      source: 'Chancery Border Edict',
    },
  ],
  actionHistory: [
    {
      id: 'act_init_001',
      timestamp: '18:14:02',
      cycle: 42,
      actionType: 'NOTE_RECORD',
      description: 'Session initialized. Protagonist arrived at Whispering Orrery.',
      epistemicValidation: 'MOCK_ENGINE_COMMITTED',
      authoritativeFeedback: 'Server mock authority established. In-memory single instance state initialized.',
    },
  ],
};
