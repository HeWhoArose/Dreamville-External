# Dreamville Phase 22 — Release Stabilization & Integration Closure

Phase 22 is the final stabilization layer for the Phase 16–21 implementation stack.

## Purpose

This phase does not create another competing narrative architecture. It closes integration gaps discovered by the release gate and verifies that the Phase 16–21 producer→consumer graph remains intact under partial, stale, malformed, unavailable, and fallback conditions.

## Closure rules

1. Canonical state remains authoritative; presentation systems never mutate it.
2. CurrentSituation is the shared read model for narrative, research, suggestions, and visual context.
3. Explicit player intent outranks incidental textual relevance when selecting scene entities.
4. Player-authorized knowledge may re-enter context; unauthorized world truth must remain filtered.
5. Optional/partial context must fail safely rather than throw.
6. Media failure returns a typed presentation fallback and never blocks canonical gameplay.
7. Release evidence must distinguish local validation from GitHub CI validation.

## Producer → consumer closure

| Producer | Contract | Consumer | Failure floor |
|---|---|---|---|
| WorldRepository seed | canonical geography/entities/rumor/thread | CurrentSituation | deterministic seeded scene |
| EntitySceneRelevanceEngine | bounded relevance scores | VisualSceneContext / action advice | visible same-location projection |
| WorldRepository knowledge | authorized fact projection | WorkingContext / NarrativeResearch | empty authorized set |
| NarrativePromptBuilder | player-safe prompt contract | narrative provider | deterministic emergency narration |
| MediaAdapterService | presentation result | scene route / StoryView | prompt/placeholder fallback |
| Release verifier | source contracts | release gate | fail-fast |

## Required verification

- npm run verify:contracts
- npm run lint
- npm test
- npm run build

The stacked release branch may execute these through GitHub Actions. If a command has not been run locally, the report must say so explicitly.

## Exit criteria

Phase 22 is complete only when:
- Phase 16 visual freshness and source-action identity remain enforced.
- Phase 17 integration matrix still traces real producers and consumers.
- Phase 18 harness covers primary, fallback, emergency, malformed, empty, partial, and canonical-commit-failure paths.
- Phase 19 verification discipline remains fail-fast.
- Phase 20 orphan audit contains no known release-critical orphan.
- Phase 21 release gate is wired to contracts → lint → test → build.
- Phase 22 stabilization tests pass and no new orphaned authority is introduced.


## External architecture research — 2026-10-01

Independent review against current Friends & Fables / Craft architecture and recent AI-agent/game-state research identified the following additional gaps to carry forward. These are architectural findings, not claims that every reference system is correct.

| Finding | Dreamville state | Required direction |
|---|---|---|
| Typed canonical action outcome | Current freeform narration boundary still passes `committedOutcome` as a string. | Introduce a typed ActionResolution/Outcome envelope containing intent, attempted effect, actual effect, resolution basis, outcome tier, canonical changes, evidence IDs, and player-visible consequence guidance. |
| Intra-location spatial state | Player lifecycle has canonical `locationId`, but no durable position/proximity model inside a location. | Add a bounded spatial/proximity context so “move closer”, “circle behind”, “parkour toward”, etc. can change future affordances without fabricating a new map location. |
| Check necessity gate | Skill checks are still partly selected from lexical action keywords. | Add a ResolutionGate: NO_CHECK vs DETERMINISTIC vs CHECK vs COST/PARTIAL, based on world rules, scene danger, capability/opposition, and meaningful uncertainty before selecting a skill. |
| Outcome tiers | `StoryCheckResult` is primarily binary success/failure. | Support at least success, success-with-cost, partial achievement, block, and failure-with-proportional-consequence where the active ruleset permits them. |
| NPC-specific memory/planning | Entity-linked memories and NPC agency exist, but there is no clearly isolated actor-specific “last interactions → NPC plan” boundary in the main freeform turn path. | Add a cheap NPC interaction memory slice + actor-specific planning context when a turn actually addresses that NPC. |
| Objective vs subjective memory | Knowledge facts track actor belief states and memories have visibility/provenance, but objective event evidence and subjective recollection are not fully separated as first-class records. | Keep canonical events/chronicles immutable and let actor memories reference them as evidence without rewriting objective history. |
| Resumable multi-owner commit | CanonicalCommandEngine has idempotency and rollback/staged transactions. | Add a durable commit ledger/checkpoint model for interrupted multi-owner writes so recovery can resume missing owners rather than relying only on whole-transaction rollback. |
| Context control transparency | WorkingContext already has priority bands, expiry, idle/archive states, and research budgets. | Expose source provenance, active/idle/archived status, and manual pin/override semantics in the player-facing context tooling rather than keeping this only server-side. |
| Model/scaffolding balance | Extensive deterministic guards remain around semantic behavior. | Prefer small deterministic contracts at authority boundaries and richer model reasoning inside bounded evidence; avoid growing a second regex-based narrative interpreter. |

The external references emphasize: research before narration, bounded working context, explicit separation of player intent from resulting effect, canonical state before prose, actor knowledge firewalls, evidence-backed memory, proportional outcome tiers, and recoverable state commits. citeturn186781search1turn767362view1turn248734view0turn248734view1

Friends & Fables also reports that its earlier planning architecture was changed because planning could become harmful to performance, and in May 2026 the planning step was temporarily disabled while the model mix was refreshed. This reinforces that Dreamville's plan should remain cheap, ephemeral, and optional rather than becoming another heavyweight always-on agent call. citeturn248906search2turn233580search1

The current research also reinforces why lexical check selection must stay subordinate to a semantic resolution gate: modern evidence-gated RPG architectures explicitly distinguish genuine uncertainty from situations resolved by capability, preparation, leverage, equipment, environment, cost, or established rules. citeturn660615view0turn248734view0

## Check-resolution consequence closure

The action-resolution boundary now treats a story check as a causal chain rather than a bare dice result:

PLAYER ACTION
→ check necessity / scene evidence
→ selected test and skill
→ canonical roll and result
→ bounded success/failure guidance
→ authored canonical consequence when explicitly defined, otherwise narrative-only setback guidance
→ player-facing narration

The contract is carried by `StoryCheckResult.narrativeGuidance`. AI may use the guidance for presentation but cannot create canonical damage, conditions, movement, or other state changes from it. Routine movement remains narration-only unless the canonical scene supplies a genuine movement hazard. AI resolution hints cannot manufacture a check without semantic/action or scene evidence.

Regression coverage includes:
- parkour → Acrobatics with landing/balance failure semantics;
- movement toward a target is not reclassified as Athletics merely because of the word "push";
- physical object displacement still permits Athletics;
- ordinary movement only triggers a save when scene hazards justify it;
- AI skill/save hints cannot manufacture unsupported checks;
- the canonical action path passes check justification and bounded failure guidance into narration.

## Final architecture audit

2026-10-01: Full Phase 0–22 architecture audit performed. The release gate is required on the merged main tree; branch-level validation and post-merge validation are both recorded separately.
