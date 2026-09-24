# Phase 15 — Final Acceptance / Clean-Room Handover

Phase 15 is the final cross-system acceptance phase from the Master Implementation Plan.

## Required acceptance surface

- Nine rules × narrative combinations:
  - FULL_DND × PROTAGONIST
  - FULL_DND × SIDE_CHARACTER
  - FULL_DND × FREE_ROAM
  - HYBRID_DND × PROTAGONIST
  - HYBRID_DND × SIDE_CHARACTER
  - HYBRID_DND × FREE_ROAM
  - CUSTOM_HOMEBREW_DND × PROTAGONIST
  - CUSTOM_HOMEBREW_DND × SIDE_CHARACTER
  - CUSTOM_HOMEBREW_DND × FREE_ROAM
- Combat, spells, conditions, death
- World simulation, Free Roam, protagonist and side-character flows
- Persistence and migration
- AI failure/fallback modes
- Deterministic replay
- Stress/scale probes
- Static verification: type-check/lint/build
- Complete repository test suite
- Final repository/diff audit
- Clean-room reconstruction from repository + Master Implementation Plan

## Clean-room procedure

1. Start from a clean checkout of the main branch.
2. Read the Master Implementation Plan v3.
3. Read this file and the Phase 13/14 handover evidence in the repository.
4. Inspect the Phase 15 acceptance matrix from the Developer Diagnostics workstation.
5. Run the repository's complete test command without excluding legacy suites.
6. Run type-check/lint and production build.
7. Compare any failures against the known baseline and the Phase 15 matrix.
8. Fix only verified defects or regressions.
9. Repeat the relevant targeted tests.
10. Repeat the full gate after fixes.
11. Record final results, limitations, pre-existing failures, and any deviations from the plan.

## Authority requirement

The acceptance layer is a verifier. It must not become a second game-state authority. Diagnostic and acceptance UI is read-only unless an existing canonical repair workflow is explicitly invoked.

## Final status rule

Do not mark Phase 15 complete merely because the acceptance code exists. The Master Implementation Plan requires implementation, tests, regression, persistence, authority, performance, diff, repository verification, and documentation evidence before final completion.
