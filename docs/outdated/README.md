# Outdated / Superseded Documentation — DO NOT IMPLEMENT FROM THIS FOLDER

**This folder is an archive, not an active plan directory.**

Everything stored beneath `docs/outdated/` is a historical, completed, superseded, duplicate, or commit-specific audit artifact. Future developers and AI coding agents **must not use these files as implementation instructions or as the current TODO list**.

Use `docs/README.md` first, then the active subsystem owner document and the latest code/tests. If an active source links here, it is normally linking to historical evidence or to explain why an older approach was rejected.

## What the archive means

- **Completed plan:** its implementation is already recorded in a current verification report. Do not reimplement it because the old file contains tasks or phase steps.
- **Superseded plan/spec:** later scoped owner contracts or the active narrative plan replaced its execution role.
- **Historical audit:** findings and test statuses apply to the commit/environment named in that report. They are not current status for `main`.
- **Duplicate:** a later document owns the same scope; the older copy is kept only so its original findings remain recoverable.
- **Forensic snapshot:** root-level audit output about an earlier subsystem/phase is preserved as history, not a current defect declaration.

## Archive categories

| Folder | Contains | Current source of truth |
|---|---|---|
| `superseded-plans/README_EXTERNAL_CLIENT_BOUNDARY_HISTORICAL.md` and `EXTERNAL_PROJECT_SPEC_CLIENT_ONLY_HISTORICAL.md` | Previous external-client-only repository identity/specification, superseded by the integrated-engine boundary in the root README and current project specification | Current root `README.md`, `EXTERNAL_PROJECT_SPEC.md`, and `docs/README.md` |
| `plans/` | Old stand-alone Phase 1 and cross-cutting draft, the earlier broad 0–21 implementation spec, old model-intelligence runtime spec, and superseded handoff plans | `docs/ACTIVE_NARRATIVE_GROUNDING_AND_LIVE_VALIDATION_PLAN.md`, the current owner contracts listed in `docs/README.md`, and current code |
| `completed-plans/` | Plans whose implementation is verified or whose phase roadmap is complete | Current verification report and `docs/README.md` |
| `completed-audits/` | Pre-implementation/source-only audits superseded by final runtime audits | Latest owner-specific final audit |
| `phase-8-5/` | Repeated historical Phase 8.5 audit passes, pre-implementation audit, forced-movement audit, and initial Phase 8.6–8.12 audit | Current canonical owner/specs; do not continue from an old pass number |
| `phase-17-to-24/` | Historical integration, orphan audit, release-gate, stabilization and phase-23/24 audit snapshots | Current code/CI and active owner contracts |
| `historical-audits/` | Date-specific S1–S7 and S3–S5 audit/verification reports | Current source plus the active scoped specifications |
| `forensic-snapshots/` | Old root-level challenge/forensic report files | Current code/tests; re-open a defect only if still reproducible |

## Hard rule for future agents

Before making changes:
1. Read `docs/README.md`.
2. Read the active subsystem owner document.
3. Inspect the live code path and its callers/consumers.
4. Run or inspect current tests/CI.
5. Implement only a current, reproduced gap.

Do not carry out an archived checklist just because a document uses words like “Phase”, “required”, “pending” or “next”. Those words describe its historical checkpoint.

The original documents are intentionally retained; they have not been deleted. Their archive paths are recorded in `docs/README.md`/the repository history when useful.
