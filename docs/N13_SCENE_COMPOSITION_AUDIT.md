# N13 — Scene Composition / Dramaturgy

Date: 2026-10-02
Status: implementation under verification

## Audit result

Dreamville already had separate controls for intent, research, NPC cognition, continuity, pacing, novelty, narrator voice, semantic review, and literary review. What was missing was a first-class presentation-stage contract describing how an already-authorized turn should be staged without becoming a second canonical authority.

The live integration is:

Player Intent + Current Situation + bounded Research
  -> Narrative Director ephemeral plan
  -> N4 continuity + N8 pacing
  -> SceneCompositionEngine
  -> NarrativePromptBuilder
  -> narration provider
  -> semantic/literary review

## Authority boundary

N13 is presentation-only. It cannot:

- mutate canonical state
- resolve mechanics
- choose a player decision
- authorize hidden knowledge
- mutate NPC agency
- mutate relationships or memory
- commit a location or world-time change

## Contract

The contract provides scene objective, beat type, narrative focus, focal entity, emotional beat/movement, physical beat, sensory anchor, dialogue act, subtext, reveal/withhold guidance, reaction priority, tension direction, pacing shape, closing beat, optional hook, confidence, and fallback reason.

It expires after narration and is not persisted as canonical state.

## Deterministic/fallback policy

N13 uses existing authoritative inputs and requires no additional LLM call. Missing continuity, sensory anchors, or reaction participants degrade deterministically and record a fallback reason. The final composition is generated in NarrativePromptBuilder after the actual N4 continuity and N8 pacing contracts are resolved, avoiding an early duplicate composition authority in NarrativeDirector.

## Verification

Completion requires targeted N13 coverage plus the existing full test, typecheck, production build, release-contract verification, fallback/uncertainty coverage, prompt-budget coverage, and a post-test producer/consumer audit.