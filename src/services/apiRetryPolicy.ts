/**
 * Limits automatic fetch retries to transient gateway/startup responses.
 * A JSON 503 may be an intentional application result (for example, narration AI
 * exhaustion) and must be returned to the caller instead of repeating expensive work.
 */
export function shouldRetryTransientHttpResponse(
	status: number,
	contentType: string,
	bodyPreview: string,
): boolean {
	if (status === 502 || status === 504) return true;
	if (status !== 503) return false;

	const contentTypeLower = String(contentType || '').toLowerCase();
	const body = String(bodyPreview || '').trim();
	const looksLikeJson = contentTypeLower.includes('application/json')
		|| body.startsWith('{')
		|| body.startsWith('[');
	if (looksLikeJson) return false;

	return contentTypeLower.includes('text/html')
		|| /^<!doctype\s+html/i.test(body)
		|| /^<html\b/i.test(body)
		|| /starting server|warmup\.html/i.test(body);
}
