export interface RelationshipState { sourceId: string; targetId: string; trust: number; affinity: number; fear: number; respect: number; hostility: number; history: string[]; }
export interface ConsequenceRecord { id: string; sourceEventId: string; actorId?: string; targetId?: string; tags: string[]; description: string; timestampSeconds: number; evidenceIds: string[]; }
export interface ConsequenceState { schemaVersion: number; relationships: Record<string, RelationshipState>; records: Record<string, ConsequenceRecord>; }
export class ConsequenceEngine {
	public create(): ConsequenceState { return { schemaVersion: 1, relationships: {}, records: {} }; }
	private key(a: string, b: string): string { return `${a}::${b}`; }
	public upsertRelationship(state: ConsequenceState, relation: RelationshipState): void { state.relationships[this.key(relation.sourceId, relation.targetId)] = JSON.parse(JSON.stringify(relation)); }
	public applyDelta(state: ConsequenceState, sourceEventId: string, actorId: string, targetId: string, delta: Partial<Pick<RelationshipState,'trust'|'affinity'|'fear'|'respect'|'hostility'>>, evidenceIds: string[], description: string, timestampSeconds: number): RelationshipState {
		const key=this.key(actorId,targetId); const current=state.relationships[key] || {sourceId:actorId,targetId,trust:0,affinity:0,fear:0,respect:0,hostility:0,history:[]};
		for (const field of ['trust','affinity','fear','respect','hostility'] as const) current[field]=Math.max(-100,Math.min(100,current[field]+(delta[field]||0)));
		current.history.push(sourceEventId); state.relationships[key]=current;
		state.records[sourceEventId]={id:sourceEventId,sourceEventId,actorId,targetId,tags:[],description,timestampSeconds,evidenceIds:[...evidenceIds]};
		return JSON.parse(JSON.stringify(current));
	}
	public serialize(state: ConsequenceState): ConsequenceState { return JSON.parse(JSON.stringify(state)); }
}
