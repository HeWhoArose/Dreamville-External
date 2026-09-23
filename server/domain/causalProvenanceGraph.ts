export type CausalRelation = 'STOLE' | 'TRANSFERRED' | 'SOLD' | 'COPIED' | 'DERIVED_FROM' | 'MODIFIED' | 'MANUFACTURED_FROM' | 'USED' | 'CAUSED' | 'DISCOVERED' | 'REPORTED' | 'SUSPECTED' | 'ATTRIBUTED_TO';
export interface CausalNode { id: string; kind: string; label: string; metadata: Record<string, unknown>; }
export interface CausalEdge { id: string; fromId: string; toId: string; relation: CausalRelation; eventId: string; timestampSeconds: number; confidence: number; metadata: Record<string, unknown>; }
export interface CausalGraphState { schemaVersion: number; nodes: Record<string, CausalNode>; edges: Record<string, CausalEdge>; }
export class CausalProvenanceGraph {
	public create(): CausalGraphState { return { schemaVersion: 1, nodes: {}, edges: {} }; }
	public upsertNode(state: CausalGraphState, node: CausalNode): void { state.nodes[node.id] = { ...node, metadata: { ...node.metadata } }; }
	public addEdge(state: CausalGraphState, edge: CausalEdge): void {
		if (!state.nodes[edge.fromId] || !state.nodes[edge.toId]) throw new Error('Causal edge endpoints must exist.');
		state.edges[edge.id] = { ...edge, metadata: { ...edge.metadata } };
	}
	public traceBack(state: CausalGraphState, nodeId: string, relations?: CausalRelation[]): CausalEdge[] {
		const allowed = relations ? new Set(relations) : undefined;
		const result: CausalEdge[] = [];
		const visited = new Set<string>();
		const walk = (id: string) => {
			for (const edge of Object.values(state.edges).filter((e) => e.toId === id).sort((a,b) => a.timestampSeconds-b.timestampSeconds || a.id.localeCompare(b.id))) {
				if (allowed && !allowed.has(edge.relation)) continue;
				if (visited.has(edge.id)) continue;
				visited.add(edge.id); result.push(edge); walk(edge.fromId);
			}
		};
		walk(nodeId);
		return result;
	}
	public traceForward(state: CausalGraphState, nodeId: string, relations?: CausalRelation[]): CausalEdge[] {
		const allowed = relations ? new Set(relations) : undefined;
		const result: CausalEdge[] = []; const visited = new Set<string>();
		const walk = (id: string) => {
			for (const edge of Object.values(state.edges).filter((e) => e.fromId === id).sort((a,b)=>a.timestampSeconds-b.timestampSeconds || a.id.localeCompare(b.id))) {
				if (allowed && !allowed.has(edge.relation)) continue;
				if (visited.has(edge.id)) continue;
				visited.add(edge.id); result.push(edge); walk(edge.toId);
			}
		};
		walk(nodeId); return result;
	}
	public serialize(state: CausalGraphState): CausalGraphState { return JSON.parse(JSON.stringify(state)); }
}
