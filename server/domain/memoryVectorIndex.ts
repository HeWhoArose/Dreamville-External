import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DurableMemory } from './memoryOpportunityEngine';

/**
 * Phase B (GAP-2) — optional semantic memory retrieval.
 *
 * The memory engine's baseline retrieval is literal/keyword overlap. This module
 * adds a provider-gated embedding index so paraphrase/synonym queries ("blade")
 * can reach a memory stored as "sword". It is a strict enhancement:
 *
 *  - With **zero** embedding-capable models registered, every entry point is a
 *    no-op: `prepareEmbeddingContext` returns `{}` and retrieval is byte-identical
 *    to the keyword baseline. This is the free/cheap-tier production path.
 *  - With an embedding model present, retrieval fuses cosine similarity with the
 *    existing recency/importance signals (see `MemoryOpportunityEngine.retrieveMemories`).
 *
 * Deterministic cache key: `${storyId}::${memoryId}::${modelKey}` plus a content
 * hash, so re-indexing is skipped unless the memory text or model changed.
 */

export type EmbeddingVector = number[];

export interface EmbeddingProvider {
	providerId?: string;
	modelId?: string;
	modelKey: string;
	embed(texts: string[]): Promise<EmbeddingVector[]>;
}

export interface MemoryVectorRecord {
	memoryId: string;
	vector: EmbeddingVector;
	modelKey: string;
	contentHash: string;
	updatedAt: string;
}

export interface EmbeddingProviderDescriptor {
	available: boolean;
	providerId?: string;
	modelId?: string;
	modelKey?: string;
}

export interface EmbeddingPreparationResult {
	/** Cosine similarities (0..1) per memory id; absent when no provider is available. */
	similarities?: Record<string, number>;
	/** The embedded query vector, if a provider is available. */
	queryVector?: EmbeddingVector;
	indexedCount?: number;
}

/** Structural view of the model registry needed for embedding detection. */
export interface EmbeddingCapableRegistry {
	getAllModels?: () => Array<Record<string, any>>;
	getDiscoveredCatalog?: () => Array<Record<string, any>>;
}

function isEmbeddingCapableEntry(entry: Record<string, any> | undefined | null): boolean {
	if (!entry) return false;
	const haystack = [entry.modelId, entry.id, entry.name, entry.displayName]
		.filter((value) => typeof value === 'string' && value.length > 0)
		.join(' ');
	if (/embed/i.test(haystack)) return true;
	const capabilities = Array.isArray(entry.capabilities) ? entry.capabilities.map((value: unknown) => String(value)) : [];
	if (capabilities.some((capability) => /embed/i.test(capability))) return true;
	const actions = Array.isArray(entry.supportedActions) ? entry.supportedActions.map((value: unknown) => String(value)) : [];
	return actions.length > 0 && actions.every((action) => /embed/i.test(action));
}

/**
 * Detect an embedding-capable model from the generative registry *and* the raw
 * discovery catalog (embedding models are intentionally excluded from the
 * generative registry, so the catalog is the authoritative source).
 */
export function detectEmbeddingProvider(orchestrator?: EmbeddingCapableRegistry | null): EmbeddingProviderDescriptor {
	if (!orchestrator) return { available: false };
	const candidates: Array<Record<string, any>> = [];
	try {
		candidates.push(...(orchestrator.getAllModels?.() || []));
	} catch {
		// Best-effort detection; a registry error disables embeddings rather than failing retrieval.
	}
	try {
		candidates.push(...(orchestrator.getDiscoveredCatalog?.() || []));
	} catch {
		// See above.
	}
	const match = candidates.find((entry) => isEmbeddingCapableEntry(entry));
	if (!match) return { available: false };
	const providerId = String(match.providerId || match.provider || 'unknown');
	const modelId = String(match.modelId || match.id || match.name || 'unknown');
	return { available: true, providerId, modelId, modelKey: `${providerId}::${modelId}` };
}

/** Deterministic 32-bit FNV-1a hash (stable across processes and test runs). */
export function deterministicContentHash(text: string): string {
	let hash = 0x811c9dc5;
	const value = String(text ?? '');
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `fnv1a_${hash.toString(16).padStart(8, '0')}_${value.length}`;
}

/** Cosine similarity in [-1, 1]; 0 when either vector has zero magnitude. */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
	if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let index = 0; index < a.length; index += 1) {
		const x = Number(a[index]) || 0;
		const y = Number(b[index]) || 0;
		dot += x * y;
		magA += x * x;
		magB += y * y;
	}
	if (magA === 0 || magB === 0) return 0;
	return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Map cosine [-1, 1] into a monotonic 0..1 retrieval signal. */
export function similarity01(cosine: number): number {
	const value = Number.isFinite(cosine) ? cosine : 0;
	return Math.max(0, Math.min(1, (value + 1) / 2));
}

interface PersistedIndexShape {
	version: number;
	generatedAt: string;
	records: Array<MemoryVectorRecord & { storyId: string }>;
}

export class MemoryVectorIndex {
	private readonly records = new Map<string, MemoryVectorRecord>();
	private provider: EmbeddingProvider | null = null;
	private filePath: string | null = null;

	private static key(storyId: string, memoryId: string): string {
		return `${storyId}::${memoryId}`;
	}

	public isAvailable(): boolean {
		return this.provider !== null;
	}

	public setProvider(provider: EmbeddingProvider | null): void {
		this.provider = provider;
	}

	public getProvider(): EmbeddingProvider | null {
		return this.provider;
	}

	public getVector(storyId: string, memoryId: string): EmbeddingVector | undefined {
		return this.records.get(MemoryVectorIndex.key(storyId, memoryId))?.vector;
	}

	public hasFreshVector(storyId: string, memoryId: string, text: string): boolean {
		const record = this.records.get(MemoryVectorIndex.key(storyId, memoryId));
		return Boolean(record && record.contentHash === deterministicContentHash(text) && (!this.provider || record.modelKey === this.provider.modelKey));
	}

	public size(storyId?: string): number {
		if (!storyId) return this.records.size;
		let count = 0;
		for (const [key] of this.records) if (key.startsWith(`${storyId}::`)) count += 1;
		return count;
	}

	public async indexMemories(storyId: string, memories: Array<Pick<DurableMemory, 'id' | 'content'>>): Promise<number> {
		const provider = this.provider;
		if (!provider || memories.length === 0) return 0;
		const pending = memories.filter((memory) => memory?.id && typeof memory.content === 'string' && !this.hasFreshVector(storyId, memory.id, memory.content));
		if (pending.length === 0) return 0;
		let indexed = 0;
		try {
			const vectors = await provider.embed(pending.map((memory) => memory.content));
			const updatedAt = new Date(0).toISOString();
			pending.forEach((memory, index) => {
				const vector = vectors[index];
				if (!Array.isArray(vector) || vector.length === 0) return;
				this.records.set(MemoryVectorIndex.key(storyId, memory.id), {
					memoryId: memory.id,
					vector: [...vector],
					modelKey: provider.modelKey,
					contentHash: deterministicContentHash(memory.content),
					updatedAt,
				});
				indexed += 1;
			});
		} catch {
			return 0; // Graceful no-op: embeddings never break retrieval.
		}
		// Phase C audit (C-FIND-1): the persisted index was loaded but never written, so
		// every process start re-embedded the whole memory set. Persist only when the
		// vector set actually changed, bounded to one write per turn.
		if (indexed > 0 && this.filePath) this.saveToFile();
		return indexed;
	}

	public removeMemory(storyId: string, memoryId: string): void {
		this.records.delete(MemoryVectorIndex.key(storyId, memoryId));
	}

	public clearStory(storyId: string): void {
		for (const key of [...this.records.keys()]) {
			if (key.startsWith(`${storyId}::`)) this.records.delete(key);
		}
	}

	public similarityFor(storyId: string, memoryId: string, queryVector: EmbeddingVector): number | undefined {
		const record = this.records.get(MemoryVectorIndex.key(storyId, memoryId));
		if (!record) return undefined;
		return similarity01(cosineSimilarity(record.vector, queryVector));
	}

	public search(storyId: string, queryVector: EmbeddingVector, limit = 5): Array<{ memoryId: string; similarity: number }> {
		const results: Array<{ memoryId: string; similarity: number }> = [];
		for (const [key, record] of this.records) {
			if (!key.startsWith(`${storyId}::`)) continue;
			results.push({ memoryId: record.memoryId, similarity: similarity01(cosineSimilarity(record.vector, queryVector)) });
		}
		return results
			.sort((a, b) => b.similarity - a.similarity || a.memoryId.localeCompare(b.memoryId))
			.slice(0, Math.max(1, limit));
	}

	/**
	 * Async retrieval preparation for the live narration path. Returns `{}` when no
	 * provider is connected (the default), so callers can pass the result straight
	 * through and keyword retrieval is unchanged.
	 */
	public async prepareEmbeddingContext(
		storyId: string,
		queryText: string,
		memories: Array<Pick<DurableMemory, 'id' | 'content'>>,
	): Promise<EmbeddingPreparationResult> {
		const provider = this.provider;
		if (!provider) return {};
		let indexedCount = 0;
		try {
			indexedCount = await this.indexMemories(storyId, memories);
			const query = String(queryText || '').trim();
			if (!query) return { indexedCount };
			const [queryVector] = await provider.embed([query]);
			if (!Array.isArray(queryVector) || queryVector.length === 0) return { indexedCount };
			const similarities: Record<string, number> = {};
			for (const memory of memories) {
				const value = this.similarityFor(storyId, memory.id, queryVector);
				if (value !== undefined) similarities[memory.id] = value;
			}
			return { similarities, queryVector, indexedCount };
		} catch {
			return { indexedCount };
		}
	}

	public attachFileStore(filePath: string): void {
		this.filePath = filePath;
	}

	public toJSON(): PersistedIndexShape {
		return {
			version: 1,
			generatedAt: new Date(0).toISOString(),
			records: [...this.records.entries()].map(([key, record]) => {
				const separator = key.indexOf('::');
				return {
					...record,
					storyId: separator >= 0 ? key.slice(0, separator) : key,
				};
			}),
		};
	}

	public importJSON(data: Partial<PersistedIndexShape> | null | undefined): void {
		this.records.clear();
		const records = Array.isArray(data?.records) ? data!.records : [];
		for (const record of records) {
			if (!record || typeof record.storyId !== 'string' || typeof record.memoryId !== 'string' || !Array.isArray(record.vector)) continue;
			this.records.set(MemoryVectorIndex.key(record.storyId, record.memoryId), {
				memoryId: record.memoryId,
				vector: [...record.vector],
				modelKey: String(record.modelKey || 'unknown'),
				contentHash: String(record.contentHash || ''),
				updatedAt: String(record.updatedAt || ''),
			});
		}
	}

	public loadFromFile(): boolean {
		if (!this.filePath || !existsSync(this.filePath)) return false;
		try {
			this.importJSON(JSON.parse(readFileSync(this.filePath, 'utf-8')));
			return true;
		} catch {
			return false;
		}
	}

	public saveToFile(): boolean {
		if (!this.filePath) return false;
		try {
			mkdirSync(dirname(this.filePath), { recursive: true });
			writeFileSync(this.filePath, JSON.stringify(this.toJSON()), 'utf-8');
			return true;
		} catch {
			return false;
		}
	}
}

export interface GeminiEmbeddingClient {
	models: {
		embedContent(args: { model: string; contents: string[] }): Promise<{ embeddings?: Array<{ values?: number[] }> }>;
	};
}

/**
 * Optional real embedding adapter. Only constructed by an explicit bootstrap when an
 * embedding-capable model and a client are available; the default server wiring has
 * none, so retrieval stays on the keyword baseline (graceful no-op).
 */
export function createGeminiEmbeddingProvider(params: {
	client: GeminiEmbeddingClient;
	modelId: string;
	providerId?: string;
}): EmbeddingProvider {
	const providerId = params.providerId || 'google_gemini';
	return {
		providerId,
		modelId: params.modelId,
		modelKey: `${providerId}::${params.modelId}`,
		async embed(texts: string[]): Promise<EmbeddingVector[]> {
			const response = await params.client.models.embedContent({ model: params.modelId, contents: texts });
			const embeddings = response?.embeddings || [];
			return embeddings.map((entry) => (Array.isArray(entry?.values) ? entry!.values! : []));
		},
	};
}

/** Idempotent bootstrap: detect the embedding model and attach a provider when given a client. */
export function initializeMemoryVectorIndex(params: {
	orchestrator?: EmbeddingCapableRegistry | null;
	client?: GeminiEmbeddingClient | null;
	filePath?: string | null;
}): EmbeddingProviderDescriptor {
	const descriptor = detectEmbeddingProvider(params.orchestrator);
	if (params.filePath) memoryVectorIndex.attachFileStore(params.filePath);
	if (descriptor.available && params.client && descriptor.modelId) {
		memoryVectorIndex.setProvider(createGeminiEmbeddingProvider({
			client: params.client,
			modelId: descriptor.modelId,
			providerId: descriptor.providerId,
		}));
		memoryVectorIndex.loadFromFile();
	} else {
		memoryVectorIndex.setProvider(null);
	}
	return descriptor;
}

export const memoryVectorIndex = new MemoryVectorIndex();
