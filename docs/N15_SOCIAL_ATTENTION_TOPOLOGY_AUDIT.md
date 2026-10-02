# N15 — Social Attention / Conversation Topology Audit

## Scope
N15 extends the canonical `EntitySceneRelevanceEngine` into an ephemeral social-attention projection used by narrative presentation.

## Pre-implementation audit findings
- `EntitySceneRelevanceEngine` is the existing relevance authority; no second scene-relevance engine was introduced.
- `CurrentSituation` already exposes the bounded inputs required for N15: visible/present entities, distance bands, explicit targets, active dialogue, current intent, open threads, recent interaction text, and local spatial projection.
- `NarrativeDirector` is the existing ephemeral presentation-plan authority and already carries NPC cognition contracts.
- `DynamicCharacterAgencyEngine` remains canonical for NPC personality/relationship state. N15 does not duplicate or synthesize trust, affection, respect, fear, or hostility values.
- `SceneCompositionEngine` remains the presentation-composition authority. N15 supplies participant topology to the existing NarrativeDirector prompt path rather than creating a second scene-composition system.
- No N15 persistence path is permitted.

## N15 contract
The extended relevance engine now projects:
- participant roles: PRIMARY_SPEAKER, SECONDARY_SPEAKER, LISTENER, OBSERVER, OVERHEARER, INTERRUPTER, BACKGROUND, IGNORED, EXCLUDED
- attention weight
- social distance
- hearing/visibility
- intervention/interruption capability
- relationship relevance based only on already-available scene interaction evidence
- topic relevance
- spatial relevance

The projection is deterministic, bounded, and expires after narration.

## Security / authority boundary
N15 never:
- invents hidden entities;
- exposes non-visible participants through prompt serialization;
- changes canonical social relationships;
- chooses an NPC action;
- converts a presentation role into canonical state.

`EXCLUDED` is retained for bounded internal projection of already-present situation entries such as absent/dead entities; prompt serialization filters excluded participants.

## Integration
Producer -> contract -> consumer:
`CurrentSituation + PlayerIntent` -> `EntitySceneRelevanceEngine.toConversationTopology()` -> `NarrativeDirector.socialTopology` -> `NarrativePromptBuilder` N15 section -> narration prompt path.

Reverse trigger:
player turn/intent builds Current Situation, then Narrative Director constructs the ephemeral plan for the same turn.

## Verification
Targeted tests cover:
- multi-NPC dialogue topology
- active speaker / listener / overhearer roles
- explicit interruption semantics
- empty-scene fallback
- prompt boundary serialization
- NarrativeDirector integration
- no canonical command-event mutation
- non-dialogue observation fallback


## Compact-path verification
N15 is serialized as its own prompt section by the existing Narrative Prompt Builder. This prevents prompt-budget truncation of the social contract merely because the broader Narrative Director plan is compacted.

The compact prompt audit uses the existing supported prompt-budget boundary without changing legacy compaction thresholds; N15 remains a first-class section in all existing compact serialization paths.
