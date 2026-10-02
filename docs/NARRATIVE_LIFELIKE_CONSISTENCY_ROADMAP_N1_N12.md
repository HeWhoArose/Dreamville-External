# Narrative Lifelike & Consistent Narration Roadmap — N1 to N12

Status: **N10 verified — N11 not started**
Branch: `feat/narrative-quality-n1`
Scope: Dreamville External narration/presentation layer only. The separate authoritative core engine remains authoritative.

## Goal

Move Dreamville narration from a system optimized mainly for **canonical correctness** into a system that also produces **lifelike, consistent, varied, character-aware and interesting scenes**.

The design is informed by publicly documented Friends & Fables / Franz architecture, but it is not a source-code clone. Friends & Fables' proprietary implementation is not public; this roadmap only adopts the documented architectural lessons.

## Non-negotiable architectural rule

Every phase must be connected before it is considered implemented.

For each new engine/component we must document and verify:

1. **Who calls it.**
2. **What inputs it is authoritative over.**
3. **What it calls.**
4. **What consumes its output.**
5. **What controls enable/disable or change its behavior.**
6. **What happens on failure.**
7. **How fallback behaves.**
8. **What tests prove the connection.**
9. **What existing behavior must remain unchanged.**

No phase is complete when a class merely exists without a production caller and downstream consumer.

## Turn architecture target

```
Player Action
  ↓
Intent Interpretation
  ↓
Narrative Research
  ↓
Working Context
  ↓
Narrative Quality Controls / Scene Direction
  ↓
Narration Model
  ↓
Semantic + Narrative Quality Review
  ↓
Canonical Adjudication
  ↓
Narrative Memory / Plot / Thread Lifecycle
  ↓
Next Turn
```

The deterministic game/core systems remain authoritative for state.

---

# N1 — Narrative Quality Specification & Control Contract

### Objective

Define measurable quality requirements before adding literary subsystems. N1 is the contract layer that tells every later phase **what "good narration" means and how a turn is allowed to behave**.

### Deliverables

- Versioned `NarrativeQualityContract`.
- Explicit quality dimensions:
  - scene grounding
  - action fidelity
  - specificity
  - pacing
  - sensory variety
  - character distinctiveness
  - emotional continuity
  - novelty / repetition avoidance
  - coherence
  - player agency
- Explicit turn-shape controls:
  - MICRO_ACTION
  - DIALOGUE
  - EXPLORATION
  - INFORMATION_SEEKING
  - MOVEMENT
  - COMBAT
  - REVELATION
  - STANDARD
- Per-turn response-shape guidance rather than a universal "2–3 paragraphs" rule.
- Deterministic contract validation for hard structural failures.
- Advisory quality metrics reserved for later richer review phases.

### Connection

```
PlayerIntent
  ↓
NarrativeQualityContractEngine.resolveTurnProfile()
  ↓
buildNarrationPrompt()
  ↓
Narration model
  ↓
SemanticNarrativeReview + N1 contract checks
```

### Controls

The contract must expose explicit configuration for:

- enabled quality dimensions
- enforcement mode
- maximum paragraph count
- preferred response shape
- minimum scene grounding
- repetition checks
- whether quality failures are advisory or rewrite-triggering
- fallback behavior

### Completion gate

- Production narration invokes N1.
- Prompt visibly receives N1 instructions.
- Review consumes N1 rules.
- Tests prove caller → engine → prompt → model → review.
- No orphan N1 classes.
- Existing semantic safety tests remain green.

---

# N2 — Persistent Narrator Voice & Style State

### Objective

Give Dreamville a stable narrator identity that survives model/provider fallback.

### Build

A versioned narrator profile containing:

- voice/cadence
- sentence rhythm
- descriptive density
- emotional distance
- metaphor tolerance
- humor level
- darkness/intensity
- sensory preference
- dialogue presentation
- forbidden/repetitive stylistic patterns
- world-specific vocabulary preferences

### Connection

```
StoryRun / NarrativeProfile
  ↓
NarratorVoiceResolver
  ↓
N1 Quality Contract
  ↓
Narration Prompt
  ↓
Every provider
```

### Critical requirement

Changing from Gemini → Qwen → another provider → emergency fallback must not silently change the narrator personality.

---

# N3 — Semantic Narrative Research

### Objective

Upgrade retrieval from mostly lexical relevance to intent-aware narrative research.

### Build

Research should answer:

> What information does a competent GM need for this exact player action?

Research inputs:

- player intent
- current scene
- explicit target
- relationship context
- recent consequences
- open threads
- relevant memories
- plot
- NPC knowledge
- player knowledge
- causal provenance
- world activity

### Connection

```
PlayerIntent
 + CurrentSituation
        ↓
NarrativeResearchEngine
        ↓
WorkingContext
        ↓
Narrative Director / N5
```

### Requirement

Do not dump broad context merely because it is available.

---

# N4 — Narrative Continuity State

### Objective

Create a first-class narrative state separate from raw canonical game state.

### Track

- current emotional temperature
- scene tension
- unresolved subtext
- active conversational tension
- relationship trajectory
- scene momentum
- recent sensory motifs
- recent narrative beats
- recent response shapes
- current narrative focus

Canonical game state remains authoritative for world truth.

Narrative continuity records how the current moment should be presented.

### Connection

```
Canonical Events + Accepted Narration
        ↓
NarrativeContinuityState
        ↓
Next-turn Research
        ↓
N1/N5/N6
```

---

# N5 — NPC Cognition & Agency Integration

### Objective

Fuse existing NPC memory, knowledge, relationships, goals and autonomy into one coherent decision-to-dialogue path.

### NPC context

```
NPC identity
 + authorized knowledge
 + personal memories
 + beliefs
 + relationship
 + fears
 + desires
 + active goal
 + current activity
 + current observation
 + current plan
        ↓
NPC decision
        ↓
dialogue/action proposal
        ↓
narration
```

### Requirement

Two NPCs receiving the same player action must be capable of producing meaningfully different reactions when their canonical personalities/goals differ.

---

# N6 — Literary Quality Review

### Objective

Expand review beyond "did the model obey the rules?"

### Review dimensions

- immersion
- specificity
- sentence rhythm
- scene flow
- dialogue naturalness
- emotional coherence
- character voice
- show vs tell
- useful sensory detail
- pacing
- dramatic clarity

### Connection

```
Narration Output
  ↓
Semantic Review
  +
Literary Quality Review
  ↓
combined decision
  ↓
ACCEPT / REWRITE / REJECT
```

### Requirement

Literary review must never override canonical safety rules.

---

# N7 — Trope / Repetition / Novelty Engine

### Objective

Actively prevent AI-style repeated patterns.

### Track

- repeated openings
- repeated sentence forms
- repeated metaphors
- repeated atmospheric words
- repeated body-language cues
- repeated sensory motifs
- repeated NPC gestures
- repeated scene structures
- repeated generic phrases
- overused tropes

### Behavior

The engine does not ban a word simply because it appeared once.

It detects **overuse over a rolling narrative window**.

### Connection

```
Accepted narration history
        ↓
Novelty/Repetition Engine
        ↓
N1 controls
        ↓
Narrator instructions
        ↓
N6 review
```

---

# N8 — Adaptive Pacing & Response Length

### Objective

Stop every turn from looking like the same 2–3 paragraph template.

### Turn-sensitive response profiles

- micro action → compact
- short dialogue exchange → compact
- routine movement → concise
- exploration → moderate
- new location → expanded
- major revelation → expanded
- emotional turning point → expanded
- combat micro-turn → action-first and compact
- scene transition → medium
- player continuation prompt → context-sensitive

### Connection

```
Intent + Scene State + N1 + N4
        ↓
Pacing Controller
        ↓
max output / paragraph preference / scene emphasis
        ↓
Narration Prompt
```

---

# N9 — Fallback Voice Preservation & Provider Handoff

### Objective

Make provider failure invisible to the player's narrative experience.

### Build

- persisted narrator voice fingerprint
- current scene style state
- provider-neutral style contract
- fallback continuation checkpoint
- model handoff metadata

### Connection

```
Primary Model
   ↓ failure
Provider Handoff State
   ↓
Same N1 + N2 + N4 context
   ↓
Fallback Model
```

### Requirement

Fallback must change **provider/model**, not the story's personality or canonical context.

---

# N10 — Narrative Golden Regression Suite

### Objective

Test narrative quality as a first-class engineering concern.

### Test families

- 1-turn semantic fidelity
- 10-turn continuity
- 20+ turn character memory
- NPC personality differentiation
- emotional continuity
- hidden-knowledge protection
- trope/repetition pressure
- response-length variation
- plot/thread continuity
- fallback model continuity
- low-context-budget degradation
- long-session stability

Tests should assert structured properties, not demand one exact prose string.

---

# N11 — Long-Session Stress & Drift Testing

### Objective

Prove the system remains coherent over 100+ turns.

### Measure

- context growth
- memory retrieval degradation
- repeated imagery
- character drift
- relationship drift
- plot drift
- fallback degradation
- latency
- token budget behavior
- orphaned narrative state
- thread resolution accuracy

### Requirement

A 100-turn campaign must not progressively collapse into generic narration.

---

# N12 — Final Integrated Narration Audit

### Objective

Run the complete audit loop.

```
AUDIT
 ↓
IMPLEMENT
 ↓
TYPECHECK
 ↓
UNIT TEST
 ↓
INTEGRATION TEST
 ↓
FALLBACK TEST
 ↓
LONG-SESSION TEST
 ↓
RE-AUDIT
 ↓
FIX
 ↓
npm test
 ↓
npm run lint
 ↓
npm run build
 ↓
FINAL CONNECTION AUDIT
```

### Final connection audit

For every N1–N12 engine:

- caller confirmed
- inputs confirmed
- outputs confirmed
- downstream consumer confirmed
- control surface confirmed
- failure path confirmed
- fallback path confirmed
- tests confirmed
- no orphan subsystem
- no duplicate authority
- no core-engine boundary violation

---

# Cross-phase dependency map

| Phase | Depends on | Feeds | New AI call required? |
|---|---|---|---|
| N1 | PlayerIntent, Prompt Builder, Review | N2–N12 contract | No |
| N2 | N1, NarrativeProfile | Prompt + fallback | No |
| N3 | N1, CurrentSituation, Memory, World | Working Context | Possibly, only where justified |
| N4 | Canonical events, accepted narration | Research + planning | No |
| N5 | NPC authority, Memory, Relationships, N1 | Dialogue/Narration | Possibly |
| N6 | N1, narration output | Rewrite/accept decision | Possibly |
| N7 | N1, N4, narration history | Prompt + Review | No |
| N8 | N1, N4, Intent | Prompt/output budget | No |
| N9 | N1, N2, N4, Orchestrator | Fallback provider | No new model class |
| N10 | N1–N9 | CI/release gates | Test-only |
| N11 | N1–N10 | CI/release gates | Test-only |
| N12 | N1–N11 | Release readiness | Test-only |

## Global rule for model calls

Do not add an LLM call merely because another system does it.

Every AI call must have:

- a task contract
- a narrow context contract
- an explicit caller
- an explicit consumer
- a call budget
- a timeout
- a fallback policy
- validation
- telemetry
- a test proving its necessity

## N1 implementation status

- [x] Roadmap documented
- [x] Contract implemented
- [x] Prompt connected
- [x] Review connected
- [x] Tests added
- [x] npm test green
- [x] lint green
- [x] build green

N1 verification completed green on PR #27: lint, full npm test, production build, and release-contract gate all passed on the final N1 commit. N2 implementation and verification completed on PR #28. N3 implementation and verification completed on PR #29. N4 implementation and verification completed on PR #30. N5 implementation and verification completed on PR #31. N6 implementation and verification completed on PR #32. N7 implementation and verification completed on PR #33. N11 must not begin until N10 is intentionally accepted/merged.
