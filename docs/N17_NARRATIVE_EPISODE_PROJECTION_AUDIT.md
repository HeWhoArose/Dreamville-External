# N17 — Narrative Episode Projection Audit

## Scope
N17 projects the shape of the current multi-turn narrative episode for presentation. It does not become a second plot, thread, memory, or canonical state authority.

## Pre-implementation audit
- `NarrativeMemoryLifecycle` remains the authority that records accepted-turn context history, durable memories, open-thread lifecycle, and canonical plot beats.
- `CurrentSituationBuilder` is the bounded current-turn projection used by narration and already exposes recent turns, open threads, plot context, location, visible entities, and current intent.
- `NarrativeContinuityStateEngine` remains authoritative for persisted presentation continuity signals such as tension and momentum.
- `NarrativeNoveltyEngine` remains authoritative for repetition history.
- `NarrativeResearchPipeline` remains the bounded evidence selector; N17 consumes selected memory/thread evidence rather than bypassing research security.
- `NarrativeDirector` remains the ephemeral turn-plan authority.
- `NarrativePromptBuilder` remains the sole prompt serializer for N17, including compact prompt paths.

## N17 contract
`NarrativeEpisodeProjectionEngine` derives an ephemeral projection from:
- recent accepted-turn history;
- current plot beats;
- active unresolved threads;
- current continuity state;
- current player intent;
- optionally selected narrative research memory evidence.

The projection includes:
- episode phase;
- trajectory;
- central question;
- latest/recent beats;
- active thread IDs/summaries;
- key visible/focused entities;
- continuity anchors;
- pressure points;
- resolution signals;
- present-turn narrative opportunity;
- explicit anti-forcing boundaries;
- confidence/fallback metadata.

Supported phases are deterministic:
`OPENING`, `DEVELOPMENT`, `COMPLICATION`, `ESCALATION`, `TURNING_POINT`, `RESOLUTION`, `AFTERMATH`, `PAUSED`.

N17 deliberately does not synthesize a canonical future event. Its `narrativeOpportunity` describes what the current turn can emphasize without forcing a new state.

## Authority boundaries
N17 never:
- writes to the repository;
- creates plot beats;
- closes/resolves threads;
- creates durable memories;
- changes relationship, NPC, location, time, inventory, or combat state;
- reveals hidden or unauthorized facts;
- decides a consequential player action;
- treats a projected phase as an obligation.

The projection expires after the narration turn.

## Producer -> contract -> consumer
`CurrentSituation + persisted accepted-turn history + NarrativeContinuityState + bounded research`
-> `NarrativeEpisodeProjectionEngine.resolve()`
-> `NarrativeDirector.episodeProjection`
-> `NarrativePromptBuilder` N17 section
-> narrative provider.

Compact-path consumers retain N17 through the existing hard-budget prompt paths.

## Failure / fallback
- Empty history produces OPENING with explicit fallback metadata instead of inventing prior beats.
- Missing threads, memory evidence, or optional continuity state do not throw.
- Low-confidence context remains bounded to current scene and supplied history.
- Existing canonical and epistemic boundaries remain stronger than N17.

## Verification targets
- development projection from multi-turn history;
- escalation projection from canonical continuity pressure;
- aftermath projection only with resolution signals and releasing momentum;
- bounded opening fallback with no history;
- NarrativeDirector integration without persistence;
- compact prompt visibility;
- future player agency and thread-mutation boundaries;
- full regression, build, contracts, and Release Gate.
