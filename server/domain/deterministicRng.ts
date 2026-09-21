export interface DeterministicRngState {
	seed: number;
	state: number;
	cursor: number;
}

function normalizeSeed(seed: number): number {
	const normalized = Number.isFinite(seed) ? Math.trunc(seed) : 1;
	const unsigned = normalized >>> 0;
	return unsigned === 0 ? 1 : unsigned;
}

export function hashStringToSeed(input: string): number {
	let hash = 2166136261 >>> 0;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return normalizeSeed(hash);
}

export function deterministicId(prefix: string, ...parts: unknown[]): string {
	const payload = parts.map((part) => {
		if (typeof part === 'string') return part;
		if (part === undefined) return 'undefined';
		return JSON.stringify(part);
	}).join('|');
	return `${prefix}_${hashStringToSeed(payload).toString(16).padStart(8, '0')}`;
}

/**
 * Seeded deterministic PRNG using Mulberry32 state transitions.
 * State is fully serializable so canonical snapshots can restore replay position.
 */
export class DeterministicRng {
	private readonly seed: number;
	private state: number;
	private cursor = 0;

	constructor(seed: number | string) {
		this.seed = typeof seed === 'string' ? hashStringToSeed(seed) : normalizeSeed(seed);
		this.state = this.seed;
	}

	public next(): number {
		this.state = (this.state + 0x6D2B79F5) >>> 0;
		let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		this.cursor += 1;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	public nextInt(minInclusive: number, maxInclusive: number): number {
		if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive) || maxInclusive < minInclusive) {
			throw new Error('Invalid deterministic RNG integer range.');
		}
		return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
	}

	public exportState(): DeterministicRngState {
		return {
			seed: this.seed,
			state: this.state,
			cursor: this.cursor,
		};
	}

	public importState(snapshot: DeterministicRngState): void {
		if (!snapshot || !Number.isFinite(snapshot.state) || !Number.isInteger(snapshot.cursor)) {
			throw new Error('Invalid deterministic RNG state.');
		}
		this.state = snapshot.state >>> 0;
		this.cursor = Math.max(0, snapshot.cursor);
	}

	public getSeed(): number {
		return this.seed;
	}

	public getState(): number {
		return this.state;
	}

	public getCursor(): number {
		return this.cursor;
	}
}
