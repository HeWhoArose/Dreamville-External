import type { FindingSeverity, GuardOutcome } from './narrationGuardPolicy';

/**
 * Per-turn narration quality record (reference study: Open Game Master `narrator-quality.ts`).
 *
 * One row per narrated turn, stored with the story run and read back as rates. "Clean" is computed when a report is built
 * and never stored, so a changed rule re-scores old turns.
 */
export interface NarrationQualityRecord {
	actionId?: string;
	at: string;
	accepted: boolean;
	outcome: GuardOutcome;
	/** Severity of the findings the guard saw, strongest first. */
	findings: Array<{ severity: FindingSeverity; reason: string }>;
	providerId?: string;
	modelId?: string;
	providerAttempts: number;
	repairUsed: boolean;
	reservedRepairUsed: boolean;
	durationMs?: number;
	errorCode?: string;
}

const MAX_RECORDS = 200;

const store = new Map<string, NarrationQualityRecord[]>();

/**
 * Records one narrated turn. Kept in memory per story (bounded); it is deliberately not written into the story run during
 * the unlocked narration phase, where a second writer could race the locked finalize step.
 */
export function recordNarrationQuality(storyId: string, record: NarrationQualityRecord): void {
	const rows = store.get(storyId) || [];
	rows.push(record);
	store.set(storyId, rows.slice(-MAX_RECORDS));
}

export function getNarrationQuality(storyId: string): NarrationQualityRecord[] {
	return [...(store.get(storyId) || [])];
}

export function clearNarrationQuality(storyId?: string): void {
	if (storyId) store.delete(storyId);
	else store.clear();
}

/** A turn is clean when it was narrated and the guard stayed quiet (or had nothing to read). */
export function isCleanTurn(record: NarrationQualityRecord): boolean {
	return record.accepted && (record.outcome === 'quiet' || record.outcome === 'none');
}

export interface NarrationQualityReport {
	turns: number;
	accepted: number;
	clean: number;
	cleanRate: number | null;
	acceptedRate: number | null;
	byOutcome: Partial<Record<GuardOutcome, number>>;
	/** Most frequent reasons among turns the guard acted on, strongest first. */
	topReasons: Array<{ reason: string; count: number }>;
	repairUsed: number;
	reservedRepairUsed: number;
	averageProviderAttempts: number | null;
}

export function buildNarrationQualityReport(rows: readonly NarrationQualityRecord[]): NarrationQualityReport {
	const byOutcome: Partial<Record<GuardOutcome, number>> = {};
	const reasons = new Map<string, number>();
	let accepted = 0;
	let clean = 0;
	let repairUsed = 0;
	let reservedRepairUsed = 0;
	let attempts = 0;
	for (const row of rows) {
		byOutcome[row.outcome] = (byOutcome[row.outcome] || 0) + 1;
		if (row.accepted) accepted += 1;
		if (isCleanTurn(row)) clean += 1;
		if (row.repairUsed) repairUsed += 1;
		if (row.reservedRepairUsed) reservedRepairUsed += 1;
		attempts += row.providerAttempts;
		for (const finding of row.findings) {
			const key = finding.reason.slice(0, 110);
			reasons.set(key, (reasons.get(key) || 0) + 1);
		}
	}
	return {
		turns: rows.length,
		accepted,
		clean,
		cleanRate: rows.length ? clean / rows.length : null,
		acceptedRate: rows.length ? accepted / rows.length : null,
		byOutcome,
		topReasons: Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
		repairUsed,
		reservedRepairUsed,
		averageProviderAttempts: rows.length ? attempts / rows.length : null,
	};
}
