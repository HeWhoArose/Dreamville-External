# Dreamville — Master Narration Architecture Audit (2026-10-11)

Evidence-driven audit of the live narration runtime. Repository code is the source of truth.
Commit base: `0614dd98` (main) + working-tree fixes listed in §9.

## A. Architecture map (verified against code)

```
Browser (StoryView.tsx)
  │  POST /api/game/action  (ActionRequest, CUSTOM_ACTION etc.)
  ▼
server/api/gameRoutes.ts  →  ServerMockAuthority.runFreeformAction
  │  (worldRepository.runWithPersistenceBatching)
  ▼
ServerMockAuthority.ensureNarration (serverMockAuthority.ts ~1201)
  │  generateNarrativeOnly() on worldRepository.getAiOrchestrator()
  ▼
MultiModelOrchestrator.generateNarrativeOnly (aiOrchestrator.ts:7752)
  ├─ CurrentSituationBuilder.build          (canonical scene: location/time/NPCs)
  ├─ interpretPlayerIntent                  (deterministic+AI intent, PlayerIntent)
  ├─ NarrativeResearchPipeline / SemanticNarrativeResearch
  ├─ StoryBeatDirector.resolve / NarrativeDirector (ephemeral plan)
  ├─ WorkingContextEngine.assembleTurnContext (memory + continuity + budget)
  ├─ NarrativePromptBuilder.buildNarrationPrompt (contract: canonical constraints
  │    incl. exact-entity-name rule, output JSON contract)
  └─ executeTaskGeneration('narrative.generate')
       ├─ candidate chain from orchestrator_config.json fallbackChains
       │    (gemini-3.5-flash → 3.8 → 2.5 → groq qwen3.8-27b → openrouter free ×2 → emergency)
       ├─ per-candidate: adapter.generate (timeout/abort, model ops, health/quota tracking)
       ├─ contractValidator = validateTurnPackage + pacing + continuity + intent-safety
       │    + information-topic/info-continuity + temporal guards (aiOrchestrator.ts:8107)
       └─ on total failure: DeterministicEmergencyFloorAdapter (aiOrchestrator.ts:~900)
            → validateNarrativePresentation (last chance) → synthesizeFreeformActionFallback
  ▼
turnResult: turnPackage {narrative[], dialogue[], events[], stateChanges[], memoryCandidates[], audioCues[]}
  ├─ NarrativeStateAdjudicator.adjudicate → (route) .commit  — AI state proposals need
  │    independent canonical authorization; unverified proposals never commit (narrativeStateAdjudicator.ts)
  ├─ narrativeContinuityEngine.recordTurn → narrativeMemoryLifecycle.processTurn → MemoryEngine
  ├─ dialogue: persisted to runtimeState.dialogueHistory; activeDialogue persisted+restored
  ▼
HTTP response { narrativeResponse, narrativeGeneration, narrativeError?, viewState }
  ▼
StoryView.tsx renders prose (+ narrativeError card w/ attempts trail + Retry)
```

Key ordering property (verified): canonical mechanics → validate → adjudicate/mutate → record memory.
Emergency narration passes the same presentation validator before being returned.

## B. Component integration matrix (narration-critical)

| Component | Actual responsibility | Tests | Confirmed defects |
|---|---|---|---|
| gameRoutes /action | entry, persistence batching, travel promo | ch13/ch16 | none open |
| ensureNarration | orchestrates AI narration + fallbacks + errors | marathon, liveRuntimeProof | none open |
| aiOrchestrator.executeTaskGeneration | routing, retries, validation | 46 phase12 tests | FIND-1/2 fixed 10-10 (dialogue aliases, emergency social replies) |
| validateTurnPackage | JSON shape, dialogue normalization, strict stateChanges | incident/matrix suites | FIND-6 fixed 10-11 (truncated JSON leak) |
| continuity guards (information/temporal/topic) | prevent ungrounded answers | narration-continuity tests | none open |
| DeterministicEmergencyFloorAdapter | last-resort method-specific narration | phase12 social test | regex-literal bug fixed 10-11 |
| NarrativeStateAdjudicator | canonical authorization of state proposals | ch15/audit suites | none open |
| narrativeContinuityEngine + MemoryLifecycle | plot beats, episodic memory | n4/n10/n12/n19 suites | none open |
| serverMockAuthority persistence | dialogueHistory + activeDialogue restore | persistence tests | FIND-3 fixed 10-11 (activeDialogue restore) |

## C. Findings register

| ID | Sev | Evidence | Root cause | Fix | Regression test | Verification |
|---|---|---|---|---|---|---|
| FIND-1 | Critical | Turn #4 live failure, attempt 1 | pre-83211daa build rejected valid dialogue using alias fields (`{name, content}` etc.); old error string "Dialogue entries must contain valid speaker and text." | commit 83211daa (already in HEAD): dialogue alias normalization | phase12 dialogue-aliases test | PASS (46/46 file suite) |
| FIND-2 | Critical | Turn #4 live failure, attempts 2–3 | emergency floor had no social-answer branch; info-continuity guard correctly rejected ungrounded output | commits a9e47b8a+0614dd98 (already in HEAD) + regex-literal repair | phase12 social-reply test; incident-repro.turn4 | PASS |
| FIND-4 | Critical | aiOrchestrator.ts:963,965 byte-level `\\b` inside regex literals | double-backslash escaped word boundaries → patterns never matched → social branch dead code | replaced `\\b` with `\b` (two lines only) | static lint test in phase12 file | PASS |
| FIND-3 | High | serverMockAuthority.ts:191 activeDialogue always null on reload | activeDialogue not persisted; dialogueHistory persisted but unused for pointer restore | persist activeDialogue; restore via persisted node or latest NPC history entry (deriveActiveDialogueFromHistory) | tsc clean; persistence behavior exercised by marathon-style suite | PASS |
| FIND-5 | Medium | narrativePromptBuilder.ts:226 | nothing in prompt pinned NPC name spelling ("Beren"→"Barren" drift) | added canonical constraint: use entity names exactly as spelled | prompt-constraint present in built prompt | PASS |
| FIND-6 | High | incident-matrix truncated-JSON case | strings that start with `{`/`[` but fail JSON parse were returned as `narrative:[raw-json]` prose when allowPlainTextNarration set | refuse plain-text fallback for JSON-envelope-looking output (aiOrchestrator.ts:6629) | incident-matrix truncated-JSON test | PASS |
| LIVE-1 | Info | UI shows raw attempt trail and Retry | requires running app with provider creds | n/a (UI confirmed by code paths StoryView.tsx:1410-1445) | — | requires live human test |

## D. Tests added
- tests/incident-repro.turn4.test.ts — deterministic replay of the reported live failure chain.
- tests/incident-matrix.narration.test.ts — 8 malformed-output/recovery cases (matrix #22–27).
- tests/marathon-segment-driver.mts — 100+ turn long-session driver via the real HTTP pipeline.
- phase12 additions: production typo phrasings (`thyroid Citadel`, misspelled NPC) + regex-literal static lint.

## E. Scenario matrix mapping (1–30)
1–9: covered by existing narrative/ch13/ch16/ch20 suites (movement, inspection, unknown NPC,dialogue).
10: misspelled-name → phase12 new test. 11–14: marathon segments + worldActivityDirector tests.
15–17: narration-context + continuity suites. 18–20: stateChange strict validation + ch16 gap closure.
21: story beat suite. 22–25: incident-matrix file. 26–27: incident-matrix emergency tests.
28: persistence tests + FIND-3 fix. 29–30: marathon driver + degradation segments (marathon seg 4).

## F. Verification record (2026-10-11)
- `npx tsc --noEmit` → exit 0.
- Representative regression runs: phase12+incident+matrix (72), narration/N-suites (101), chaos (5),
  ch1–6 surgical (168), broadSubsystems (60), liveRuntimeProof+manual-failover (57), marathon-driver (100 turns).
- `npm run build` → PASS (dist/server.cjs, vite+esbuild).
- `node scripts/verify-release-contract.mjs` → PASS.
- Restoration note: long-session driver initially overwrote `server/data/orchestrator_config.json`
  via the orchestrator's own config persistence; prod chain restored via git checkout and re-verified (72/72 + release gate PASS).
- Outstanding live requirements: real provider gameplay pass (LIVE-1), browser sign-in and
  interactive dialogue visual checks (no browser automation in this environment).

### Incident cause summary (audit §6)
1. Qwen dialogue invalid → strict legacy parser (FIND-1). Raw response not recorded server-side
   (attempts trail stores error strings only — recommend recording normalized-vs-rejected shapes as follow-up).
2. Fallback failed because its social branch never executed (FIND-4) and older floor output was ungrounded (FIND-2).
3. Emergency floor DID receive canonical location + action via executeTaskGeneration options; it did not
   receive addressed-NPC identity before the fix because visibleEntities extraction ran but patterns were inert.
4. Guards rejected *insufficient-evidence* output, not correct output.
5. Traveler "disappearing" stemmed from Turn #2's search narration resolving a blurry observation without
   commitment — deterministic rules require non-commitment; user-facing consequence is ambiguous guidance, not a defect.
6. Beren/Ivara were authoritative ambient NPC spawns (worldActivityDirector.PEOPLE); "Barren" was
   model respelling of Beren (FIND-5 addresses prompt-side; normalization tolerates alias dialogue).
7. Correct UI behavior on dialogue-fail-but-narration-valid: degrade to narration without Retry wall —
   implemented: turn-package with empty dialogue is valid when narrative exists (validateTurnPackage keeps narrative).
