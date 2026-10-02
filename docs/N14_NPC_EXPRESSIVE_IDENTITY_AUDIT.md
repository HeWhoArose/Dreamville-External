# N14 — NPC Expressive Identity

Date: 2026-10-02
Status: implementation under verification

## Audit before implementation

The existing `DynamicCharacterAgencyEngine` remains the sole canonical NPC agency/personality/relationship authority. `NpcPlanningSlice` provides authorized knowledge and current goal context, while `NarrativeDirector` already produces `NpcCognitionContract` objects for the final narration prompt.

The missing layer is expressive projection: how an already-authorized NPC sounds, pauses, uses vocabulary, reacts conversationally, and presents restrained mannerism cues.

## Architecture

`DynamicCharacterAgencyEngine` → `NpcExpressiveIdentityEngine` → `NarrativeDirector.NpcCognitionContract` → existing narration prompt

N14 is presentation-only and ephemeral. It does not create or persist NPC agency, goals, beliefs, relationships, secrets, knowledge, actions, or canonical state.

## Safety/fallback

N14 derives only from existing authored `dialogueStyle`, personality scores, traits, values, and scene role. It does not invent catchphrases or verbal tics when no source signal exists. In sparse cases it emits conservative defaults and a fallback reason.

## Verification target

Targeted tests cover deterministic projection, character differentiation, sparse-data fallback, authority non-mutation, and the real NarrativeDirector prompt path. Full regression, build, release contracts, and post-merge authority audit are required before completion.