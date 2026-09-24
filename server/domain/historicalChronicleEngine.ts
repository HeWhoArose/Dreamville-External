import {
  HistoricalEvidence,
  NpcDossier,
  DossierMilestone,
  ChronicleEntry,
} from './historicalEvidence';
import { SignificanceEvaluator } from './significanceEvaluator';
import { WorldTimestamp } from './types';

/**
 * HistoricalChronicleEngine
 * Implements CH4 Phase 2 & Phase 3 (Dossiers & Chronicle) per DreamBook §430–§432, V10.8.17–V10.8.20.
 *
 * Invariants:
 * - Dossiers and chronicles are derived evidence layers; they NEVER replace canonical actor or world state.
 * - Deterministic Deduplication: Identical source evidence IDs are never added twice.
 * - Rebuildability: Derived dossier and chronicle states can be deterministically reconstructed from raw evidence.
 * - Epistemic Boundary: Filters out confidential or unobserved records from player-facing views.
 */
export type ChronicleWriteMode = 'DIRECT' | 'TRANSACTIONAL' | 'ISOLATED';

export class HistoricalChronicleEngine {
  // Runtime Chronicle writes are transactional. Bootstrap construction uses recordBootstrapEvidence().
  public static bypassTransactionCheck = false;

  private evidenceStore: Map<string, HistoricalEvidence> = new Map();
  private dossiers: Map<string, NpcDossier> = new Map(); // subjectId -> NpcDossier
  private chronicleEntries: Map<string, ChronicleEntry> = new Map(); // evidenceId -> ChronicleEntry
  private readonly writeMode: ChronicleWriteMode;
  private transactionOpen = false;
  private transactionCommandId?: string;
  private pendingEvidence: Map<string, HistoricalEvidence> = new Map();

  constructor(options: { writeMode?: ChronicleWriteMode } = {}) {
    this.writeMode = options.writeMode || 'DIRECT';
  }

  public beginCanonicalTransaction(commandId: string): void {
    if (this.writeMode !== 'TRANSACTIONAL') return;
    if (this.transactionOpen) throw new Error('Historical Chronicle transaction is already open.');
    this.transactionOpen = true;
    this.transactionCommandId = commandId;
    this.pendingEvidence.clear();
  }

  public commitCanonicalTransaction(canonicalEventId: string): void {
    if (this.writeMode !== 'TRANSACTIONAL') return;
    if (!this.transactionOpen) throw new Error('No Historical Chronicle transaction is open.');
    const pending = Array.from(this.pendingEvidence.values());
    this.pendingEvidence.clear();
    this.transactionOpen = false;
    const commandId = this.transactionCommandId;
    this.transactionCommandId = undefined;

    for (const evidence of pending) {
      const enriched: HistoricalEvidence = {
        ...evidence,
        metadata: {
          ...(evidence.metadata || {}),
          canonicalCommandId: commandId,
          canonicalEventId,
        },
        sourceEventId: evidence.sourceEventId || canonicalEventId,
      };
      this.commitEvidence(enriched);
    }
  }

  public rollbackCanonicalTransaction(): void {
    if (this.writeMode !== 'TRANSACTIONAL') return;
    this.pendingEvidence.clear();
    this.transactionOpen = false;
    this.transactionCommandId = undefined;
  }

  /**
   * Bootstrap-only evidence insertion used while constructing a canonical story/world.
   * This bypasses command transaction requirements without reopening DIRECT writes for
   * runtime callers; all normal mutation paths must continue through recordEvidence().
   */
  public recordBootstrapEvidence(evidence: HistoricalEvidence): {
    evidenceId: string;
    promotedToDossier: boolean;
    promotedToChronicle: boolean;
  } {
    if (this.writeMode !== 'TRANSACTIONAL') {
      throw new Error('Bootstrap Chronicle writes require a transactional Chronicle engine.');
    }
    if (this.transactionOpen) {
      throw new Error('Bootstrap Chronicle writes cannot run during an active canonical transaction.');
    }
    return this.commitEvidence(evidence);
  }

  private commitEvidence(evidence: HistoricalEvidence): {
    evidenceId: string;
    promotedToDossier: boolean;
    promotedToChronicle: boolean;
  } {
    if (this.evidenceStore.has(evidence.id)) {
      return {
        evidenceId: evidence.id,
        promotedToDossier: false,
        promotedToChronicle: false,
      };
    }

    this.evidenceStore.set(evidence.id, JSON.parse(JSON.stringify(evidence)));

    const evaluation = SignificanceEvaluator.evaluate(evidence);
    if (evaluation.promotedToDossier) {
      this.promoteToDossier(evidence, evaluation.significance);
    }
    if (evaluation.promotedToChronicle) {
      this.promoteToChronicle(evidence, evaluation.significance);
    }

    return {
      evidenceId: evidence.id,
      promotedToDossier: evaluation.promotedToDossier,
      promotedToChronicle: evaluation.promotedToChronicle,
    };
  }

  /**
   * Records a raw historical evidence item, deterministically evaluates its significance,
   * and promotes it to the relevant NPC dossiers and World Chronicle.
   */
  public recordEvidence(evidence: HistoricalEvidence): {
    evidenceId: string;
    promotedToDossier: boolean;
    promotedToChronicle: boolean;
  } {
    if (this.writeMode === 'TRANSACTIONAL' && !HistoricalChronicleEngine.bypassTransactionCheck) {
      if (!this.transactionOpen) {
        throw new Error('Historical Chronicle writes require an active canonical command transaction.');
      }

      if (this.evidenceStore.has(evidence.id) || this.pendingEvidence.has(evidence.id)) {
        return {
          evidenceId: evidence.id,
          promotedToDossier: false,
          promotedToChronicle: false,
        };
      }

      this.pendingEvidence.set(evidence.id, JSON.parse(JSON.stringify(evidence)));
      const evaluation = SignificanceEvaluator.evaluate(evidence);
      return {
        evidenceId: evidence.id,
        promotedToDossier: evaluation.promotedToDossier,
        promotedToChronicle: evaluation.promotedToChronicle,
      };
    }

    return this.commitEvidence(evidence);
  }

  private promoteToDossier(evidence: HistoricalEvidence, significance: import('./historicalEvidence').SignificanceLevel): void {
    const subjectIds = [evidence.primarySubjectId];
    if (evidence.secondarySubjectId && !subjectIds.includes(evidence.secondarySubjectId)) {
      subjectIds.push(evidence.secondarySubjectId);
    }

    for (const subjectId of subjectIds) {
      let candidateName = subjectId;
      if (subjectId === evidence.primarySubjectId && evidence.metadata?.subjectName) {
        candidateName = evidence.metadata.subjectName as string;
      } else if (subjectId === evidence.secondarySubjectId && evidence.metadata?.secondarySubjectName) {
        candidateName = evidence.metadata.secondarySubjectName as string;
      } else if (subjectId === 'char_maren') {
        candidateName = 'Archivist Maren';
      } else if (subjectId === 'char_elian') {
        candidateName = 'Elian the Wanderer';
      }

      let dossier = this.dossiers.get(subjectId);
      if (!dossier) {
        dossier = {
          subjectId,
          canonicalName: candidateName,
          dossierVersion: 1,
          lastEvaluatedTimestamp: evidence.timestamp,
          milestones: [],
          promotedEvidenceIds: [],
          knownAliases: [],
          publicReputationSummary: 'Observed active entity.',
        };
        this.dossiers.set(subjectId, dossier);
      } else if (dossier.canonicalName === subjectId && candidateName !== subjectId) {
        dossier.canonicalName = candidateName;
      }

      if (!dossier.promotedEvidenceIds.includes(evidence.id)) {
        dossier.promotedEvidenceIds.push(evidence.id);

        const milestone: DossierMilestone = {
          id: `milestone_${evidence.id}_${subjectId}`,
          evidenceId: evidence.id,
          timestamp: evidence.timestamp,
          category: evidence.category,
          significance,
          title: evidence.summary,
          summary: evidence.details,
          visibility: evidence.visibility,
          sourceProvenance: evidence.provenance,
        };

        dossier.milestones.push(milestone);
        // Maintain deterministic temporal ordering (timestamp elapsed seconds)
        dossier.milestones.sort(
          (a, b) => a.timestamp.totalElapsedSeconds - b.timestamp.totalElapsedSeconds
        );

        dossier.dossierVersion += 1;
        dossier.lastEvaluatedTimestamp = evidence.timestamp;
      }
    }
  }

  private promoteToChronicle(evidence: HistoricalEvidence, significance: import('./historicalEvidence').SignificanceLevel): void {
    if (this.chronicleEntries.has(evidence.id)) return;

    const involved = [evidence.primarySubjectId];
    if (evidence.secondarySubjectId && !involved.includes(evidence.secondarySubjectId)) {
      involved.push(evidence.secondarySubjectId);
    }

    const entry: ChronicleEntry = {
      id: `chronicle_${evidence.id}`,
      evidenceId: evidence.id,
      timestamp: evidence.timestamp,
      category: evidence.category,
      significance,
      locationId: evidence.locationId,
      headline: evidence.summary,
      historicalAccount: evidence.details,
      involvedEntityIds: involved,
      visibility: evidence.visibility,
      provenance: evidence.provenance,
    };

    this.chronicleEntries.set(evidence.id, entry);
  }

  public getDossier(subjectId: string): NpcDossier | undefined {
    const d = this.dossiers.get(subjectId);
    return d ? JSON.parse(JSON.stringify(d)) : undefined;
  }

  public getAllDossiers(): NpcDossier[] {
    return Array.from(this.dossiers.values()).map((d) => JSON.parse(JSON.stringify(d)));
  }

  public getChronicleEntries(): ChronicleEntry[] {
    return Array.from(this.chronicleEntries.values())
      .sort((a, b) => a.timestamp.totalElapsedSeconds - b.timestamp.totalElapsedSeconds)
      .map((e) => JSON.parse(JSON.stringify(e)));
  }

  public getTimeline(): ChronicleEntry[] {
    return this.getChronicleEntries();
  }

  /**
   * Deterministic Rebuild (Invariant 5)
   * Completely reconstructs all dossiers and chronicle entries from the raw evidence store.
   */
  public rebuildFromEvidence(): void {
    this.dossiers.clear();
    this.chronicleEntries.clear();

    const sortedEvidence = Array.from(this.evidenceStore.values()).sort(
      (a, b) => a.timestamp.totalElapsedSeconds - b.timestamp.totalElapsedSeconds
    );

    for (const ev of sortedEvidence) {
      const evaluation = SignificanceEvaluator.evaluate(ev);
      if (evaluation.promotedToDossier) {
        this.promoteToDossier(ev, evaluation.significance);
      }
      if (evaluation.promotedToChronicle) {
        this.promoteToChronicle(ev, evaluation.significance);
      }
    }
  }

  /**
   * Returns all historical evidence visible to the given actor based on epistemic visibility rules.
   */
  public getEpistemicEvidence(viewerActorId?: string): HistoricalEvidence[] {
    return Array.from(this.evidenceStore.values()).filter((ev) => {
      if (!viewerActorId) return true;
      if (ev.visibility === 'PUBLIC') return true;

      if (
        (ev.visibility === 'OBSERVERS_ONLY' || ev.visibility === 'SECRET')
        && ev.confidentialToEntityIds?.includes(viewerActorId)
      ) {
        return true;
      }

      if (ev.visibility === 'FACTION') {
        return ev.primarySubjectId === viewerActorId
          || ev.secondarySubjectId === viewerActorId;
      }

      return ev.primarySubjectId === viewerActorId || ev.secondarySubjectId === viewerActorId;
    });
  }

  /**
   * Epistemic Projection for Client (CH4 Phase 4 / Invariant 4)
   * Transforms raw dossiers and chronicle entries into player-safe views.
   * Excludes SECRET or OBSERVERS_ONLY entries unless the player is explicitly in confidentialToEntityIds.
   */
  public projectPlayerChronicle(playerId: string): ChronicleEntry[] {
    return this.getChronicleEntries().filter((entry) => {
      if (entry.visibility === 'PUBLIC') return true;
      if (entry.visibility === 'OBSERVERS_ONLY' || entry.visibility === 'SECRET') {
        const evidence = this.evidenceStore.get(entry.evidenceId);
        if (!evidence) return false;
        return evidence.confidentialToEntityIds?.includes(playerId) ?? false;
      }
      return true;
    });
  }

  public projectPlayerDossier(subjectId: string, playerId: string): NpcDossier | undefined {
    const raw = this.dossiers.get(subjectId);
    if (!raw) return undefined;

    const visibleMilestones = raw.milestones.filter((m) => {
      if (m.visibility === 'PUBLIC') return true;
      if (m.visibility === 'OBSERVERS_ONLY' || m.visibility === 'SECRET') {
        const evidence = this.evidenceStore.get(m.evidenceId);
        if (!evidence) return false;
        return evidence.confidentialToEntityIds?.includes(playerId) ?? false;
      }
      return true;
    });

    return {
      ...raw,
      milestones: visibleMilestones,
    };
  }

  /**
   * Lossless Campaign Archive Export (DEF-CH13-02)
   */
  public exportState(): {
    evidenceStore: HistoricalEvidence[];
    dossiers: NpcDossier[];
    chronicleEntries: ChronicleEntry[];
  } {
    return {
      evidenceStore: Array.from(this.evidenceStore.values()).map((e) => ({ ...e })),
      dossiers: this.getAllDossiers(),
      chronicleEntries: this.getChronicleEntries(),
    };
  }

  /**
   * Lossless Campaign Archive Restore (DEF-CH13-02)
   */
  public importState(state: {
    evidenceStore?: HistoricalEvidence[];
    dossiers?: NpcDossier[];
    chronicleEntries?: ChronicleEntry[];
  }): void {
    if (!state) return;
    this.evidenceStore.clear();
    this.dossiers.clear();
    this.chronicleEntries.clear();

    if (Array.isArray(state.evidenceStore)) {
      for (const ev of state.evidenceStore) {
        this.evidenceStore.set(ev.id, { ...ev });
      }
    }

    if (Array.isArray(state.dossiers) && state.dossiers.length > 0) {
      for (const d of state.dossiers) {
        this.dossiers.set(d.subjectId, JSON.parse(JSON.stringify(d)));
      }
    }

    if (Array.isArray(state.chronicleEntries) && state.chronicleEntries.length > 0) {
      for (const c of state.chronicleEntries) {
        this.chronicleEntries.set(c.evidenceId, JSON.parse(JSON.stringify(c)));
      }
    }

    if ((!state.dossiers || state.dossiers.length === 0) && this.evidenceStore.size > 0) {
      this.rebuildFromEvidence();
    }
  }
}