# N16 — Semantic + Episodic Memory Retrieval 2.0 Audit

## Scope
N16 strengthens the existing `MemoryOpportunityEngine` retrieval authority and routes narrative continuity research through it. No second memory engine was introduced.

## Pre-implementation audit
- `MemoryOpportunityEngine` is the canonical durable-memory store, visibility filter, decay authority, export/import authority, and existing retrieval implementation.
- `NarrativeContinuityEngine` is the canonical producer of the bounded continuity research packet.
- `NarrativeResearchPipeline` is the canonical relevance/budget selector that consumes continuity memories and turns them into research blocks.
- The previous retrieval path had two competing branches: basic lexical/importance/recency retrieval and a separate explicit-entity scan. The entity branch could outrank or bypass the general scorer.
- Memory visibility was already authoritative and must remain unchanged.
- Universe memories remain a separate, canonical universe-level continuity source; N16 improves world-local retrieval and does not replace that authority.

## N16 contract
`MemoryOpportunityEngine.retrieveNarrativeMemories()` is a deterministic, ephemeral retrieval projection using:
- bounded query/semantic overlap;
- explicit target entity IDs and names;
- location links;
- active-thread links;
- recent canonical source-event links;
- memory class/family fit;
- importance;
- confidence;
- deliberately capped recency contribution;
- persistent-critical floor;
- epistemic visibility filtering;
- deterministic semantic/episodic family diversity when both families are available.

The two memory families are:
- SEMANTIC: semantic facts, source-canon, atomic facts, persistent identity and related durable knowledge.
- EPISODIC: episodic and causal experiences that preserve what happened.

This is deterministic feature-based retrieval, not an embedding/vector database. It is intentionally bounded and auditable.

## Removed duplicate retrieval authority
`NarrativeContinuityEngine.research()` no longer performs a second focused-entity scan with its own sorting rules. It delegates world-local memory retrieval to the canonical memory engine.

## Producer -> contract -> consumer
`CurrentSituation + current action` -> `MemoryOpportunityEngine.retrieveNarrativeMemories()` -> `NarrativeContinuityEngine.NarrativeResearchPacket.memories` -> `NarrativeResearchPipeline MEMORY blocks` -> existing `NarrativeDirector` / narration prompt path.

Reverse trigger:
the current player turn builds Current Situation, then continuity research resolves the memory set for that same turn.

## Failure / fallback
- Unauthorized memories are excluded before scoring.
- Archived/dormant memories remain excluded by default, with persistent-critical protection preserved.
- Empty or partial query context returns an empty bounded result rather than throwing.
- Existing NarrativeContinuityEngine research catch remains the outer provider/store failure floor.
- Universe continuity retrieval remains available independently when world-local retrieval returns little evidence.

## Verification targets
- semantic + episodic family balance;
- old/high-value memories are not displaced solely by recency;
- entity-linked memories remain retrievable when their text omits the entity name;
- epistemic visibility remains enforced;
- deterministic behavior with empty/partial context;
- continuity pipeline carries retrieval evidence without persistence;
- legacy regression suite remains green.
