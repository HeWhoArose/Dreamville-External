export type KnowledgeStatus = 'UNKNOWN' | 'KNOWN' | 'SUSPECTED' | 'DISPROVED';
export interface KnowledgeFact { id: string; subjectEntityId: string; predicate: string; objectValue: string; status: KnowledgeStatus; confidence: number; sourceEvidenceIds: string[]; acquiredAtSeconds: number; }
export interface KnowledgeState { schemaVersion: number; actorId: string; facts: Record<string, KnowledgeFact>; }
export interface KnowledgeAcquisition { actorId: string; factId: string; evidenceId: string; method: 'OBSERVATION' | 'REPORT' | 'SEARCH' | 'INTERROGATION' | 'INFERENCE' | 'SYSTEM'; success: boolean; confidence: number; nowSeconds: number; }
export class KnowledgeEngine {
	public createState(actorId: string): KnowledgeState { return { schemaVersion: 1, actorId, facts: {} }; }
	public acquire(state: KnowledgeState, fact: KnowledgeFact, acquisition: KnowledgeAcquisition): boolean {
		if (!acquisition.success || acquisition.actorId !== state.actorId || acquisition.factId !== fact.id) return false;
		const current = state.facts[fact.id];
		const merged: KnowledgeFact = { ...fact, status: fact.status === 'UNKNOWN' ? 'KNOWN' : fact.status, confidence: Math.max(current?.confidence ?? 0, Math.min(1, acquisition.confidence)), sourceEvidenceIds: Array.from(new Set([...(current?.sourceEvidenceIds || []), acquisition.evidenceId])), acquiredAtSeconds: current?.acquiredAtSeconds ?? acquisition.nowSeconds };
		state.facts[fact.id] = merged;
		return true;
	}
	public knows(state: KnowledgeState, factId: string): boolean { return state.facts[factId]?.status === 'KNOWN'; }
	public believes(state: KnowledgeState, factId: string): boolean { return ['KNOWN', 'SUSPECTED'].includes(state.facts[factId]?.status || ''); }
	public forget(state: KnowledgeState, factId: string): boolean { if (!state.facts[factId]) return false; state.facts[factId].status = 'UNKNOWN'; return true; }
	public serialize(state: KnowledgeState): KnowledgeState { return JSON.parse(JSON.stringify(state)); }
}
