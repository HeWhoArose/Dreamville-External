# N14 — NPC Expressive Identity

Date: 2026-10-02
Status: implementation complete — full regression and Release Gate verified

## Audit before implementation

The existing `DynamicCharacterAgencyEngine` remains the sole canonical NPC agency/personality/relationship authority. `NpcPlanningSlice` provides authorized knowledge and current goal context, while `NarrativeDirector` already produces `NpcCognitionContract` objects for the final narration prompt.

The missing layer is expressive projection: how an already-authorized NPC sounds, pauses, uses vocabulary, reacts conversationally, and presents restrained mannerism cues.

## Architecture

`DynamicCharacterAgencyEngine` → `NpcExpressiveIdentityEngine` → `NarrativeDirector.NpcCognitionContract` → existing narration prompt

N14 is presentation-only and ephemeral. It does not create or persist NPC agency, goals, beliefs, relationships, secrets, knowledge, actions, or canonical state.

## Safety/fallback

N14 derives only from existing authored `dialogueStyle`, personality scores, traits, values, and scene role. It does not invent catchphrases or verbal tics when no source signal exists. In sparse cases it emits conservative defaults and a fallback reason.

## Verification

The final implementation passed targeted N14 projection/differentiation/fallback/authority/prompt-path coverage, the complete regression suite, typecheck/lint, production build, release-contract verification, and all three GitHub verification/release gates for the implementation commit. Post-merge authority verification remains required after merge.