/**
 * Phase D1 (GAP-8 / S-8) — rejected-response shape capture.
 *
 * The attempts trail historically stored only a status, a latency and a free-text
 * error string per provider candidate. That makes a rejected model response
 * impossible to triage without a grep + repro: we could see *that* validation
 * failed, but not *what the model actually returned* (malformed envelope vs
 * well-formed JSON that failed a semantic check vs plain prose vs a truncated
 * stream).
 *
 * This module adds a compact, size-capped shape descriptor to failed attempts:
 *   { provider, modelId, validationErrorReason, normalized-vs-rejected marker, sample }
 *
 * Bounds (deliberate, to protect the telemetry payload):
 *   - at most MAX_REJECTED_SHAPE_ENTRIES_PER_TURN shape descriptors per turn
 *   - at most MAX_REJECTED_SHAPE_SAMPLE_CHARS characters of raw sample each
 */

export const MAX_REJECTED_SHAPE_SAMPLE_CHARS = 2048;
export const MAX_REJECTED_SHAPE_ENTRIES_PER_TURN = 5;

/** What the rejected response physically looked like. */
export type RejectedResponseShapeKind =
	| 'EMPTY'
	| 'JSON_PARSED'
	| 'MALFORMED_JSON'
	| 'TRUNCATED_JSON'
	| 'PLAIN_TEXT'
	| 'OTHER';

/** Whether the response matched the expected structured shape or was foreign. */
export type RejectedResponseMarker = 'NORMALIZED' | 'REJECTED';

export interface RejectedResponseShape {
	/** Physical shape of the rejected text. */
	kind: RejectedResponseShapeKind;
	/** NORMALIZED when the response matched the expected structured envelope but
	 *  failed a later (semantic/schema) check; REJECTED when it did not. */
	marker: RejectedResponseMarker;
	/** True when the payload was the expected structured shape. */
	normalized: boolean;
	/** Reason string from the validator that rejected the attempt. */
	validationErrorReason?: string;
	/** Character count of the raw response before truncation. */
	rawLength: number;
	/** Truncated raw sample (<= MAX_REJECTED_SHAPE_SAMPLE_CHARS). */
	sample: string;
	/** True when `sample` was cut down from a larger raw response. */
	sampleTruncated: boolean;
}

export interface ProviderAttemptTrailEntry {
	providerId: string;
	modelId: string;
	displayName?: string;
	status: 'SUCCESS' | 'FAILED';
	latencyMs: number;
	error?: string;
	/** Phase D1: shape of the rejected response (FAILED attempts only). */
	rejectedShape?: RejectedResponseShape;
}

/** Count how many trail entries already carry a captured shape. */
export function countCapturedShapes(trail: ReadonlyArray<ProviderAttemptTrailEntry>): number {
	let count = 0;
	for (const entry of trail) if (entry.rejectedShape) count += 1;
	return count;
}

function looksTruncatedJson(text: string): boolean {
	// Cheap truncation heuristic: an opening JSON envelope that never closes,
	// or a trailing dangling token. Avoids parsing (already known to fail).
	const opens = (text.match(/[{\[]/g) || []).length;
	const closes = (text.match(/[}\]]/g) || []).length;
	if (opens > closes) return true;
	if (/[,:"'`[{]\s*$/.test(text)) return true;
	return false;
}

/**
 * Classify a rejected provider response into a compact shape descriptor.
 * Pure and deterministic so it can be unit-tested and called on the hot path
 * without cost beyond a bounded slice.
 */
export function classifyRejectedResponseShape(
	rawText: string | undefined | null,
	validationErrorReason?: string,
): RejectedResponseShape {
	const raw = typeof rawText === 'string' ? rawText : '';
	const trimmed = raw.trim();
	const sampleTruncated = raw.length > MAX_REJECTED_SHAPE_SAMPLE_CHARS;
	const sample = sampleTruncated ? raw.slice(0, MAX_REJECTED_SHAPE_SAMPLE_CHARS) : raw;
	const base = { validationErrorReason, rawLength: raw.length, sample, sampleTruncated };

	if (trimmed.length === 0) {
		return { ...base, kind: 'EMPTY', marker: 'REJECTED', normalized: false };
	}

	const startsJsonEnvelope = trimmed.startsWith('{') || trimmed.startsWith('[');
	if (startsJsonEnvelope) {
		try {
			JSON.parse(trimmed);
			// Parses cleanly: the provider produced the expected structured shape,
			// so this is a NORMALIZED payload rejected by a later check.
			return { ...base, kind: 'JSON_PARSED', marker: 'NORMALIZED', normalized: true };
		} catch {
			return {
				...base,
				kind: looksTruncatedJson(trimmed) ? 'TRUNCATED_JSON' : 'MALFORMED_JSON',
				marker: 'REJECTED',
				normalized: false,
			};
		}
	}

	// Long free prose that is not JSON is a shape the plain-text narration path
	// could legitimately accept; classify it distinctly from malformed JSON.
	if (/\s/.test(trimmed) && trimmed.length >= 40) {
		return { ...base, kind: 'PLAIN_TEXT', marker: 'REJECTED', normalized: false };
	}

	return { ...base, kind: 'OTHER', marker: 'REJECTED', normalized: false };
}

/**
 * Push a FAILED attempt onto the trail, attaching a shape descriptor when the
 * per-turn cap has not been reached. Returns the entry so callers can reuse it.
 */
export function captureRejectedAttempt(
	trail: ProviderAttemptTrailEntry[],
	entry: Omit<ProviderAttemptTrailEntry, 'rejectedShape' | 'status'> & { error?: string },
	rawText: string | undefined | null,
): ProviderAttemptTrailEntry {
	const shaped: ProviderAttemptTrailEntry = { ...entry, status: 'FAILED' };
	if (countCapturedShapes(trail) < MAX_REJECTED_SHAPE_ENTRIES_PER_TURN) {
		shaped.rejectedShape = classifyRejectedResponseShape(rawText, entry.error);
	}
	trail.push(shaped);
	return shaped;
}
