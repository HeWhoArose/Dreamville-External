# Final N1-N19 — 120-Turn Integrated Audit

## Scope

This is the final integrated regression/audit pass after N19. It exercises the complete narrative presentation path for 120 consecutive turns and verifies that the N13-N19 additions remain connected to the existing N1-N12 architecture.

The audit is intentionally longer than the established 100-turn N11 stress test so it can exercise the same bounded-session mechanisms with the newer presentation layers and provider-routing recovery paths enabled.

## Authority graph audited

WorldRepository / canonical state
→ CurrentSituationBuilder
→ deterministic PlayerIntentInterpreter
→ NarrativeResearchPipeline + MemoryOpportunityEngine
→ NarrativeDirector
→ NPC Planning / Expressive Identity
→ Social Attention / Conversation Topology
→ Narrative Episode Projection
→ Scene Composition
→ NarrativePromptBuilder
→ N19 model-quality selection
→ provider / fallback / emergency floor
→ semantic review
→ literary review
→ N18 richness evaluation
→ NarrativeStateAdjudicator
→ canonical commit boundary.

No N13-N19 component is permitted to become a canonical world/state authority.

## N13-N19 contract coverage

- N13 Scene Composition: verified in the live narration prompt on all audited turns.
- N14 NPC Expressive Identity: verified through live NPC cognition contracts with an ephemeral expressive identity.
- N15 Social Attention / Conversation Topology: verified through live NarrativeDirector plan and prompt serialization.
- N16 Semantic + Episodic Memory Retrieval: verified through the bounded narrative-research path exercised every turn; dedicated N16 tests remain the authoritative retrieval-specific suite.
- N17 Narrative Episode Projection: verified through the live NarrativeDirector plan and prompt serialization.
- N18 Narrative Richness Evaluation: verified on every accepted turn, with all 12 dimensions present and presentation-only status preserved.
- N19 Creative Model Tier & Cadence Routing: verified by ordinary selector operation without pins/configured routes, then exercised through primary → fallback → emergency degradation.

## 120-turn recovery schedule

- Turns 1-60: primary creative model available.
- Turn 61 onward: primary provider forced into failure; eligible AI fallback must recover.
- Turn 91 onward: fallback provider also forced into failure; deterministic emergency floor must recover.

This validates both normal resilience and the final emergency path in the same long-running session.

## Boundedness checks

The audit enforces the existing N11 limits:
- 40 retained narrative context turns
- 120 novelty items
- 6 unresolved subtext entries
- 6 active conversational tension entries
- 8 sensory motifs
- 8 recent narrative beats
- 8 recent response shapes
- 6 narrative-focus items
- 40 plot beats
- 24 plot open threads
- 40 open narrative threads
- research snapshot below 50 KB
- narration prompt remains below the established long-session envelope.

## Canonical-safety checks

Across all 120 turns:
- provider turn packages contain no canonical state changes;
- no state changes are approved by adjudication;
- canonical command-event/player snapshots remain identical before and after the full presentation session;
- provider failures do not bypass semantic/review/state boundaries;
- N18 remains presentation-only;
- N13-N17 remain ephemeral/presentation projections.

## Re-audit finding and correction

The final source audit found one integration gap that the phase-specific N18 tests did not expose:

Scene Composition was correctly resolved into NarrativePromptBuilder, but the resolved N13 composition was not threaded into the plan object passed to NarrativeRichnessEvaluator.

This was corrected without creating a second composition authority:

NarrativePromptBuilder sceneComposition
→ richnessEvaluationPlan.sceneComposition
→ existing N18 evaluator.

The evaluator now observes the same ephemeral N13 projection used for narration, after the actual pacing/continuity inputs are known.

## Final verification status

Required verification remains:
- final 120-turn integrated regression;
- release contract verification;
- type-check/lint;
- full test suite;
- production build;
- Release Gate;
- both Verification lanes;
- post-merge main verification after the final audit change is merged.

The phase is not complete until all required gates are green.
## Second re-audit finding and correction

The integrated 120-turn run then exposed a second production-path gap: the deterministic emergency narration branch restored an accepted turn but did not produce the N18 richness evaluation object.

This was corrected by evaluating N18 after emergency semantic/literary acceptance using the same N13-aware ephemeral composition projection. The emergency result and telemetry now carry the richness evaluation just like the normal provider path.

This preserves the existing emergency authority and does not add another generation/review call.
